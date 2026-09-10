/**
 * POST /api/webhooks/razorpay — Razorpay telling us money moved.
 *
 * **This is the mechanism, not an optimisation** — the opposite of the Bunny
 * webhook next door. A student who pays and closes the tab before the browser
 * can call `/api/payments/verify` is let in by this route and nothing else, and
 * every future instalment on a subscription happens with no browser open at
 * all. Without it, payments only settle when somebody happens to be looking.
 *
 * ## Verification
 *
 * `HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)` in `X-Razorpay-Signature`,
 * compared in constant time. Three things are load-bearing, and two of them are
 * the same ones the Bunny route calls out:
 *
 * - the body is read as **text** and hashed as the exact bytes that arrived.
 *   `request.json()` here would reorder keys and change whitespace, and the
 *   hash would then never match;
 * - an unverifiable call is refused, not trusted. This URL is public, and
 *   without the check anyone who guessed it could unlock a program for free;
 * - the webhook secret is **not** the API key secret. It is a value you choose
 *   yourself when adding the webhook in the Razorpay dashboard.
 *
 * ## It always answers 200 once the signature checks out
 *
 * Even for an event we do not handle, and even for a payment belonging to no
 * row we know of. Razorpay retries a non-2xx for hours; a webhook retried
 * forever because we returned 404 for a test payment somebody made in the
 * dashboard is noise, not information. The one exception is a *handled* event
 * we failed to write, which is returned as a 500 so the retry is useful.
 *
 * ## Idempotency
 *
 * Retries and out-of-order delivery are normal, not exceptional. Nothing here
 * increments a counter — `capturePayment` moves a row's status with a
 * conditional update and the unique index on `razorpayPaymentId` backs it up.
 * See `lib/payments/settle.ts`.
 *
 * ## Events
 *
 * `payment.captured` and `payment.failed` today, which is the whole of the
 * one-time flow. The subscription events — `subscription.charged`, `.pending`,
 * `.halted`, `.cancelled` — arrive here too when EMI lands; they are listed in
 * the switch as unhandled rather than omitted, so the next person can see what
 * is expected and what is not yet wired.
 */
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import {
  capturePayment,
  captureSubscriptionCycle,
  failPayment,
} from "@/lib/payments/settle";

/** Every event carries this; it is how we find our own row. */
type RazorpayPaymentEntity = {
  id?: string;
  order_id?: string;
  amount?: number;
  method?: string;
  error_description?: string;
  notes?: Record<string, string>;
};

/**
 * The subscription half of the payload.
 *
 * **Its `notes` are not the payment's `notes`.** On a subscription event the
 * metadata we set at creation rides on *this* entity; `payload.payment.entity`
 * is the individual charge and carries none of it. Reading `payment.entity.notes`
 * on a `subscription.charged` — the obvious thing to do, having written the
 * order flow first — silently finds nothing, and every instalment goes
 * unrecorded while the webhook cheerfully returns 200.
 */
type RazorpaySubscriptionEntity = {
  id?: string;
  status?: string;
  paid_count?: number;
  remaining_count?: number;
  total_count?: number;
  notes?: Record<string, string>;
};

type WebhookBody = {
  event?: string;
  payload?: {
    payment?: { entity?: RazorpayPaymentEntity };
    subscription?: { entity?: RazorpaySubscriptionEntity };
  };
};

/** Razorpay is the actor on these rows, not a person. */
const RAZORPAY = { kind: "system" as const, label: "Razorpay" };

