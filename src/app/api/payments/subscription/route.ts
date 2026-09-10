/**
 * POST /api/payments/subscription — start paying an instalment plan.
 *
 * The EMI counterpart of `/api/payments/order`, and separate from it because
 * the two Razorpay objects behave nothing alike. An **order** is one payment we
 * price ourselves; a **subscription** is a standing instruction that charges on
 * its own for months. Squeezing both through one route would mean a function
 * whose every branch asked which of two flows it was in.
 *
 * ## What is created, and where the down payment goes
 *
 * One subscription against the plan's immutable `razorpayPlanId`, with
 * `total_count` set to the schedule's cycles and the down payment attached as
 * an `addons[]` entry. The addon is charged in the **authorisation
 * transaction** — the one the student sees at Checkout — so the first payment
 * is `upfrontAmount + cycleAmount` together, and every later month is the cycle
 * alone. That is also where the rounding remainder lives, because every cycle
 * of a Razorpay plan is identical and an arbitrary total rarely divides evenly.
 *
 * ## No `Payment` row is created here
 *
 * The order route opens one before it calls Razorpay, because a one-time
 * payment is exactly one payment and its id can be the receipt. Nothing
 * equivalent is possible for a subscription: how many cycles will be paid, and
 * when, is not knowable now. Rows are written by `captureSubscriptionCycle` as
 * each charge lands, and their idempotency comes from the unique index on
 * `razorpayPaymentId`.
 *
 * So this route takes no money and settles nothing. It creates the instruction;
 * the webhook records what it collects.
 *
 * ## The subscription id is the enrolment's, not the request's
 *
 * Stored on `Enrollment.razorpaySubscriptionId` and reused while it is still
 * live, so a double-clicked Pay button authorises one mandate rather than two —
 * the same failure the order route's partial unique index guards against, in
 * the shape this flow takes.
 */
import { NextResponse } from "next/server";

