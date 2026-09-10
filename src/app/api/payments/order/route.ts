/**
 * POST /api/payments/order — start paying for a program.
 *
 * Opens (or re-opens) the `Payment` row **first**, then the Razorpay order, and
 * sends the order back for the browser to open Checkout with.
 *
 * ## Why the row comes first
 *
 * Its `_id` is what we send as the order's `receipt`, which gives us a join in
 * both directions: when a webhook turns up for a payment nothing recognises,
 * the receipt points at the row that started it. The same ids go into `notes`,
 * which comes back on the webhook payload, so settling a payment is one indexed
 * lookup rather than a walk through the order.
 *
 * ## Two clicks must not become two charges
 *
 * This route used to insert a row per request and rely on Razorpay refusing a
 * repeated `receipt`. It does not — see `createOrder` — so a double-clicked Pay
 * button opened two orders, and a student who paid both was charged twice.
 *
 * The guard is ours now: at most one `created` full-payment row per enrolment,
 * held by a partial unique index in `models/Payment.ts`, and this route upserts
 * against it and hands back the order that row already has. Regression test:
 * `npm run check:razorpay`.
 *
 * ## What this route decides, and what it does not
 *
 * It decides *how much* — from the fee plan and the ledger, never from the
 * request. The body carries a program slug and nothing else: an amount posted
 * by a browser is a suggestion from a stranger.
 *
 * It does **not** decide that anybody has paid. Only `/api/payments/verify` and
 * the webhook do that, and both check a signature first.
 */
import { NextResponse } from "next/server";

