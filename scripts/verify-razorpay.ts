/**
 * Prove the Razorpay credentials and both signatures actually work.
 *
 *   npm run check:razorpay
 *
 * The payments counterpart of `check:cloudinary` and `check:bunny`. It creates
 * a REAL order against Razorpay's API with the keys in .env.local, reads it
 * back, and then exercises both of the two different HMACs by hand — the
 * Checkout reply and the webhook — including the negative cases, because a
 * verifier that says yes to everything passes a happy-path test perfectly.
 *
 * Nothing is charged and nothing is written to our database. An order with no
 * payment against it simply expires; it is not money and not a row. Safe to run
 * as often as you like.
 *
 * With a dev server running it also posts a correctly signed webhook at
 * /api/webhooks/razorpay, which is otherwise unreachable in development —
 * Razorpay cannot call localhost. Set BASE_URL to point it elsewhere.
 *
 * What this canNOT prove is the browser half: Checkout's modal, the card, and
 * the handler that posts back to /api/payments/verify. That needs a person and
 * a test card — see the end of the output.
 */
import { createHmac } from "node:crypto";

import {
  cancelSubscription,
  createOrder,
  createPlan,
  createSubscription,
  mode,
  publishableKeyId,
  verifyCheckoutSignature,
  verifySubscriptionSignature,
  verifyWebhookSignature,
} from "../src/lib/payments/razorpay";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

/** A receipt that looks like ours (a 24-char ObjectId) without being one. */
const RECEIPT = `chk${Date.now().toString(16)}${"0".repeat(4)}`.slice(0, 24);

let failures = 0;

function ok(label: string, detail = "") {
  console.log(`  ✓ ${label.padEnd(30)} ${detail}`.trimEnd());
}

function bad(label: string, detail = "") {
  failures += 1;
  console.error(`  ✗ ${label.padEnd(30)} ${detail}`.trimEnd());
}

function check(label: string, condition: boolean, detail = "") {
  if (condition) ok(label, detail);
  else bad(label, detail);
}

