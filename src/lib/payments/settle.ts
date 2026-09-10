import "server-only";

import { isValidObjectId } from "mongoose";

import { recordAudit } from "@/lib/auth/audit";
import { connectToDatabase } from "@/lib/db";
import { Payment } from "@/models/Payment";
import { Program } from "@/models/Program";

import { formatPaise } from "./money";

/**
 * The one place a payment becomes `captured`.
 *
 * Two things call it — `/api/payments/verify` (the browser came back) and
 * `/api/webhooks/razorpay` (Razorpay told us) — and they race by design. The
 * webhook is the mechanism; the verify route is the part that makes the student
 * see their course open immediately instead of after a round trip through
 * Razorpay's queue. Either may arrive first, and neither may arrive at all.
 *
 * So this function is **idempotent**, in the only way that actually holds: the
 * transition is a conditional update matched on `status: "created"`, so of two
 * concurrent calls exactly one writes and the other is told it was already
 * settled. Reading the row and then deciding would leave a window between the
 * two in which both callers see `created`.
 *
 * The unique index on `razorpayPaymentId` is the second line of the same
 * defence: even a bug that got past the guard cannot produce two captured rows
 * for one Razorpay payment, and therefore cannot count one payment twice.
 */

export type SettleOutcome =
  | { result: "captured"; amount: number; programSlug: string }
  | { result: "already" }
  | { result: "unknown" }
  | { result: "mismatch"; reason: string };

/**
 * Is this string something `findById` can even look up?
 *
 * Both callers hand us an id that came from outside: the webhook reads it from
 * `notes.paymentId` on a payload Razorpay built, and the verify route reads it
 * from a request body. Mongoose throws a CastError on anything that is not
 * ObjectId-shaped, and out of the webhook that becomes a 500 — which is the one
 * answer that makes Razorpay retry for hours. A payment id we could not have
 * issued is an *unknown* payment, not a server error, so it is answered as one.
 *
 * Found by `npm run check:razorpay`: a signed webhook carrying a non-ObjectId
 * note 500d, while the same webhook carrying a well-formed but unknown id
 * correctly returned 200.
 */
function looksLikeOurId(paymentId: string): boolean {
  return Boolean(paymentId) && isValidObjectId(paymentId);
}

export async function capturePayment(input: {
  /** Our row's id. Comes from the order's receipt or its `notes`. */
  paymentId: string;
  razorpayPaymentId: string;
  signature?: string | null;
  method?: string | null;
  /** What Razorpay says was paid, in paise, when the payload carries it. */
  amount?: number | null;
  /** Who to file the audit entry against. */
  actor: Parameters<typeof recordAudit>[0];
}): Promise<SettleOutcome> {
  if (!looksLikeOurId(input.paymentId)) return { result: "unknown" };

  await connectToDatabase();

  const existing = await Payment.findById(input.paymentId)
    .select("status amount programId enrollmentId")
    .lean();

  if (!existing) return { result: "unknown" };
  if (existing.status === "captured") return { result: "already" };

  /**
   * Razorpay's amount must match ours.
   *
   * Not paranoia about Razorpay — paranoia about us. If a plan were repriced
   * between an order opening and its payment landing, capturing the row's
   * amount rather than the amount actually taken would credit a student with
   * money nobody received. Refusing loudly is better than a ledger that does
   * not tie out.
   */
  if (
    typeof input.amount === "number" &&
    input.amount !== existing.amount
  ) {
    await Payment.updateOne(
      { _id: input.paymentId },
      {
        $set: {
          status: "failed",
          failureReason: `Amount mismatch: expected ${existing.amount}, Razorpay reported ${input.amount}.`,
        },
      },
    );

    return {
      result: "mismatch",
      reason: `expected ${existing.amount} paise, got ${input.amount}`,
    };
  }

  /**
   * The atomic bit. Matching on the status is what makes a second caller a
   * no-op rather than a second capture.
   *
   * **`failed` is in the match, deliberately.** One Razorpay order accepts
   * several payment attempts: a student whose card is declined and who then
   * pays by UPI inside the same Checkout produces `payment.failed` and then
   * `payment.captured` against the one row. Matching only `created` would have
   * the failure lock the row and the real money be silently dropped — the
   * student pays and stays locked out.
   *
   * The direction is one-way: `capturePayment` may overwrite a failure,
   * `failPayment` may never overwrite a capture. Money arriving is the more
   * authoritative fact.
   */
  const updated = await Payment.findOneAndUpdate(
    { _id: input.paymentId, status: { $in: ["created", "failed"] } },
    {
      $set: {
        status: "captured",
        razorpayPaymentId: input.razorpayPaymentId,
        razorpaySignature: input.signature ?? null,
        method: input.method ?? "",
        paidAt: new Date(),
      },
    },
    { returnDocument: "after" },
  )
    .select("amount programId enrollmentId")
    .lean();

  if (!updated) return { result: "already" };

  const program = await Program.findById(updated.programId)
    .select("slug title")
    .lean();

  await recordAudit(input.actor, {
    action: "payment.captured",
    targetType: "Payment",
    targetId: input.paymentId,
    summary: `Received ${formatPaise(updated.amount)} for ${program?.title ?? "a program"}`,
    meta: {
      razorpayPaymentId: input.razorpayPaymentId,
      programSlug: program?.slug ?? null,
      method: input.method ?? "",
    },
  });

  /**
   * Deliberately no `revalidatePath` here.
   *
   * Two reasons. It would buy nothing — every student screen reads the session
   * cookie, so all of them render per request and pick up the new fee status on
   * the next navigation anyway. And it would tie this function to a request
   * context it must not need: the webhook settles payments with no page in
   * sight, and `revalidatePath` throws outside a render or action store, which
   * would turn a successful payment into a 500 and a retry.
   *
   * The browser's own refresh after paying is handled in `PayPanel`, which is
   * in a request and can afford to be.
   */
  return { result: "captured", amount: updated.amount, programSlug: program?.slug ?? "" };
}