import { writeAudit } from "@/lib/auth/audit";
import { getCurrentUser } from "@/lib/auth/guards";
import { getFeeStatus } from "@/lib/data/fees";
import { connectToDatabase } from "@/lib/db";
import {
  createSubscription,
  fetchSubscription,
  isReusableSubscription,
  mode,
  publishableKeyId,
} from "@/lib/payments/razorpay";
import { Enrollment } from "@/models/Enrollment";
import { FeePlan } from "@/models/FeePlan";
import { Program } from "@/models/Program";
import { User } from "@/models/User";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  // The same pair of checks as the order route, for the same reason: an admin
  // has no enrolment, and `requireRole("student")` would admit one.
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
  if (status.isPaid) {
    return NextResponse.json(
      { error: "This program is already paid for." },
      { status: 409 },
    );
  }

  /**
   * The plan comes from what they have **chosen**, never from the request.
   *
   * `chooseFeePlan` is what moves a student onto a schedule, and it enforces
   * the rules about switching after money has moved. Accepting a plan id here
   * would be a second, weaker copy of that gate — and the two would drift.
   */
  const chosen = status.chosen;
  if (!chosen || chosen.kind !== "emi") {
    return NextResponse.json(
      { error: "You're paying in full — use the Pay button instead." },
      { status: 409 },
    );
  }
  if (!chosen.available) {
    return NextResponse.json(
      { error: "That plan can't be paid online yet. Please contact the office." },
      { status: 409 },
    );
  }

  await connectToDatabase();

  const [program, plan, enrollment, person] = await Promise.all([
    Program.findOne({ slug: programSlug }).select("_id title").lean(),
    FeePlan.findById(chosen.id)
      .select("_id razorpayPlanId totalCycles upfrontAmount cycleAmount label status")
      .lean(),
    Enrollment.findById(status.enrollmentId)
      .select("_id razorpaySubscriptionId")
      .lean(),
    // Only for the phone number — the session does not carry one, and Checkout
    // wants a contact on a subscription authorisation.
    User.findById(user.id).select("phone").lean(),
  ]);

  /**
   * What Checkout prefills.
   *
   * `contact` is in Razorpay's own subscription example and was missing here:
   * authorising a mandate collects more customer detail than a one-off payment
   * does, and an empty contact leaves the student typing their number into a
   * third-party modal mid-payment. Sent only when we actually hold one — a
   * blank string is worse than an absent field, because Checkout will render it
   * as a filled-in-but-invalid box.
   */
  const prefill = {
    name: user.name,
    email: user.email,
    ...(person?.phone ? { contact: person.phone } : {}),
  };

  if (!program) {
    return NextResponse.json({ error: "No such program." }, { status: 404 });
  }
  if (!enrollment) {
    return NextResponse.json({ error: "No such enrolment." }, { status: 404 });
  }
  if (!plan?.razorpayPlanId) {
    // `available` above should already have caught this; a plan archived
    // between that read and this one lands here.
    return NextResponse.json(
      { error: "That plan can't be paid online yet. Please contact the office." },
      { status: 409 },
    );
  }

  /**
   * Reuse the mandate this enrolment already has, if it is still worth having.
   *
   * A student who opened Checkout and closed it has a `created` subscription
   * that is perfectly good — re-authorising the same one is right, and minting
   * a second would leave two standing instructions against one fee, of which
   * the abandoned one might still be authorised later by a stale tab.
   *
   * Razorpay is asked rather than trusted from our own field: a subscription
   * can be cancelled or expire without us hearing about it, and `active` also
   * means "already paying", which is not something to hand back to Checkout.
   */
  if (enrollment.razorpaySubscriptionId) {
    const existing = await fetchSubscription(enrollment.razorpaySubscriptionId);

    if (existing && isReusableSubscription(existing.status)) {
      // Already authorised and charging: there is nothing for the browser to
      // do, and re-opening Checkout on it would ask for a second mandate.
      if (existing.status !== "created") {
        return NextResponse.json(
          {
            error:
              "Your instalment plan is already set up. The next payment is collected automatically.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json({
        mode: paymentsMode,
        subscriptionId: existing.id,
        keyId: publishableKeyId(),
        programTitle: program.title,
        planLabel: plan.label,
        firstAmount: (plan.upfrontAmount ?? 0) + (plan.cycleAmount ?? 0),
        totalCycles: plan.totalCycles,
        prefill,
      });
    }
  }

  let subscription;
  try {
    subscription = await createSubscription({
      planId: plan.razorpayPlanId,
      totalCycles: plan.totalCycles,
      upfrontPaise: plan.upfrontAmount ?? 0,
      /**
       * These notes are the join back to us, and they are the **only** one:
       * unlike the order flow there is no receipt and no pre-made row to point
       * at. Every subscription webhook carries them on the subscription entity,
       * which is what lets `captureSubscriptionCycle` file month seven against
       * the right enrolment with no browser involved. Razorpay allows 15 pairs.
       */
      notes: {
        enrollmentId: String(enrollment._id),
        studentId: user.id,
        programId: String(program._id),
        feePlanId: String(plan._id),
        programSlug,
      },
    });
  } catch (error) {
    console.error("[api/payments/subscription] Razorpay refused:", error);

    return NextResponse.json(
      { error: "We couldn't set up the instalment plan. Please try again." },
      { status: 502 },
    );
  }

  await Enrollment.updateOne(
    { _id: enrollment._id },
    { $set: { razorpaySubscriptionId: subscription.id } },
  );

  await writeAudit(user, {
    action: "subscription.start",
    targetType: "Enrollment",
    targetId: String(enrollment._id),
    summary: `Started "${plan.label}" (${plan.totalCycles} instalments) for ${program.title}`,
    meta: {
      programSlug,
      subscriptionId: subscription.id,
      razorpayPlanId: plan.razorpayPlanId,
      totalCycles: plan.totalCycles,
      upfrontAmount: plan.upfrontAmount ?? 0,
      mode: paymentsMode,
    },
  });

  return NextResponse.json({
    mode: paymentsMode,
    subscriptionId: subscription.id,
    // Null in mock mode, which is what tells the browser to simulate rather
    // than open Checkout — the same signal the order route sends.
    keyId: publishableKeyId(),
    programTitle: program.title,
    planLabel: plan.label,
    /** What Checkout will actually take today: the down payment plus cycle one. */
    firstAmount: (plan.upfrontAmount ?? 0) + (plan.cycleAmount ?? 0),
    totalCycles: plan.totalCycles,
    prefill,
  });
}