async function main() {
  const configured = mode();

  console.log(`\nRazorpay check — mode: ${configured}\n`);

  if (configured !== "live") {
    console.error(
      configured === "mock"
        ? "Not configured: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are empty, so the app\n" +
            "is in MOCK mode and there is nothing to check against the real API.\n" +
            "Paste the test pair into .env.local — see .env.example."
        : "Payments are OFF (production build with no keys).",
    );
    process.exit(1);
  }

  const keyId = publishableKeyId() ?? "";
  check(
    "key id looks like a key",
    keyId.startsWith("rzp_test_") || keyId.startsWith("rzp_live_"),
    keyId,
  );

  if (keyId.startsWith("rzp_live_")) {
    console.log(
      "\n  ⚠ These are LIVE keys. Orders created here are real. Stopping.\n",
    );
    process.exit(1);
  }

  // ---- 1. The API round trip. This is the half a wrong secret fails. ----

  console.log("\nOrder API:");

  let orderId: string;
  try {
    const order = await createOrder({
      amountPaise: 100, // ₹1 — Razorpay's minimum.
      receipt: RECEIPT,
      notes: { paymentId: RECEIPT, source: "check:razorpay" },
    });

    orderId = order.id;
    ok("created", `${order.id}  ${order.amount} ${order.currency}`);
    check("amount came back intact", order.amount === 100, `${order.amount}`);
    check("receipt round-tripped", order.receipt === RECEIPT, order.receipt ?? "—");
    check("status is 'created'", order.status === "created", order.status);
  } catch (error) {
    bad("created", (error as Error).message);
    console.error(
      "\nA 401 here means the key id and secret don't belong together, or one was\n" +
        "copied with whitespace. The secret is shown once at generation time and\n" +
        "cannot be read back — regenerate the pair rather than guessing.\n",
    );
    process.exit(1);
  }

  // Read it back with the same credentials: proves the order exists on their
  // side and is ours, not just that a POST returned a body.
  try {
    const response = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`,
        ).toString("base64")}`,
      },
      cache: "no-store",
    });
    const body = (await response.json()) as { id?: string; notes?: Record<string, string> };

    check("fetched back", response.ok && body.id === orderId, body.id ?? `HTTP ${response.status}`);
    check(
      "notes survived",
      body.notes?.paymentId === RECEIPT,
      body.notes?.paymentId ?? "—",
    );
  } catch (error) {
    bad("fetched back", (error as Error).message);
  }

  /**
   * A receipt is NOT an idempotency key, whatever the docs imply — uniqueness
   * is an account setting and it is off by default. This asserted the opposite
   * until it failed here, which is how the double-charge on a double-clicked
   * Pay button was found.
   *
   * It is checked in this direction on purpose: the day the setting is turned
   * on, this flips, and whoever sees it should read the guard in
   * `models/Payment.ts` before deciding that anything can now lean on receipts.
   */
  try {
    const second = await createOrder({
      amountPaise: 100,
      receipt: RECEIPT,
      notes: { paymentId: RECEIPT, source: "check:razorpay" },
    });

    check(
      "receipt is not idempotent",
      second.id !== orderId,
      "two order ids for one receipt — as expected; the guard is ours",
    );
  } catch (error) {
    bad(
      "receipt is not idempotent",
      `Razorpay now refuses a repeat (${(error as Error).message}) — ` +
        "behaviour changed; see models/Payment.ts before relying on it",
    );
  }

  // ---- 2. Checkout's signature: order_id|payment_id, keyed by KEY_SECRET ----

  console.log("\nCheckout signature (order_id|payment_id, KEY_SECRET):");

  const paymentId = "pay_ChkFakePayment01";
  const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
  const good = createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  check(
    "accepts a real signature",
    verifyCheckoutSignature({ orderId, paymentId, signature: good }),
  );
  check(
    "rejects a tampered one",
    !verifyCheckoutSignature({
      orderId,
      paymentId,
      signature: good.replace(/^./, (c) => (c === "a" ? "b" : "a")),
    }),
  );
  check(
    "rejects a different order",
    !verifyCheckoutSignature({
      orderId: "order_SomethingElse",
      paymentId,
      signature: good,
    }),
  );
  check(
    "rejects the operands swapped",
    !verifyCheckoutSignature({
      orderId,
      paymentId,
      signature: createHmac("sha256", secret)
        .update(`${paymentId}|${orderId}`)
        .digest("hex"),
    }),
  );
  check("rejects junk", !verifyCheckoutSignature({ orderId, paymentId, signature: "nonsense" }));

  /* ---- 2b. Subscriptions: the plan, the mandate, and the other signature ---- */

  console.log("\nSubscriptions:");

  let planId = "";
  let subscriptionId = "";

  try {
    const plan = await createPlan({
      period: "monthly",
      interval: 1,
      name: "check:razorpay probe (ignore)",
      amountPaise: 500000,
      notes: { source: "check:razorpay" },
    });

    planId = plan.id;
    ok("plan created", `${plan.id}  ${plan.item.amount / 100} INR / ${plan.period}`);
  } catch (error) {
    bad("plan created", (error as Error).message);
    console.error(
      "\nIf this says the account cannot create plans, Subscriptions is not\n" +
        "enabled on it — that is a Razorpay account setting, not a code problem.\n",
    );
  }

  if (planId) {
    try {
      const subscription = await createSubscription({
        planId,
        totalCycles: 9,
        upfrontPaise: 999900,
        notes: { source: "check:razorpay" },
      });

      subscriptionId = subscription.id;
      ok("subscription created", `${subscription.id}  status=${subscription.status}`);
      check(
        "total_count is ours",
        subscription.total_count === 9,
        String(subscription.total_count),
      );
      check(
        "starts unauthorised",
        subscription.status === "created" && subscription.paid_count === 0,
        `${subscription.status}, paid ${subscription.paid_count}`,
      );
      check(
        "notes survived",
        subscription.notes?.source === "check:razorpay",
        subscription.notes?.source ?? "—",
      );
    } catch (error) {
      bad("subscription created", (error as Error).message);
    }
  }

  /**
   * The formula that is easy to get backwards, checked in both directions.
   *
   * An order signs `order|payment`; a subscription signs `payment|subscription`.
   * Both take the key secret and both produce 64 hex characters either way, so
   * a swapped pair looks entirely correct and fails every real payment. These
   * two negative checks are the only thing that catches it.
   */
  if (subscriptionId) {
    console.log("\nSubscription signature (payment_id|subscription_id, KEY_SECRET):");

    const subPaymentId = "pay_ChkFakeSubPay01";
    const subSignature = createHmac("sha256", secret)
      .update(`${subPaymentId}|${subscriptionId}`)
      .digest("hex");

    check(
      "accepts a real signature",
      verifySubscriptionSignature({
        paymentId: subPaymentId,
        subscriptionId,
        signature: subSignature,
      }),
    );
    check(
      "rejects the operands swapped",
      !verifySubscriptionSignature({
        paymentId: subPaymentId,
        subscriptionId,
        signature: createHmac("sha256", secret)
          .update(`${subscriptionId}|${subPaymentId}`)
          .digest("hex"),
      }),
      "the order flow's ordering must not verify here",
    );
    check(
      "rejects a different subscription",
      !verifySubscriptionSignature({
        paymentId: subPaymentId,
        subscriptionId: "sub_SomethingElse",
        signature: subSignature,
      }),
    );
    // And the mirror: the order verifier must reject the subscription ordering.
    check(
      "order verifier rejects it",
      !verifyCheckoutSignature({
        orderId: subscriptionId,
        paymentId: subPaymentId,
        signature: subSignature,
      }),
      "the two formulas must not be interchangeable",
    );

    // Leave nothing charging. The plan cannot be deleted — Razorpay plans never
    // can — but an unauthorised subscription can and should be cancelled.
    try {
      await cancelSubscription(subscriptionId);
      ok("probe subscription cancelled");
    } catch (error) {
      bad("probe subscription cancelled", (error as Error).message);
    }
  }

  // ---- 3. The webhook signature: raw body, keyed by WEBHOOK_SECRET ----

  console.log("\nWebhook signature (raw body, WEBHOOK_SECRET):");

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";

  if (!webhookSecret) {
    bad(
      "RAZORPAY_WEBHOOK_SECRET",
      "not set — the route refuses every call, so a closed tab means a lost payment",
    );
  } else {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 100,
            method: "card",
            notes: { paymentId: RECEIPT },
          },
        },
      },
    });

    const signature = createHmac("sha256", webhookSecret).update(body).digest("hex");

    check("accepts a real signature", verifyWebhookSignature(body, signature));
    check("rejects a mis-signed body", !verifyWebhookSignature(`${body} `, signature));
    check("rejects an empty signature", !verifyWebhookSignature(body, ""));
    check(
      "key secret is not the webhook secret",
      !verifyWebhookSignature(
        body,
        createHmac("sha256", secret).update(body).digest("hex"),
      ) || secret === webhookSecret,
    );

    // ---- 4. The live route, if something is listening. ----

    console.log(`\nWebhook route at ${BASE_URL}:`);

    try {
      const unsigned = await fetch(`${BASE_URL}/api/webhooks/razorpay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      check("401s an unsigned call", unsigned.status === 401, `HTTP ${unsigned.status}`);

      const signed = await fetch(`${BASE_URL}/api/webhooks/razorpay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Razorpay-Signature": signature,
        },
        body,
      });

      // 200 and no row settled: RECEIPT is not a real Payment._id, so this
      // proves the signature path, not the write. The write is proven by
      // paying with a test card, below.
      //
      // It is also the regression test for a 500 here: an id we could not have
      // issued is an unknown payment, and answering 500 makes Razorpay retry
      // it for hours. See looksLikeOurId in lib/payments/settle.ts.
      check(
        "200s a signed call",
        signed.status === 200,
        `HTTP ${signed.status}${signed.status === 500 ? "  ← malformed note must not 500" : ""}`,
      );

      // The same, for a well-formed id that belongs to no row. Both shapes of
      // "we don't know this payment" must be acknowledged, not retried.
      const unknownBody = body.replace(RECEIPT, "507f1f77bcf86cd799439011");
      const unknown = await fetch(`${BASE_URL}/api/webhooks/razorpay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Razorpay-Signature": createHmac("sha256", webhookSecret)
            .update(unknownBody)
            .digest("hex"),
        },
        body: unknownBody,
      });
      check("200s an unknown payment", unknown.status === 200, `HTTP ${unknown.status}`);
    } catch {
      console.log("  – no server listening; start `npm run dev` to check the route");
    }
  }

  console.log(
    failures === 0
      ? "\nServer side is good: the keys work, orders are created, and both\n" +
          "signatures verify — including the cases they should refuse.\n\n" +
          "What is left needs a browser, because Checkout is a modal:\n" +
          "  1. npm run dev, and sign in as a student who owes a full-payment fee\n" +
          "  2. /dashboard/<program>/fees → Pay. There should be NO amber mock\n" +
          "     banner; a real Razorpay modal should open.\n" +
          "  3. Card 4100 2800 0000 1007, any future expiry, any CVV, OTP of\n" +
          "     4-10 digits. Decline instead with 4100 2800 0006 0003.\n" +
          "     NOT 4111 1111 1111 1111 — Razorpay reads that as an INTERNATIONAL\n" +
          "     card, and this account accepts domestic only, so it fails at\n" +
          "     payment_initiation with international_transaction_not_allowed.\n" +
          "  4. The overview should unlock, and the Payment row should be\n" +
          "     `captured` with a real pay_… id — not pay_mock_….\n" +
          "  5. Razorpay dashboard → Test mode → Transactions shows the same\n" +
          "     payment, and its order carries our notes.paymentId.\n"
      : `\n${failures} check(s) failed — see above.\n`,
  );

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