/**
 * Record a payment that did not go through.
 *
 * A failed payment is a row, not a deletion: "they tried twice and the card was
 * declined" is what a student says on the phone, and the ledger should be able
 * to agree with them. Only ever moves a `created` row, so it can never
 * un-capture money that arrived.
 */
export async function failPayment(input: {
  paymentId: string;
  razorpayPaymentId?: string | null;
  reason: string;
  actor: Parameters<typeof recordAudit>[0];
}): Promise<void> {
  // Same reason as `capturePayment`: `payment.failed` reaches here from the
  // webhook with an id we did not issue, and a CastError would be a 500.
  if (!looksLikeOurId(input.paymentId)) return;

  await connectToDatabase();

  const updated = await Payment.findOneAndUpdate(
    { _id: input.paymentId, status: "created" },
    {
      $set: {
        status: "failed",
        failureReason: input.reason.slice(0, 300),
        ...(input.razorpayPaymentId
          ? { razorpayPaymentId: input.razorpayPaymentId }
          : {}),
      },
    },
    { returnDocument: "after" },
  )
    .select("amount")
    .lean();

  if (!updated) return;

  await recordAudit(input.actor, {
    action: "payment.failed",
    targetType: "Payment",
    targetId: input.paymentId,
    summary: `A ${formatPaise(updated.amount)} payment failed`,
    meta: { reason: input.reason },
  });
}

/* ------------------------- instalments (subscriptions) ------------------------- */

export type CycleOutcome =
  | { result: "captured"; amount: number; cycleNumber: number; paymentId: string }
  | { result: "already" }
  | { result: "unknown" };

