import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

/**
 * Razorpay, by hand.
 *
 * No SDK, for the reason `uploads/cloudinary.ts` gives: creating an order is
 * one authenticated POST and every verification is an HMAC. That is a handful
 * of small functions against a documented HTTP API, versus a dependency — the
 * same trade this codebase made for auth and for Cloudinary.
 *
 * Everything here is server-only. The key secret signs orders and verifies what
 * Checkout hands back; it must never reach a bundle.
 *
 * ## Three modes
 *
 * `mode()` is the first thing every caller asks:
 *
 * - **live** — keys are set. Real orders, real money.
 * - **mock** — no keys, and not production. Orders are minted locally with an
 *   obvious `order_mock_…` id and the fee page offers a labelled "simulate
 *   payment" control instead of Checkout. This is what lets the whole flow —
 *   notice, gate, pay, unlock — be built before a Razorpay account exists,
 *   the same way `googleCalendar.ts` hands out a mock Meet link.
 * - **off** — no keys, in production. Payments are unavailable and the fee page
 *   says so. **There is no path from `mock` to a live student**: the mode is
 *   decided from `NODE_ENV` on the server, never from a request, a header or a
 *   query string, so a deployed build cannot be talked into simulating one.
 *
 * ## Two different secrets, two different signatures
 *
 * This is the part that is easy to get wrong, so both live here rather than at
 * the call sites:
 *
 * - Checkout's reply on an **order** is
 *   `HMAC_SHA256(order_id + "|" + payment_id, KEY_SECRET)`.
 * - Checkout's reply on a **subscription** is
 *   `HMAC_SHA256(payment_id + "|" + subscription_id, KEY_SECRET)` — the same
 *   secret, and **the operands the other way round**. Reading them side by side
 *   is the only reliable way not to get this wrong, which is why both are here.
 * - A webhook is `HMAC_SHA256(rawBody, WEBHOOK_SECRET)` — a different secret,
 *   over the raw bytes.
 *
 * ## Orders and subscriptions are different objects
 *
 * An **order** is one payment: created per attempt, priced by us, settled by
 * `/api/payments/verify` or the webhook. A **subscription** is a standing
 * instruction: created once per enrolment against an immutable **plan**, and it
 * then charges on its own for months with no browser open.
 *
 * The consequence that shapes everything downstream: an order's `Payment` row
 * can be created *before* the payment, because there is exactly one. A
 * subscription's cannot — nobody knows in advance how many cycles will be paid
 * or when — so EMI rows are written **by the settle path as each cycle lands**,
 * and their idempotency comes from the unique index on `razorpayPaymentId`
 * rather than from a row we pre-allocated. See `settle.ts`.
 */

const API_BASE = "https://api.razorpay.com/v1";

export type PaymentsMode = "live" | "mock" | "off";

export function mode(): PaymentsMode {
  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) return "live";
  return process.env.NODE_ENV === "production" ? "off" : "mock";
}

/** The key id the browser needs to open Checkout. Null unless we are live. */
export function publishableKeyId(): string | null {
  return mode() === "live" ? env.RAZORPAY_KEY_ID : null;
}

function authHeader(): string {
  const id = env.RAZORPAY_KEY_ID;
  const secret = env.RAZORPAY_KEY_SECRET;

  if (!id || !secret) {
    throw new Error(
      "Razorpay is not configured. Check mode() before calling the API.",
    );
  }

  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
};

/**
 * Create an order.
 *
 * `receipt` is the `Payment` row's own id, so when a webhook arrives for
 * something unrecognised the receipt points straight back at our row.
 *
 * **It is not an idempotency key.** Razorpay's docs describe receipts as
 * unique, but uniqueness is an account setting that is off by default:
 * `npm run check:razorpay` sends the same receipt twice and gets back two
 * different order ids. Nothing here may lean on a repeat being rejected — the
 * double-click guard is the partial unique index on `Payment`, and
 * `/api/payments/order` upserts against it.
 *
 * `notes` carries the same ids again, because a webhook payload includes them
 * and looking a payment up by `notes.paymentId` is one query rather than a
 * lookup through the order.
 */
export async function createOrder(input: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  if (mode() === "mock") {
    return {
      id: `order_mock_${input.receipt}`,
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt,
      status: "created",
    };
  }

  const response = await fetch(`${API_BASE}/orders`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt,
      notes: input.notes,
    }),
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    // Razorpay's shape is { error: { code, description, … } }. The description
    // is the only part worth logging — it says which field it disliked.
    const description =
      (body as { error?: { description?: string } } | null)?.error?.description ??
      `HTTP ${response.status}`;
    throw new Error(`Razorpay refused the order: ${description}`);
  }

  return body as RazorpayOrder;
}

