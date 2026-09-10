import "server-only";

import { Types } from "mongoose";

import { assertScope, type CurrentUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { connectToDatabase } from "@/lib/db";
import { FULL_PAYMENT_OPTION_ID } from "@/lib/payments/plan-kinds";
import { Enrollment } from "@/models/Enrollment";
import { FeePlan } from "@/models/FeePlan";
import { Payment, type PaymentKind, type PaymentStatus } from "@/models/Payment";
import { Program } from "@/models/Program";
import { User } from "@/models/User";

/**
 * Where "has this student paid?" is answered — **once**, for every screen.
 *
 * The dashboard banner, the program card, the route gate, the fee page and the
 * staff roster all call `getFeeStatus`. That is the whole point of the module:
 * two definitions of "paid" is how a dashboard ends up inviting someone into a
 * course the gate then throws them out of. Same argument as `data/enrolled.ts`
 * replacing the second copy of "enrolled".
 *
 * ## Nothing here is stored
 *
 * Every number below is counted from the `Payment` ledger at read time. There is
 * no `amountPaid` on the enrolment and no `installmentsPaid` counter anywhere —
 * see `models/Payment.ts` for the failure that prevents. A handful of rows per
 * student makes the sum free; if it ever stops being free, a cached total is a
 * later optimisation *over* this, never instead of it.
 *
 * ## Paying in full is not a plan
 *
 * It is `Program.feeAmount`, and it is always on the menu. Only instalments need
 * a `FeePlan`, because only instalments need a Razorpay plan object. So the
 * chooser's list is **one synthetic full-payment option plus the program's
 * instalment plans**, and `Enrollment.feePlanId === null` means "paying in
 * full" rather than "hasn't decided".
 *
 * That is deliberately not a state anybody can get stuck in: a student who never
 * opens the chooser owes the full fee, which is correct.
 *
 * ## A program with no fee is not gated
 *
 * `Program.feeAmount === null` means nobody has priced it, and its students
 * reach it exactly as they did before this feature existed. Treating that as
 * "unpaid" would lock out every enrolment made before today, which is a worse
 * failure than a forgotten price — and a forgotten price is visible on the admin
 * screen, where a locked-out cohort would just look like a bug.
 */

/** One way of paying, as the student's chooser renders it. */
export type FeePlanOption = {
  /** A plan's id, or `FULL_PAYMENT_OPTION_ID` for the synthetic full option. */
  id: string;
  kind: "full" | "emi";
  label: string;
  description: string;
  /** What the program costs on this option, in paise — what gets charged. */
  totalAmount: number;
  /**
   * The undiscounted price to strike through, or null when there is nothing to
   * show. Never charged; see `Program.listAmount`.
   */
  listAmount: number | null;
  /** EMI only — null on the full-payment option. */
  cycleAmount: number | null;
  totalCycles: number | null;
  upfrontAmount: number | null;
  /**
   * Whether the student can actually pick it today.
   *
   * True for paying in full, always. True for an instalment plan once it has a
   * Razorpay plan behind it — which `createFeePlan` now mints before saving the
   * row, so anything created from here on is immediately collectable. Rows that
   * predate subscriptions have none and stay visible-but-unpickable: an option
   * that is shown and unavailable beats one that vanishes, because the admin
   * agreed those terms with somebody and a student who was told about a 9-month
   * plan should see it exists rather than conclude they were misled.
   */
  available: boolean;
  /** Staff suggested this one. Advisory — it changes a badge, nothing else. */
  recommended: boolean;
};

export type FeeStatus = {
  enrollmentId: string;
  programSlug: string;
  /** Paying in full, plus any instalment plans. Empty when the program is free. */
  options: FeePlanOption[];
  /**
   * What they are on. Never null while the program has a fee — a student who has
   * chosen nothing is on the full-payment option, which is the default.
   */
  chosen: FeePlanOption | null;
  /** The program has no fee, so nothing is owed and nothing is gated. */
  unconfigured: boolean;
  /**
   * This student has a price of their own, set by an admin. Instalment plans
   * are withheld while it applies — see `Enrollment.customFeeAmount`.
   */
  hasCustomPrice: boolean;
  /**
   * Whether they may still switch. False once money has moved — except onto the
   * full-payment option, which stays open so somebody on instalments can settle
   * the balance early. `chooseFeePlan` enforces both halves.
   */
  canChoose: boolean;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  isPaid: boolean;
  /** Instalments settled. Always 0 while paying in full. */
  cyclesPaid: number;
  cyclesTotal: number;
  cyclesRemaining: number;
  lastPaidAt: Date | null;
};

/** The program carries no fee, so nothing is owed and nothing is gated. */
function openStatus(enrollmentId: string, programSlug: string): FeeStatus {
  return {
    enrollmentId,
    programSlug,
    options: [],
    chosen: null,
    unconfigured: true,
    hasCustomPrice: false,
    canChoose: false,
    totalAmount: 0,
    amountPaid: 0,
    amountDue: 0,
    isPaid: true,
    cyclesPaid: 0,
    cyclesTotal: 0,
    cyclesRemaining: 0,
    lastPaidAt: null,
  };
}

/**
 * The full-payment price, wearing an option's clothes.
 *
 * `feeAmount` is already resolved by the caller: a student's own
 * `customFeeAmount` if they have one, otherwise `Program.feeAmount`. The struck
 * price is dropped when a custom price applies — "was ₹49,999, now ₹12,000
 * (just for you)" invites a comparison the student was never offered, and the
 * list price is a claim about the public price, not about their deal.
 */
function fullOption(
  feeAmount: number,
  listAmount: number | null,
  recommended: boolean,
): FeePlanOption {
  return {
    id: FULL_PAYMENT_OPTION_ID,
    kind: "full",
    label: "Pay in full",
    description: "One payment, no recurring charge.",
    totalAmount: feeAmount,
    listAmount: listAmount && listAmount > feeAmount ? listAmount : null,
    cycleAmount: null,
    totalCycles: null,
    upfrontAmount: null,
    // Always. This is the option that cannot be taken away — there is no row to
    // archive, which is the whole reason the price lives on the program.
    available: true,
    recommended,
  };
}

type PlanRow = {
  _id: unknown;
  label: string;
  description?: string | null;
  totalAmount: number;
  cycleAmount?: number | null;
  totalCycles?: number | null;
  upfrontAmount?: number | null;
  /**
   * Decides `available`, so it is tested for truth rather than against null: a
   * query that forgot to select it reads as `undefined`, and the safe way to
   * fail is "not collectable" rather than offering a plan with nothing behind
   * it. Both current callers `.lean()` the whole document.
   */
  razorpayPlanId?: string | null;
};

function emiOption(plan: PlanRow, recommended: boolean): FeePlanOption {
  return {
    id: String(plan._id),
    kind: "emi",
    label: plan.label,
    description: plan.description ?? "",
    totalAmount: plan.totalAmount,
    // An instalment plan carries its own total and no struck price: the saving
    // it advertises would be against a figure it costs more than.
    listAmount: null,
    cycleAmount: plan.cycleAmount ?? null,
    totalCycles: plan.totalCycles ?? null,
    upfrontAmount: plan.upfrontAmount ?? null,
    /**
     * Collectable exactly when there is a Razorpay plan to charge against.
     *
     * `createFeePlan` creates that plan before it writes the row, so anything
     * added from now on is available the moment it is saved. Rows that predate
     * subscriptions have `razorpayPlanId: null` and stay visible-but-unpickable
     * — which is the honest answer for them: the terms were agreed with
     * somebody, and no plan exists to collect them. Re-create such a plan to
     * make it live; it cannot be back-filled, because the row's `cycleAmount`
     * would then have to match an object created later from different terms.
     */
    available: Boolean(plan.razorpayPlanId),
    recommended,
  };
}

/**
 * The fee position of one student on one program.
 *
 * Returns null only when there is no such enrolment — "not on this program" is
 * a different answer from "on it and owing nothing", and the caller decides
 * what each means.
 */
export async function getFeeStatus(
  studentId: string,
  programSlug: string,
): Promise<FeeStatus | null> {
  await connectToDatabase();

  if (!Types.ObjectId.isValid(studentId)) return null;

  const program = await Program.findOne({ slug: programSlug })
    .select("_id feeAmount listAmount")
    .lean();
  if (!program) return null;

  const enrollment = await Enrollment.findOne({
    studentId,
    programId: program._id,
    status: { $ne: "withdrawn" },
  })
    .select("_id feePlanId recommendedFeePlanId customFeeAmount")
    .lean();
  if (!enrollment) return null;

  const enrollmentId = String(enrollment._id);

  /**
   * Whose price applies: this student's own if an admin set one, otherwise the
   * program's. One line, and the only place the precedence is decided.
   *
   * A custom price of zero is a real answer — a free seat — and must not fall
   * through to the program's fee, which is why this tests for null rather than
   * for truthiness.
   */
  const hasCustomPrice = enrollment.customFeeAmount !== null &&
    enrollment.customFeeAmount !== undefined;
  const price = hasCustomPrice
    ? (enrollment.customFeeAmount as number)
    : (program.feeAmount ?? null);

  // Nobody has priced this program, and this student has no price of their own.
  if (price === null) return openStatus(enrollmentId, programSlug);

  // A free seat: priced, deliberately, at nothing. Distinct from an unpriced
  // program — staff chose this, and the roster should say so.
  if (price === 0) {
    return {
      ...openStatus(enrollmentId, programSlug),
      unconfigured: false,
      hasCustomPrice,
      options: [fullOption(0, null, true)],
      chosen: fullOption(0, null, true),
    };
  }

  /**
   * What the program offers, and what this student is on — read together.
   *
   * The chosen plan is fetched by id rather than found among the active ones
   * because an archived plan is off the menu but still binding on everyone
   * already on it: a student who signed up on last term's terms keeps them, and
   * archiving must not silently reprice them.
   */
  const [active, chosenPlan] = await Promise.all([
    // Withheld entirely from a student on their own price: a plan's schedule
    // adds up to that plan's total, not to theirs. See Enrollment.customFeeAmount.
    hasCustomPrice
      ? Promise.resolve([])
      : FeePlan.find({ programId: program._id, status: "active" })
          .sort({ order: 1 })
          .lean(),
    enrollment.feePlanId
      ? FeePlan.findById(enrollment.feePlanId).lean()
      : Promise.resolve(null),
  ]);

  const recommendedId = enrollment.recommendedFeePlanId
    ? String(enrollment.recommendedFeePlanId)
    : null;

  const options: FeePlanOption[] = [
    // Full payment leads the list: it is the default, and the one always
    // available. An option the student already has needs no hunting for.
    // No struck price against a custom deal — see fullOption. The list price is
    // a claim about the public price, not about this student's arrangement.
    fullOption(
      price,
      hasCustomPrice ? null : (program.listAmount ?? null),
      recommendedId === null,
    ),
    ...active.map((plan) => emiOption(plan, String(plan._id) === recommendedId)),
  ];

  /**
   * Only `captured` counts. A `created` row is an intent — somebody opened
   * Checkout — and a `refunded` one is money that came back; counting either
   * would tell a student they had paid when they had not.
   */
  const paid = await Payment.find({
    enrollmentId: enrollment._id,
    status: "captured",
  })
    .select("amount cycleNumber paidAt")
    .sort({ paidAt: 1 })
    .lean();

  const amountPaid = paid.reduce((total, row) => total + (row.amount ?? 0), 0);

  // The archived-plan case is why this is not simply `options.find(...)`.
  const chosen =
    chosenPlan && !hasCustomPrice
      ? emiOption(chosenPlan, String(chosenPlan._id) === recommendedId)
      : fullOption(
          price,
          hasCustomPrice ? null : (program.listAmount ?? null),
          recommendedId === null,
        );

  const totalAmount = chosen.totalAmount;

  /**
   * The **highest** cycle Razorpay reported, not the number of rows.
   *
   * Counting rows would be wrong twice over: the upfront payment is a row but
   * not a cycle, and a webhook replayed out of order would move the count
   * backwards. `cycleNumber` is what Razorpay said this payment was, so the
   * furthest one reached is how far the student has got.
   */
  const cyclesPaid = paid.reduce(
    (highest, row) => Math.max(highest, row.cycleNumber ?? 0),
    0,
  );
  const cyclesTotal = chosen.totalCycles ?? 0;

  return {
    enrollmentId,
    programSlug,
    options,
    chosen,
    unconfigured: false,
    hasCustomPrice,
    // Free to switch until money has moved. After that the only move left is
    // onto the full-payment option, which `chooseFeePlan` allows separately.
    canChoose: amountPaid === 0,
    totalAmount,
    amountPaid,
    // Never negative: an overpayment (a refund not yet recorded, a duplicate
    // settled by hand) should read as nothing due, not as a credit the fee
    // page would then have to explain.
    amountDue: Math.max(0, totalAmount - amountPaid),
    isPaid: amountPaid >= totalAmount,
    cyclesPaid,
    cyclesTotal,
    cyclesRemaining: Math.max(0, cyclesTotal - cyclesPaid),
    lastPaidAt: paid.length > 0 ? (paid[paid.length - 1].paidAt ?? null) : null,
  };
}

/** Fee status for several programs at once — what the dashboard needs. */
export async function getFeeStatuses(
  studentId: string,
  programSlugs: string[],
): Promise<Map<string, FeeStatus>> {
  const rows = await Promise.all(
    programSlugs.map((slug) => getFeeStatus(studentId, slug)),
  );

  const map = new Map<string, FeeStatus>();
  for (const row of rows) {
    if (row) map.set(row.programSlug, row);
  }

  return map;
}

/* ------------------------- one student's fee record ------------------------- */

/** One line of the ledger, as the staff dialog renders it. */
export type FeeRecordRow = {
  id: string;
  status: PaymentStatus;
  kind: PaymentKind;
  amount: number;
  /** Which instalment, or null on a one-time payment. */
  cycleNumber: number | null;
  method: string;
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  razorpaySubscriptionId: string | null;
  /** Razorpay's `error_description`, on a failed row. */
  failureReason: string;
  /** Set when staff recorded a payment taken off-platform. */
  offline: boolean;
  note: string;
  paidAt: Date | null;
  createdAt: Date;
};

export type StudentFeeRecord = {
  student: { id: string; name: string; email: string };
  programTitle: string;
  status: FeeStatus;
  /** Every row, including failed and refunded ones. Newest first. */
  rows: FeeRecordRow[];
  /** The mandate collecting instalments, or null. */
  subscriptionId: string | null;
};

/**
 * Every payment row for one student on one program — **the full ledger, not the
 * summary**.
 *
 * `getFeeStatus` answers "have they paid"; this answers "show me exactly what
 * happened", which is a different question asked by a different person at a
 * different moment: somebody on the phone to a student who says they were
 * charged twice, or that a payment failed and the money left their account.
 * That conversation needs the failed and refunded rows too, which every other
 * reader deliberately filters out — see the `captured`-only counting above.
 *
 * ## Admin only
 *
 * Gated on `fee.manage`, which a program manager does not hold. They keep
 * `fee.view`, which is the roster — who owes what, enough to chase a cohort.
 * This is a different tier of detail: Razorpay payment ids, failure
 * descriptions, what was refunded and what a member of staff recorded by hand.
 * It is the same line the codebase already draws around money — seeing a
 * balance is cohort work, reading the transaction history is not.
 *
 * The check is here rather than only on the screen, because a component that
 * forgets to render a button is not a permission.
 */
export async function studentFeeRecord(
  user: CurrentUser,
  programSlug: string,
  studentId: string,
): Promise<StudentFeeRecord | null> {
  assertScope(user, { program: programSlug });

  if (!can(user, "fee.manage")) return null;
  if (!Types.ObjectId.isValid(studentId)) return null;

  await connectToDatabase();

  const program = await Program.findOne({ slug: programSlug })
    .select("_id title")
    .lean();
  if (!program) return null;

  // Scoped by program in the query, like `studentDetail`: a student who is not
  // on this program is not found here even for an admin.
  const enrollment = await Enrollment.findOne({
    programId: program._id,
    studentId,
  })
    .select("_id razorpaySubscriptionId")
    .lean();
  if (!enrollment) return null;

  const [person, status, rows] = await Promise.all([
    User.findOne({ _id: studentId, role: "student" })
      .select("name email")
      .lean(),
    getFeeStatus(studentId, programSlug),
    Payment.find({ enrollmentId: enrollment._id })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  if (!person || !status) return null;

  return {
    student: {
      id: String(studentId),
      name: person.name,
      email: person.email,
    },
    programTitle: program.title,
    status,
    subscriptionId: enrollment.razorpaySubscriptionId ?? null,
    rows: rows.map((row) => ({
      id: String(row._id),
      status: row.status as PaymentStatus,
      kind: row.kind as PaymentKind,
      amount: row.amount,
      cycleNumber: row.cycleNumber ?? null,
      method: row.method ?? "",
      razorpayPaymentId: row.razorpayPaymentId ?? null,
      razorpayOrderId: row.razorpayOrderId ?? null,
      razorpaySubscriptionId: row.razorpaySubscriptionId ?? null,
      failureReason: row.failureReason ?? "",
      // `createdBy` is only ever set when staff recorded the payment by hand.
      offline: Boolean(row.createdBy),
      note: row.note ?? "",
      paidAt: row.paidAt ?? null,
      createdAt: row.createdAt,
    })),
  };
}

export type FeeRosterRow = {
  studentId: string;
  name: string;
  email: string;
  /** The cohort label, or "" — the ungrouped bucket the screen calls "No batch". */
  batch: string;
  /** The instalment plan they chose. Null means they are paying in full. */
  planId: string | null;
  planLabel: string;
  /** What staff suggested, if anything. Advisory. */
  recommendedPlanId: string | null;
  /** This student's own price, in paise, or null when they pay the program's. */
  customFeeAmount: number | null;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  isPaid: boolean;
  hasStartedPaying: boolean;
};

/** One cohort's fee position — the batch layer over the roster. */
export type FeeBatchGroup = {
  /** "" for students with no cohort; the screen labels that bucket. */
  batch: string;
  rows: FeeRosterRow[];
  collected: number;
  outstanding: number;
  paidCount: number;
  unpaidCount: number;
};

/**
 * The roster, split by cohort.
 *
 * Grouping happens here rather than in the component because the subtotals are
 * the point — "this batch owes ₹2.4L" is the number somebody opens the screen
 * for, and a component that filtered rows would have to re-derive it every
 * render and get it right the same way twice.
 *
 * Batches are ordered by how much they owe, most first, and the no-batch bucket
 * always sorts last: it is a data-tidiness problem rather than a cohort, and it
 * should not head a screen about chasing money.
 */
export function groupRosterByBatch(rows: FeeRosterRow[]): FeeBatchGroup[] {
  const byBatch = new Map<string, FeeRosterRow[]>();

  for (const row of rows) {
    const list = byBatch.get(row.batch);
    if (list) list.push(row);
    else byBatch.set(row.batch, [row]);
  }

  const groups = [...byBatch.entries()].map(([batch, batchRows]) => ({
    batch,
    rows: batchRows,
    collected: batchRows.reduce((total, row) => total + row.amountPaid, 0),
    outstanding: batchRows.reduce(
      (total, row) => total + (row.isPaid ? 0 : row.amountDue),
      0,
    ),
    paidCount: batchRows.filter((row) => row.isPaid).length,
    unpaidCount: batchRows.filter((row) => !row.isPaid).length,
  }));

  return groups.sort((a, b) => {
    if (!a.batch !== !b.batch) return a.batch ? -1 : 1;
    if (a.outstanding !== b.outstanding) return b.outstanding - a.outstanding;
    return a.batch.localeCompare(b.batch);
  });
}

/**
 * Who has paid, for one program. The staff side of `getFeeStatus`.
 *
 * Returns an empty list for a program with no fee — there is nothing to chase,
 * and a roster of "paid ₹0" rows would imply otherwise. The screen says the
 * program is unpriced instead.
 */
export async function programFeeRoster(
  programSlug: string,
): Promise<FeeRosterRow[]> {
  await connectToDatabase();

  const program = await Program.findOne({ slug: programSlug })
    .select("_id feeAmount")
    .lean();
  const feeAmount = program?.feeAmount;
  // No fee: nothing to chase, and a roster of "paid ₹0" rows would imply there
  // was. The screen says the program is unpriced instead.
  if (!feeAmount) return [];

  const enrollments = await Enrollment.find({
    programId: program._id,
    status: { $ne: "withdrawn" },
  })
    .select("studentId batch feePlanId recommendedFeePlanId customFeeAmount")
    .lean();

  if (enrollments.length === 0) return [];

  const [students, plans, paidRows] = await Promise.all([
    User.find({ _id: { $in: enrollments.map((row) => row.studentId) } })
      .select("_id name email")
      .lean(),
    FeePlan.find({ programId: program._id }).select("_id label totalAmount").lean(),
    // One grouped read rather than one per student: a roster is the place a
    // per-row query turns into three hundred of them.
    Payment.aggregate<{ _id: unknown; total: number }>([
      {
        $match: {
          enrollmentId: { $in: enrollments.map((row) => row._id) },
          status: "captured",
        },
      },
      { $group: { _id: "$enrollmentId", total: { $sum: "$amount" } } },
    ]),
  ]);

  const studentById = new Map(students.map((row) => [String(row._id), row]));
  const planById = new Map(plans.map((row) => [String(row._id), row]));
  const paidByEnrollment = new Map(
    paidRows.map((row) => [String(row._id), row.total]),
  );

  return enrollments
    .map((enrollment) => {
      const student = studentById.get(String(enrollment.studentId));
      if (!student) return null;

      const plan = enrollment.feePlanId
        ? planById.get(String(enrollment.feePlanId))
        : undefined;

      /**
       * Same precedence as `getFeeStatus`, and it has to stay the same: this
       * screen and the student's own page must never quote different figures.
       * A custom price wins outright (and withholds plans); otherwise it is the
       * chosen plan's total, or the program's fee.
       */
      const custom =
        enrollment.customFeeAmount === null ||
        enrollment.customFeeAmount === undefined
          ? null
          : enrollment.customFeeAmount;

      const totalAmount = custom ?? plan?.totalAmount ?? feeAmount;
      const amountPaid = paidByEnrollment.get(String(enrollment._id)) ?? 0;

      return {
        studentId: String(student._id),
        name: student.name,
        email: student.email,
        batch: enrollment.batch ?? "",
        planId: custom === null && plan ? String(plan._id) : null,
        planLabel: custom !== null ? "Custom price" : (plan?.label ?? "Pay in full"),
        customFeeAmount: custom,
        recommendedPlanId: enrollment.recommendedFeePlanId
          ? String(enrollment.recommendedFeePlanId)
          : null,
        totalAmount,
        amountPaid,
        amountDue: Math.max(0, totalAmount - amountPaid),
        isPaid: amountPaid >= totalAmount,
        hasStartedPaying: amountPaid > 0,
      } satisfies FeeRosterRow;
    })
    .filter((row): row is FeeRosterRow => row !== null)
    // Unpaid first: this screen exists to be worked through, and the people who
    // owe money are the reason somebody opened it.
    .sort((a, b) => {
      if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
}

/** Where an unpaid student is sent, and where the Pay button points. */
export function feesHref(programSlug: string): string {
  return `/dashboard/${programSlug}/fees`;
}