/**
 * Record one instalment. **Creates the row rather than updating one.**
 *
 * This is the structural difference between the two flows, and the reason it is
 * a separate function rather than a flag on `capturePayment`.
 *
 * A one-time payment has its `Payment` row created up front, because there is
 * exactly one and we know what it will cost. A subscription cannot work that
 * way: at authorisation time nobody knows how many cycles will actually be
 * paid, when, or whether a card will lapse in month four. So there is nothing
 * to pre-allocate, and each cycle's row is written here as its payment lands —
 * once for the authorisation transaction, once per monthly debit after that.
 *
 * ## Which makes idempotency the whole problem
 *
 * `capturePayment` gets it from a conditional status transition on a row that
 * already exists. There is no such row here, so a replayed `subscription.charged`
 * — and Razorpay replays freely, out of order, for hours — would otherwise
 * insert a **second** row and credit the student twice.
 *
 * The defence is the partial unique index on `razorpayPaymentId`: an upsert
 * matched on Razorpay's own payment id can only ever produce one row, and a
 * replay updates that same row instead of adding another. This is precisely the
 * job `models/Payment.ts` describes that index as existing for, and the first
 * code to actually depend on it.
 *
 * ## `cycleNumber` is Razorpay's count, never ours
 *
 * Taken from `paid_count` on the subscription entity in the webhook payload.
 * Counting our own rows would be wrong twice over — the down payment is an
 * amount inside the first transaction rather than a cycle of its own, and an
 * out-of-order replay would move a computed count backwards. `getFeeStatus`
 * already reads the *highest* `cycleNumber` for the same reason.
 */
export async function captureSubscriptionCycle(input: {
  enrollmentId: string;
  studentId: string;
  programId: string;
  feePlanId: string;
  subscriptionId: string;
  razorpayPaymentId: string;
  /** Razorpay's `paid_count` — which instalment this is. */
  cycleNumber: number;
  /** What Razorpay actually took, in paise. Never our own arithmetic. */
  amount: number;
  signature?: string | null;
  method?: string | null;
  actor: Parameters<typeof recordAudit>[0];
}): Promise<CycleOutcome> {
  if (!input.razorpayPaymentId) return { result: "unknown" };
  if (
    !isValidObjectId(input.enrollmentId) ||
    !isValidObjectId(input.studentId) ||
    !isValidObjectId(input.programId) ||
    !isValidObjectId(input.feePlanId)
  ) {
    return { result: "unknown" };
  }

  await connectToDatabase();

  // Was this exact Razorpay payment already recorded? Asked before the upsert
  // so a replay can be reported as `already` rather than silently rewriting a
  // row and filing a second audit entry for money that arrived once.
  const seen = await Payment.findOne({
    razorpayPaymentId: input.razorpayPaymentId,
  })
    .select("_id")
    .lean();

  if (seen) return { result: "already" };

  /**
   * The first transaction carries the down payment as an `addon`, so it is
   * larger than a plain cycle. Recorded as `emi_upfront` to keep that legible
   * in the ledger — "why is the first row ₹14,999 when the plan says ₹5,000"
   * is a question a receipt should answer on its face.
   */
  const kind = input.cycleNumber <= 1 ? "emi_upfront" : "emi_cycle";

  let created;
  try {
    created = await Payment.findOneAndUpdate(
      { razorpayPaymentId: input.razorpayPaymentId },
      {
        $setOnInsert: {
          enrollmentId: input.enrollmentId,
          studentId: input.studentId,
          programId: input.programId,
          feePlanId: input.feePlanId,
          kind,
          cycleNumber: input.cycleNumber,
          amount: input.amount,
          currency: "INR",
          status: "captured",
          razorpaySubscriptionId: input.subscriptionId,
          razorpaySignature: input.signature ?? null,
          method: input.method ?? "",
          paidAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" },
    )
      .select("_id amount cycleNumber")
      .lean<{ _id: unknown; amount: number; cycleNumber: number | null } | null>();
  } catch {
    // E11000 from the unique index: a concurrent delivery of the same event
    // inserted first. That is the guard working, and the answer is `already`.
    return { result: "already" };
  }

  if (!created) return { result: "already" };

  const program = await Program.findById(input.programId)
    .select("slug title")
    .lean();

  await recordAudit(input.actor, {
    action: "payment.captured",
    targetType: "Payment",
    targetId: String(created._id),
    summary: `Received ${formatPaise(created.amount)} — instalment ${input.cycleNumber} for ${program?.title ?? "a program"}`,
    meta: {
      razorpayPaymentId: input.razorpayPaymentId,
      razorpaySubscriptionId: input.subscriptionId,
      cycleNumber: input.cycleNumber,
      programSlug: program?.slug ?? null,
      method: input.method ?? "",
    },
  });

  return {
    result: "captured",
    amount: created.amount,
    cycleNumber: input.cycleNumber,
    paymentId: String(created._id),
  };
}
