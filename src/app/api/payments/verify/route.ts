/**
 * POST /api/payments/verify — the browser came back from Checkout.
 *
 * ## This is a convenience, not the mechanism
 *
 * The webhook is what actually settles a payment. This route exists so a
 * student who has just paid sees their course open *now*, rather than whenever
 * Razorpay's queue gets round to us. Both call the same `capturePayment`, which
 * is idempotent, so whichever arrives first wins and the other is a no-op.
 *
 * A student who pays and closes the tab before this fires is still let in by
 * the webhook. That is the case this route must not be the only answer to.
 *
 * ## What is trusted
 *
 * Nothing in the body except as a claim to be checked:
 *
 * - the **order id comes from our row**, not from the request. Verifying the
 *   pair a caller supplied only proves they can compute an HMAC;
 * - the row must belong to the signed-in student, so one student cannot settle
 *   another's fee by replaying a payload;
 * - the signature is checked before anything is written.
 *
 * ## Mock mode
 *
 * Outside production and with no Razorpay keys, `mode()` is `"mock"` and there
 * is no signature to check — the fee page's simulate control posts here with
 * the payment id alone. The branch is gated on the server's own `NODE_ENV` via
 * `mode()`, never on anything in the request, so a deployed build cannot be
 * talked into it.
 */