/* ------------------------------ subscriptions ----------------------------- */

/**
 * One authenticated call, with Razorpay's error shape unwrapped.
 *
 * `createOrder` above predates this and keeps its own copy; everything from
 * here down shares it.
 */
async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; what: string },
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (body as { error?: { description?: string; code?: string } } | null)
      ?.error;
    throw new Error(
      `Razorpay refused ${init.what}: ${error?.description ?? `HTTP ${response.status}`}`,
    );
  }

  return body as T;
}

export type RazorpayPlan = {
  id: string;
  period: string;
  interval: number;
  item: { name: string; amount: number; currency: string };
};

/**
 * Create a plan — the immutable template a subscription charges against.
 *
 * **A Razorpay plan cannot be edited or deleted, ever.** That is not our rule
 * and there is no way around it: once this returns, an object exists on their
 * side saying "₹5,000 every month" and it will say that forever. It is exactly
 * why `FeePlan` is append-only, with archiving instead of editing — see the
 * model's header. Test-mode plans are equally permanent, so a probe plan is
 * clutter you live with.
 *
 * A plan holds **only** the period, the interval and the per-cycle amount. It
 * has no idea how many cycles, and no concept of a down payment: `totalCycles`
 * becomes `total_count` on the *subscription*, and `upfrontAmount` becomes an
 * `addons[]` entry there. Do not go looking for either here.
 */
export async function createPlan(input: {
  period: string;
  interval: number;
  name: string;
  amountPaise: number;
  notes: Record<string, string>;
}): Promise<RazorpayPlan> {
  if (mode() === "mock") {
    return {
      id: `plan_mock_${Date.now().toString(36)}`,
      period: input.period,
      interval: input.interval,
      item: { name: input.name, amount: input.amountPaise, currency: "INR" },
    };
  }

  return call<RazorpayPlan>("/plans", {
    method: "POST",
    what: "the plan",
    body: {
      period: input.period,
      interval: input.interval,
      item: {
        name: input.name,
        amount: input.amountPaise,
        currency: "INR",
      },
      notes: input.notes,
    },
  });
}

/**
 * Razorpay's subscription lifecycle, verbatim.
 *
 * - `created` — made by us; nobody has authorised it. No money has moved.
 * - `authenticated` — the student approved the mandate, but the first charge is
 *   still ahead (only happens with a future `start_at`).
 * - `active` — running and charging. The normal state.
 * - `pending` — a charge failed and Razorpay is retrying. **Still recoverable.**
 * - `halted` — the retries ran out. Dead until somebody intervenes.
 * - `cancelled` — stopped deliberately.
 * - `completed` — every cycle in `total_count` was paid. The happy ending.
 * - `expired` — never authorised before `expire_by`.
 */