import { writeAudit } from "@/lib/auth/audit";
import { getCurrentUser } from "@/lib/auth/guards";
import { getFeeStatus } from "@/lib/data/fees";
import { connectToDatabase } from "@/lib/db";
import { createOrder, mode, publishableKeyId } from "@/lib/payments/razorpay";
import { Enrollment } from "@/models/Enrollment";
import { Payment } from "@/models/Payment";
import { Program } from "@/models/Program";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  // `requireUser` would redirect, which is the wrong answer to fetch(). And an
  // explicit role check rather than `requireRole("student")`, which admits an
  // admin — the same call `submissions.ts` makes: an admin has no fees, and
  // letting one through would write a ledger row for a person with no enrolment.
  if (!user) {
    return NextResponse.json({ error: "Sign in to pay." }, { status: 401 });
  }
  if (user.role !== "student") {
    return NextResponse.json(
      { error: "Only a student can pay for a program." },
      { status: 403 },
    );
  }

  const paymentsMode = mode();
  if (paymentsMode === "off") {
    return NextResponse.json(
      { error: "Online payments aren't set up yet. Please contact the office." },
      { status: 503 },
    );
  }

  let body: { programSlug?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const programSlug =
    typeof body.programSlug === "string" ? body.programSlug : "";
  if (!programSlug) {
    return NextResponse.json({ error: "Which program?" }, { status: 400 });
  }

  const status = await getFeeStatus(user.id, programSlug);
  if (!status) {
    return NextResponse.json(
      { error: "You aren't enrolled on that program." },
      { status: 404 },
    );
  }

  if (status.unconfigured) {
    return NextResponse.json(
      { error: "There's no fee set for this program yet." },
      { status: 409 },
    );
  }
  if (status.isPaid || status.amountDue <= 0) {
    return NextResponse.json(
      { error: "This program is already paid for." },
      { status: 409 },
    );
  }
  // An Order is a one-time payment. A student on an instalment plan is paid by
  // subscription, which is not built — refuse rather than quietly charging them
  // the whole balance at once.
  if (status.chosen?.kind !== "full") {
    return NextResponse.json(
      { error: "Instalment plans aren't available yet." },
      { status: 409 },
    );
  }

  await connectToDatabase();

  const program = await Program.findOne({ slug: programSlug })
    .select("_id title")
    .lean();
  if (!program) {
    return NextResponse.json({ error: "No such program." }, { status: 404 });
  }

  const enrollment = await Enrollment.findById(status.enrollmentId)
    .select("_id")
    .lean();
  if (!enrollment) {
    return NextResponse.json({ error: "No such enrolment." }, { status: 404 });
  }

  /**
   * One open intent per enrolment, not one per click.
   *
   * An upsert rather than an insert, matched on the same key as the partial
   * unique index in `models/Payment.ts`: a second request for an enrolment that
   * already has a `created` full-payment row finds that row instead of opening
   * a second one. The index is what makes it hold under a genuine double-click,
   * where both requests can miss the read before either writes — one insert
   * wins, the loser gets E11000 and re-reads.
   *
   * `status` is not in the filter because it is not in the index key; the
   * partial filter narrows to `created` rows, so a captured row is invisible
   * here and cannot be reopened.
   */
  const openIntent = {
    enrollmentId: enrollment._id,
    kind: "full" as const,
    status: "created" as const,
  };

  type OpenPayment = { _id: unknown; amount: number; razorpayOrderId: string | null };

  const findOpen = () =>
    Payment.findOne(openIntent)
      .select("_id amount razorpayOrderId")
      .lean<OpenPayment | null>();

  let payment: OpenPayment;
  try {
    const upserted = await Payment.findOneAndUpdate(
      openIntent,
      {
        $setOnInsert: {
          studentId: user.id,
          programId: program._id,
          // Null: paying in full has no plan row. See models/Payment.ts.
          feePlanId: null,
          amount: status.amountDue,
          currency: "INR",
        },
      },
      { upsert: true, returnDocument: "after" },
    )
      .select("_id amount razorpayOrderId")
      .lean<OpenPayment | null>();

    if (!upserted) throw new Error("Upsert returned nothing.");
    payment = upserted;
  } catch (error) {
    // A concurrent click inserted first and the unique index refused ours.
    // Its row is the one we both wanted.
    const raced = await findOpen();
    if (!raced) {
      console.error("[api/payments/order] could not open a payment:", error);
      return NextResponse.json(
        { error: "We couldn't start the payment. Please try again." },
        { status: 502 },
      );
    }
    payment = raced;
  }

  const receipt = String(payment._id);

  /**
   * Already has an order, for the amount still owed: hand back the same one.
   *
   * This is the double-click's second request, or a student who abandoned
   * Checkout and pressed Pay again. Re-opening the same Razorpay order is
   * exactly right — an order is not money, and one order cannot be paid twice.
   */
  if (payment.razorpayOrderId && payment.amount === status.amountDue) {
    return NextResponse.json({
      mode: paymentsMode,
      paymentId: receipt,
      orderId: payment.razorpayOrderId,
      amount: payment.amount,
      currency: "INR",
      keyId: publishableKeyId(),
      programTitle: program.title,
      prefill: { name: user.name, email: user.email },
    });
  }

  /**
   * The row is open but priced at something else — the fee was changed while an
   * intent sat abandoned. Re-price it and mint a fresh order rather than
   * charging yesterday's amount. `capturePayment` would refuse the mismatch
   * anyway; this is what stops it getting that far.
   *
   * The stale order id is cleared with the same write, so the claim below can
   * take the row. Left in place it would fail the `razorpayOrderId: null` match
   * and hand the student back the order at the old price.
   */
  if (payment.amount !== status.amountDue) {
    await Payment.updateOne(
      { _id: payment._id, status: "created" },
      { $set: { amount: status.amountDue, razorpayOrderId: null } },
    );
  }

  let order;
  try {
    order = await createOrder({
      amountPaise: status.amountDue,
      receipt,
      notes: {
        paymentId: receipt,
        enrollmentId: String(enrollment._id),
        studentId: user.id,
        programSlug,
      },
    });
  } catch (error) {
    console.error("[api/payments/order] Razorpay refused:", error);

    // The row stays, marked failed. An order that was never created is still
    // an attempt somebody made, and a swept row is a support call nobody can
    // answer.
    await Payment.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: "failed",
          failureReason: "Could not create the order with Razorpay.",
        },
      },
    );

    return NextResponse.json(
      { error: "We couldn't start the payment. Please try again." },
      { status: 502 },
    );
  }

  /**
   * Claim the row for this order, or lose the race and use the winner's.
   *
   * Matching on `razorpayOrderId: null` is what makes the row hold **one**
   * order. Three simultaneous clicks all miss the reuse branch above — none of
   * them has written an id yet — and each mints its own order at Razorpay; an
   * unconditional `$set` would leave whichever landed last, while two browsers
   * had already been handed the other two. Two Checkout modals on two live
   * orders for one intent is the double charge again, one layer down.
   *
   * The losers' orders are simply abandoned. An order is not money and was
   * never shown to anyone; it expires unpaid.
   */
  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, razorpayOrderId: null },
    { $set: { razorpayOrderId: order.id } },
    { returnDocument: "after" },
  )
    .select("razorpayOrderId")
    .lean<{ razorpayOrderId: string | null } | null>();

  if (!claimed) {
    const winner = await Payment.findById(payment._id)
      .select("razorpayOrderId amount")
      .lean<{ razorpayOrderId: string | null; amount: number } | null>();

    if (winner?.razorpayOrderId) {
      return NextResponse.json({
        mode: paymentsMode,
        paymentId: receipt,
        orderId: winner.razorpayOrderId,
        amount: winner.amount,
        currency: "INR",
        keyId: publishableKeyId(),
        programTitle: program.title,
        prefill: { name: user.name, email: user.email },
      });
    }
  }

  await writeAudit(user, {
    action: "payment.start",
    targetType: "Payment",
    targetId: receipt,
    summary: `Started paying for ${program.title}`,
    meta: { programSlug, amount: status.amountDue, mode: paymentsMode },
  });

  return NextResponse.json({
    mode: paymentsMode,
    paymentId: receipt,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    // Null in mock mode, which is what tells the browser to render the
    // simulate control instead of trying to open Checkout.
    keyId: publishableKeyId(),
    programTitle: program.title,
    prefill: { name: user.name, email: user.email },
  });
}