import { isValidObjectId } from "mongoose";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db";
import {
  fetchPayment,
  fetchSubscription,
  mode,
  verifyCheckoutSignature,
  verifySubscriptionSignature,
} from "@/lib/payments/razorpay";
import {
  capturePayment,
  captureSubscriptionCycle,
  failPayment,
} from "@/lib/payments/settle";
import { Enrollment } from "@/models/Enrollment";
import { FeePlan } from "@/models/FeePlan";
import { Payment } from "@/models/Payment";

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to pay." }, { status: 401 });
  }
  if (user.role !== "student") {
    return NextResponse.json({ error: "Not yours to settle." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  /**
   * An instalment plan came back from Checkout, not a one-time payment.
   *
   * Different object, different signature formula, and no pre-made row to
   * settle — so it is a different function rather than a branch threaded
   * through this one.
   */
  if (str(body.subscriptionId)) {
    return verifySubscription(user, body);
  }

  const paymentId = str(body.paymentId);
  if (!paymentId) {
    return NextResponse.json({ error: "Which payment?" }, { status: 400 });
  }

  // An id that is not ObjectId-shaped is one we cannot have issued. Answered
  // with the same 404 as "somebody else's payment" below — `findById` would
  // otherwise throw a CastError and turn a malformed body into a 500.
  if (!isValidObjectId(paymentId)) {
    return NextResponse.json({ error: "No such payment." }, { status: 404 });
  }

  await connectToDatabase();

  const payment = await Payment.findById(paymentId)
    .select("studentId status razorpayOrderId")
    .lean();

  // Same answer for "no such payment" and "somebody else's": a 404 either way,
  // so this route cannot be used to discover which payment ids exist.
  if (!payment || String(payment.studentId) !== user.id) {
    return NextResponse.json({ error: "No such payment." }, { status: 404 });
  }

  const actor = {
    kind: "user" as const,
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
  };

  if (mode() === "mock") {
    const outcome = await capturePayment({
      paymentId,
      // Obvious on sight in the database and in the audit log. Nobody should
      // ever have to wonder whether a row was real money.
      razorpayPaymentId: `pay_mock_${paymentId}`,
      method: "mock",
      actor,
    });

    return NextResponse.json({ ok: outcome.result !== "unknown", ...outcome });
  }

  const razorpayPaymentId = str(body.razorpay_payment_id);
  const signature = str(body.razorpay_signature);

  if (!razorpayPaymentId || !signature) {
    return NextResponse.json({ error: "Incomplete response." }, { status: 400 });
  }

  // Our order id, never the one in the body. See the header.
  const orderId = payment.razorpayOrderId ?? "";
  if (!orderId) {
    return NextResponse.json(
      { error: "That payment was never started properly." },
      { status: 409 },
    );
  }

  if (
    !verifyCheckoutSignature({ orderId, paymentId: razorpayPaymentId, signature })
  ) {
    console.warn(
      `[api/payments/verify] bad signature on payment ${paymentId} for student ${user.id}`,
    );

    await failPayment({
      paymentId,
      reason: "The signature returned by Checkout did not verify.",
      actor,
    });

    return NextResponse.json(
      { error: "We couldn't verify that payment. Nothing has been charged twice — please contact the office." },
      { status: 400 },
    );
  }

  const outcome = await capturePayment({
    paymentId,
    razorpayPaymentId,
    signature,
    method: str(body.method) || null,
    actor,
  });

  if (outcome.result === "unknown") {
    return NextResponse.json({ error: "No such payment." }, { status: 404 });
  }
  if (outcome.result === "mismatch") {
    return NextResponse.json(
      { error: "That payment doesn't match what was due. Please contact the office." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, result: outcome.result });
}

/**
 * The student just authorised an instalment mandate.
 *
 * Same standing as the order flow's fast path — **a convenience, not the
 * mechanism.** `subscription.charged` is what actually collects, now and every
 * month after; this exists so the course opens while the student is still
 * looking at the screen. Both end in `captureSubscriptionCycle`, which is
 * idempotent through the unique index on `razorpayPaymentId`, so whichever
 * arrives first wins and the other is a no-op.
 *
 * ## What is trusted
 *
 * Nothing in the body beyond the payment id it is asking us to check:
 *
 * - **the subscription id comes from the enrolment**, never from the request.
 *   That is what ties the mandate to this student — verifying a pair somebody
 *   supplied both halves of only proves they can compute an HMAC;
 * - **the amount and the cycle number come from Razorpay**, fetched here rather
 *   than read off the body. A browser that could name its own instalment amount
 *   could pay ₹1 and be credited with ₹15,000.
 */
async function verifySubscription(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  body: Record<string, unknown>,
): Promise<Response> {
  const razorpayPaymentId = str(body.razorpay_payment_id);
  const signature = str(body.razorpay_signature);

  await connectToDatabase();

  const enrollment = await Enrollment.findOne({
    studentId: user.id,
    razorpaySubscriptionId: str(body.subscriptionId),
  })
    .select("_id programId feePlanId razorpaySubscriptionId")
    .lean();

  // Same answer for "no such subscription" and "somebody else's".
  if (!enrollment?.razorpaySubscriptionId || !enrollment.feePlanId) {
    return NextResponse.json({ error: "No such subscription." }, { status: 404 });
  }

  const subscriptionId = enrollment.razorpaySubscriptionId;

  const actor = {
    kind: "user" as const,
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
  };

  /**
   * Mock mode: no signature to check, and no Razorpay to ask what was charged,
   * so the first cycle is recorded from the plan's own terms. Gated on the
   * server's `NODE_ENV` via `mode()`, never on anything in the request.
   */
  if (mode() === "mock") {
    const plan = await FeePlan.findById(enrollment.feePlanId)
      .select("upfrontAmount cycleAmount")
      .lean();

    const outcome = await captureSubscriptionCycle({
      enrollmentId: String(enrollment._id),
      studentId: user.id,
      programId: String(enrollment.programId),
      feePlanId: String(enrollment.feePlanId),
      subscriptionId,
      razorpayPaymentId: `pay_mock_${subscriptionId}_1`,
      cycleNumber: 1,
      amount: (plan?.upfrontAmount ?? 0) + (plan?.cycleAmount ?? 0),
      method: "mock",
      actor,
    });

    return NextResponse.json({ ok: outcome.result !== "unknown", ...outcome });
  }

  if (!razorpayPaymentId || !signature) {
    return NextResponse.json({ error: "Incomplete response." }, { status: 400 });
  }

  // Our subscription id, never the one in the body. And note the operand order
  // — payment first here, the reverse of the order flow. See razorpay.ts.
  if (
    !verifySubscriptionSignature({
      paymentId: razorpayPaymentId,
      subscriptionId,
      signature,
    })
  ) {
    console.warn(
      `[api/payments/verify] bad subscription signature on ${subscriptionId} for student ${user.id}`,
    );

    return NextResponse.json(
      {
        error:
          "We couldn't verify that payment. Nothing has been charged twice — please contact the office.",
      },
      { status: 400 },
    );
  }

  // Razorpay's numbers, not the browser's. Absent either, the webhook will
  // record this cycle with the authoritative figures shortly.
  const [charged, subscription] = await Promise.all([
    fetchPayment(razorpayPaymentId),
    fetchSubscription(subscriptionId),
  ]);

  if (!charged) {
    return NextResponse.json({
      ok: true,
      result: "pending",
      message: "Payment authorised. It will appear once Razorpay confirms it.",
    });
  }

  const outcome = await captureSubscriptionCycle({
    enrollmentId: String(enrollment._id),
    studentId: user.id,
    programId: String(enrollment.programId),
    feePlanId: String(enrollment.feePlanId),
    subscriptionId,
    razorpayPaymentId,
    cycleNumber:
      typeof subscription?.paid_count === "number" && subscription.paid_count > 0
        ? subscription.paid_count
        : 1,
    amount: charged.amount,
    signature,
    method: charged.method,
    actor,
  });

  if (outcome.result === "unknown") {
    return NextResponse.json({ error: "No such subscription." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, result: outcome.result });
}