export const SUBSCRIPTION_STATUSES = [
  "created",
  "authenticated",
  "active",
  "pending",
  "halted",
  "cancelled",
  "completed",
  "expired",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** The statuses in which a subscription is still worth re-using rather than replacing. */
const REUSABLE: readonly string[] = ["created", "authenticated", "active", "pending"];

export function isReusableSubscription(status: string): boolean {
  return REUSABLE.includes(status);
}

export type RazorpaySubscription = {
  id: string;
  plan_id: string;
  status: string;
  total_count: number;
  paid_count: number;
  remaining_count: number;
  short_url: string | null;
  charge_at: number | null;
  current_end: number | null;
  notes?: Record<string, string>;
};

/**
 * Create a subscription — the standing instruction to charge a student monthly.
 *
 * Three things here are not obvious from the field names:
 *
 * - **`total_count` is the number of cycles, and it lives on the subscription,
 *   not the plan.** The same plan serves a 6-month and a 9-month schedule.
 * - **`addons` is how the down payment gets collected.** It is charged in the
 *   authorisation transaction — the one the student actually sees at Checkout —
 *   so the first payment is `upfrontAmount + cycleAmount`, not either alone.
 *   It is also where our rounding remainder lives, because every cycle of a
 *   plan is identical and an arbitrary total rarely divides evenly.
 * - **`notes` go on the subscription and reappear on every webhook for it.**
 *   That is the join back to our enrolment, and unlike the order flow it cannot
 *   carry a payment id: the rows do not exist yet. See `settle.ts`.
 *
 * `customer_notify: 0` — we send our own mail. Razorpay's templates say
 * "subscription" and name a plan the student never saw.
 */
export async function createSubscription(input: {
  planId: string;
  totalCycles: number;
  upfrontPaise: number;
  notes: Record<string, string>;
}): Promise<RazorpaySubscription> {
  if (mode() === "mock") {
    return {
      id: `sub_mock_${Date.now().toString(36)}`,
      plan_id: input.planId,
      status: "created",
      total_count: input.totalCycles,
      paid_count: 0,
      remaining_count: input.totalCycles,
      short_url: null,
      charge_at: null,
      current_end: null,
      notes: input.notes,
    };
  }

  return call<RazorpaySubscription>("/subscriptions", {
    method: "POST",
    what: "the subscription",
    body: {
      plan_id: input.planId,
      total_count: input.totalCycles,
      quantity: 1,
      customer_notify: 0,
      notes: input.notes,
      // Razorpay rejects an empty addons array, so it is omitted rather than
      // sent empty when a plan has no down payment.
      ...(input.upfrontPaise > 0
        ? {
            addons: [
              {
                item: {
                  name: "Down payment",
                  amount: input.upfrontPaise,
                  currency: "INR",
                },
              },
            ],
          }
        : {}),
    },
  });
}

export type RazorpayPayment = {
  id: string;
  amount: number;
  status: string;
  method: string | null;
};

/**
 * Read one payment back.
 *
 * Used by the verify route so the *amount* recorded for an instalment comes
 * from Razorpay rather than from the browser that just claimed it. The webhook
 * gets the same figure in its payload for free; this is the fast path paying
 * the extra call to stay equally trustworthy.
 */
export async function fetchPayment(id: string): Promise<RazorpayPayment | null> {
  if (mode() === "mock" || !id) return null;

  try {
    return await call<RazorpayPayment>(`/payments/${id}`, {
      method: "GET",
      what: "the payment",
    });
  } catch {
    return null;
  }
}

/** Read a subscription back. The authority on `status` and `paid_count`. */
export async function fetchSubscription(
  id: string,
): Promise<RazorpaySubscription | null> {
  if (mode() === "mock") return null;

  try {
    return await call<RazorpaySubscription>(`/subscriptions/${id}`, {
      method: "GET",
      what: "the subscription",
    });
  } catch {
    // A subscription we cannot read is one we must not reuse. The caller makes
    // a new one, which is the safe direction to fail in.
    return null;
  }
}

/**
 * Stop a subscription now.
 *
 * `cancel_at_cycle_end: 0` — immediately, not at the end of the paid period.
 * A student is switching away or being refunded; leaving one more debit to fire
 * would be the wrong surprise.
 */
export async function cancelSubscription(
  id: string,
): Promise<RazorpaySubscription> {
  if (mode() === "mock") {
    return {
      id,
      plan_id: "",
      status: "cancelled",
      total_count: 0,
      paid_count: 0,
      remaining_count: 0,
      short_url: null,
      charge_at: null,
      current_end: null,
    };
  }

  return call<RazorpaySubscription>(`/subscriptions/${id}/cancel`, {
    method: "POST",
    what: "the cancellation",
    body: { cancel_at_cycle_end: 0 },
  });
}

/** Constant-time compare of two hex digests of the same length. */
function digestsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    // Non-hex input reaches here rather than throwing out of a route.
    return false;
  }
}

/**
 * Verify what Checkout handed the browser.
 *
 * The order id must come from **our** record of the payment, never from the
 * response — a caller who supplies both halves of the pair is only proving they
 * can hash, not that Razorpay signed anything.
 */
export function verifyCheckoutSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const secret = env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;

  const expected = createHmac("sha256", secret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");

  return digestsMatch(expected, input.signature);
}

/**
 * Verify what Checkout handed back after **authorising a subscription**.
 *
 * `HMAC_SHA256(payment_id + "|" + subscription_id, KEY_SECRET)`.
 *
 * **The operands are the reverse of the order flow.** There, the order comes
 * first; here, the payment does. Nothing about the two calls looks different at
 * a glance, both take the key secret, and both produce a 64-character hex
 * string either way — so getting it backwards fails every real payment while
 * looking completely correct. `npm run check:razorpay` asserts each formula
 * rejects the other's ordering, which is the only thing that catches it.
 *
 * As with orders, the subscription id must come from **our** record, never from
 * the response: a caller who supplies both halves is only proving they can hash.
 */
export function verifySubscriptionSignature(input: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}): boolean {
  const secret = env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;

  const expected = createHmac("sha256", secret)
    .update(`${input.paymentId}|${input.subscriptionId}`)
    .digest("hex");

  return digestsMatch(expected, input.signature);
}

/**
 * Verify a webhook.
 *
 * `rawBody` must be the exact bytes that arrived — `request.text()`, never
 * `request.json()`. Parsing reorders keys and changes whitespace, and the hash
 * then never matches. The Bunny webhook has the same note for the same reason.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
): boolean {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return digestsMatch(expected, signature);
}