export async function POST(request: Request) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    console.warn(
      "[api/webhooks/razorpay] refused a call — RAZORPAY_WEBHOOK_SECRET is not set",
    );
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const signature = request.headers.get("X-Razorpay-Signature") ?? "";
  const rawBody = await request.text();

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("[api/webhooks/razorpay] rejected an unsigned or mis-signed call");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const event = body.event ?? "";
  const entity = body.payload?.payment?.entity;

  /**
   * Instalments go down their own path, because they are a different shape:
   * the ids we need are on the subscription entity, and there is no `Payment`
   * row waiting to be transitioned. See `handleSubscriptionEvent`.
   */
  if (event.startsWith("subscription.")) {
    return handleSubscriptionEvent(event, body);
  }

  switch (event) {
    case "payment.captured":
    case "payment.failed":
      break;

    default:
      return NextResponse.json({ ok: true });
  }

  /**
   * Our row's id, from the `notes` we set when the order was created.
   *
   * Not the order id, and not the receipt: `notes` survives on every payment
   * made against the order, and is one indexed lookup by primary key rather
   * than a scan. An event with no note is a payment that did not start here —
   * a dashboard test, a payment link — and is acknowledged and ignored.
   */
  const paymentId = entity?.notes?.paymentId;
  if (!paymentId) {
    console.info(
      `[api/webhooks/razorpay] ${event} with no paymentId note — ignoring`,
    );
    return NextResponse.json({ ok: true });
  }

  try {
    if (event === "payment.captured") {
      const outcome = await capturePayment({
        paymentId,
        razorpayPaymentId: entity?.id ?? "",
        method: entity?.method ?? null,
        // Razorpay's number, checked against ours. See capturePayment.
        amount: typeof entity?.amount === "number" ? entity.amount : null,
        actor: RAZORPAY,
      });

      if (outcome.result === "mismatch") {
        console.error(
          `[api/webhooks/razorpay] amount mismatch on ${paymentId}: ${outcome.reason}`,
        );
      }
    } else {
      await failPayment({
        paymentId,
        razorpayPaymentId: entity?.id ?? null,
        reason: entity?.error_description ?? "The payment failed.",
        actor: RAZORPAY,
      });
    }
  } catch (error) {
    // A handled event we could not write. 500 so Razorpay retries — this is the
    // one case where a retry is worth having.
    console.error(`[api/webhooks/razorpay] failed to settle ${paymentId}:`, error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * The instalment events.
 *
 * **This is the only thing that collects an EMI plan.** The one-time flow has
 * `/api/payments/verify` as a fast path because a student is sitting there
 * watching; month seven has nobody watching at all. If this route is not
 * reachable and correctly signed in production, instalments are authorised and
 * then never recorded — students pay and stay locked out.
 *
 * Every event here is acknowledged with a 200 once handled, including the ones
 * we only log. A 500 is reserved for a write we genuinely failed, where a retry
 * would help.
 */
async function handleSubscriptionEvent(
  event: string,
  body: WebhookBody,
): Promise<Response> {
  const subscription = body.payload?.subscription?.entity;
  const payment = body.payload?.payment?.entity;

  // Set when the subscription was created, and the only join back to us — see
  // the type above for why this is not read off the payment entity.
  const notes = subscription?.notes;
  const subscriptionId = subscription?.id ?? "";

  if (!notes?.enrollmentId || !subscriptionId) {
    console.info(
      `[api/webhooks/razorpay] ${event} with no enrolment note — ignoring`,
    );
    return NextResponse.json({ ok: true });
  }

  switch (event) {
    /**
     * Money arrived. The authorisation transaction fires this too, carrying the
     * down payment and the first cycle together.
     */
    case "subscription.charged": {
      /**
       * `paid_count` is Razorpay's own count of settled cycles, and the only
       * honest source for it. Defaulting to 1 rather than 0 matters: a row
       * recorded as cycle 0 would never register as an instalment in
       * `getFeeStatus`, which takes the highest `cycleNumber` seen.
       */
      const cycleNumber =
        typeof subscription?.paid_count === "number" && subscription.paid_count > 0
          ? subscription.paid_count
          : 1;

      try {
        const outcome = await captureSubscriptionCycle({
          enrollmentId: notes.enrollmentId,
          studentId: notes.studentId ?? "",
          programId: notes.programId ?? "",
          feePlanId: notes.feePlanId ?? "",
          subscriptionId,
          razorpayPaymentId: payment?.id ?? "",
          cycleNumber,
          // What Razorpay actually took. Never recomputed from the plan: if the
          // two ever disagree, the ledger must say what was charged.
          amount: typeof payment?.amount === "number" ? payment.amount : 0,
          method: payment?.method ?? null,
          actor: RAZORPAY,
        });

        if (outcome.result === "unknown") {
          console.warn(
            `[api/webhooks/razorpay] ${event} on ${subscriptionId} had unusable notes — ignoring`,
          );
        }
      } catch (error) {
        console.error(
          `[api/webhooks/razorpay] failed to record a cycle on ${subscriptionId}:`,
          error,
        );
        return NextResponse.json({ ok: false }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    /**
     * A debit failed and Razorpay is retrying, or has given up.
     *
     * Logged rather than written, deliberately. Nothing about the *ledger*
     * changes — no money moved, so no row belongs in a collection whose whole
     * purpose is recording money that did. What a student loses is future
     * access, and that already falls out of counting cycles: an unpaid month is
     * simply a month with no captured row.
     *
     * `halted` is the one somebody must act on — the retries are exhausted and
     * the plan is dead until a human intervenes. It is `console.error` so it
     * surfaces, and it is the natural place to hang a staff notification.
     */
    case "subscription.pending":
      console.warn(
        `[api/webhooks/razorpay] subscription ${subscriptionId} is PENDING — a debit failed, Razorpay is retrying (enrolment ${notes.enrollmentId})`,
      );
      return NextResponse.json({ ok: true });

    case "subscription.halted":
      console.error(
        `[api/webhooks/razorpay] subscription ${subscriptionId} is HALTED — retries exhausted, no further instalments will be collected (enrolment ${notes.enrollmentId})`,
      );
      return NextResponse.json({ ok: true });

    /**
     * Lifecycle milestones. None of them moves money, so none of them writes.
     * `completed` in particular is not the thing that marks a student paid up —
     * that is the sum of captured rows, and it will already have said so.
     */
    case "subscription.authenticated":
    case "subscription.activated":
    case "subscription.cancelled":
    case "subscription.completed":
    case "subscription.updated":
    case "subscription.paused":
    case "subscription.resumed":
      console.info(
        `[api/webhooks/razorpay] ${event} on ${subscriptionId} (status ${subscription?.status ?? "?"}, paid ${subscription?.paid_count ?? "?"}/${subscription?.total_count ?? "?"})`,
      );
      return NextResponse.json({ ok: true });

    default:
      return NextResponse.json({ ok: true });
  }
}
