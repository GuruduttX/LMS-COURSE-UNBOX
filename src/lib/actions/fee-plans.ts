"use server";

/**
 * What a program costs, what instalment schedules it offers, and which one
 * staff suggest to a given student.
 *
 * The house order, in full: **requireRole → can() → assertScope → validate →
 * write → writeAudit → revalidate**.
 *
 * ## Two different things live here
 *
 * `setProgramFee` sets the price — one number on the program, which is all
 * paying in full needs. `createFeePlan` adds an instalment schedule, which is a
 * `FeePlan` row because it will one day mirror a Razorpay plan. Paying in full
 * is never a row; see `models/FeePlan.ts`.
 *
 * ## Plans can be created and archived, never edited
 *
 * Not an omission. A Razorpay plan is immutable on their side, so an editable
 * row here would drift from the object it mirrors; and terms a student already
 * signed up on must not change under them. Revising is "create the new one,
 * archive the old one", which also leaves both on the record.
 *
 * ## Only admin sets a price
 *
 * `fee.manage` is admin-only. A program manager holds `fee.view` — chasing a
 * cohort's outstanding fees is cohort work — but what the program costs is a
 * business decision.
 */
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { Types } from "mongoose";

import { writeAudit } from "@/lib/auth/audit";
import { assertScope, requireRole } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { revalidatePublic } from "@/lib/actions/revalidate";
import { connectToDatabase } from "@/lib/db";
import { formatPaise, parseRupees } from "@/lib/payments/money";
import { createPlan, mode } from "@/lib/payments/razorpay";
import {
  MAX_FEE_PLANS_PER_PROGRAM,
  isFeePlanPeriod,
} from "@/lib/payments/plan-kinds";
import {
  validateCustomFee,
  validateFeePlan,
  validateProgramFee,
  type CustomFeeErrors,
  type CustomFeeInput,
  type FeePlanErrors,
  type FeePlanInput,
  type ProgramFeeErrors,
  type ProgramFeeInput,
} from "@/lib/validation/fee-plan";
import { Enrollment } from "@/models/Enrollment";
import { FeePlan } from "@/models/FeePlan";
import { Payment } from "@/models/Payment";
import { Program } from "@/models/Program";
import { User } from "@/models/User";

import type { ActionState, FormState } from "./curriculum-state";

export type ProgramFeeFormState = FormState<ProgramFeeInput, ProgramFeeErrors>;
export type CustomFeeFormState = FormState<CustomFeeInput, CustomFeeErrors>;
export type FeePlanFormState = FormState<FeePlanInput, FeePlanErrors>;

const DENIED = "You don't have permission to do that.";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Set — or clear — what a program costs.
 *
 * Clearing it (an empty field) means the program has no fee and opens without
 * payment. That is a real choice rather than a missing value, which is why it is
 * allowed and why the audit line says so in words.
 *
 * Repricing is permitted and only affects what is **still owed**: the ledger
 * records amounts, not percentages, so a student who has paid ₹20,000 of a
 * ₹34,999 fee owes ₹15,000 more if the price rises to ₹35,000. That is the
 * honest behaviour, but it does move the goalposts under people mid-program, so
 * the audit entry records both numbers.
 */
export async function setProgramFee(
  _previous: ProgramFeeFormState,
  formData: FormData,
): Promise<ProgramFeeFormState> {
  const actor = await requireRole("admin");
  const values: ProgramFeeInput = {
    feeAmount: text(formData, "feeAmount"),
    listAmount: text(formData, "listAmount"),
  };

  if (!can(actor, "fee.manage")) {
    return { ok: false, error: DENIED, errors: {}, values };
  }

  const programSlug = text(formData, "programSlug");
  assertScope(actor, { program: programSlug });

  const errors = validateProgramFee(values);
  if (Object.keys(errors).length > 0) return { ok: false, errors, values };

  await connectToDatabase();

  const program = await Program.findOne({ slug: programSlug })
    .select("_id title feeAmount listAmount")
    .lean();
  if (!program) notFound();

  const feeAmount =
    values.feeAmount.trim() === "" ? null : parseRupees(values.feeAmount);
  // Clearing the fee clears the struck price with it: a discount from something
  // to nothing is not a discount, and leaving it behind would strand a number
  // that the fee page could still find a way to render.
  const listAmount =
    feeAmount === null || values.listAmount.trim() === ""
      ? null
      : parseRupees(values.listAmount);

  await Program.updateOne(
    { _id: program._id },
    { $set: { feeAmount, listAmount } },
  );

  await writeAudit(actor, {
    action: "program.fee",
    targetType: "Program",
    targetId: String(program._id),
    summary: feeAmount
      ? `Set ${program.title}'s fee to ${formatPaise(feeAmount)}${
          listAmount ? ` (from ${formatPaise(listAmount)})` : ""
        }${program.feeAmount ? ` — was ${formatPaise(program.feeAmount)}` : ""}`
      : `Removed ${program.title}'s fee — it now opens without payment`,
    // Both figures, before and after. A price change is the entry somebody
    // comes looking for when a student says they were quoted something else.
    meta: {
      programSlug,
      feeAmount,
      listAmount,
      previousFee: program.feeAmount ?? null,
      previousList: program.listAmount ?? null,
    },
  });

  revalidatePath(`/admin/programs/${programSlug}/fees`);
  revalidatePath("/dashboard");
  // The price is on the public card and the program page, so setting it is a
  // change to the site as much as to the roster.
  revalidatePublic(programSlug);

  return { ok: true, errors: {}, values };
}

/**
 * Add an instalment schedule — **and create the Razorpay plan behind it.**
 *
 * ## Razorpay first, then the row
 *
 * Deliberately that order. A row saved with `razorpayPlanId: null` is an option
 * `getFeeStatus` marks unavailable — visible to the student, impossible to pick
 * — and every one of those is a support conversation about a plan that looks
 * real and is not. Failing before anything is written means the admin sees the
 * error and retries, instead of creating a dud they have no way to notice.
 *
 * The cost of that order is a leaked plan when Razorpay succeeds and Mongo then
 * fails. That is the right way round to lose: an unreferenced plan charges
 * nobody and costs nothing, while a row pointing at a plan that does not exist
 * would fail at the worst possible moment — a student pressing Pay.
 *
 * ## Which is also why there is no update
 *
 * **A Razorpay plan cannot be edited or deleted.** Until now that was our own
 * append-only convention, inherited on paper; from here it is enforced by their
 * API. Revising terms is "create the new one, archive the old one", and
 * students already on the old plan keep it, because their subscription charges
 * against that immutable object and nothing we do here can reach it.
 */
export async function createFeePlan(
  _previous: FeePlanFormState,
  formData: FormData,
): Promise<FeePlanFormState> {
  const actor = await requireRole("admin");

  const values: FeePlanInput = {
    label: text(formData, "label"),
    description: text(formData, "description"),
    totalAmount: text(formData, "totalAmount"),
    upfrontAmount: text(formData, "upfrontAmount"),
    cycleAmount: text(formData, "cycleAmount"),
    totalCycles: text(formData, "totalCycles"),
    period: text(formData, "period"),
    interval: text(formData, "interval"),
  };

  if (!can(actor, "fee.manage")) {
    return { ok: false, error: DENIED, errors: {}, values };
  }

  const programSlug = text(formData, "programSlug");
  assertScope(actor, { program: programSlug });

  const errors = validateFeePlan(values);
  if (Object.keys(errors).length > 0) return { ok: false, errors, values };

  await connectToDatabase();

  const program = await Program.findOne({ slug: programSlug })
    .select("_id title feeAmount")
    .lean();
  if (!program) notFound();

  // An instalment plan without a base price is a schedule for paying an unknown
  // number. Set the fee first — and the screen orders the two forms that way.
  if (!program.feeAmount) {
    return {
      ok: false,
      error: "Set the program's fee first — instalments are a way of paying it.",
      errors: {},
      values,
    };
  }

  const activeCount = await FeePlan.countDocuments({
    programId: program._id,
    status: "active",
  });

  if (activeCount >= MAX_FEE_PLANS_PER_PROGRAM) {
    return {
      ok: false,
      error: `A program can offer ${MAX_FEE_PLANS_PER_PROGRAM} instalment plans at once, plus paying in full. Archive one before adding another.`,
      errors: {},
      values,
    };
  }

  const totalAmount = parseRupees(values.totalAmount);
  const cycleAmount = parseRupees(values.cycleAmount);
  const upfrontAmount =
    values.upfrontAmount.trim() === "" ? 0 : parseRupees(values.upfrontAmount);

  // None can be null — validateFeePlan already refused that — but the compiler
  // does not know it, and a `!` here would be a lie waiting to become true.
  if (totalAmount === null || cycleAmount === null || upfrontAmount === null) {
    return { ok: false, errors: { totalAmount: "Check the amounts." }, values };
  }

  const last = await FeePlan.findOne({ programId: program._id })
    .select("order")
    .sort({ order: -1 })
    .lean();

  const period = isFeePlanPeriod(values.period) ? values.period : "monthly";
  const interval = Number(values.interval);
  const totalCycles = Number(values.totalCycles);

  // Payments switched off in production: the terms could be saved, but the plan
  // behind them could not, and a row with no plan is the dud described above.
  if (mode() === "off") {
    return {
      ok: false,
      error:
        "Razorpay isn't configured, so an instalment plan can't be created. Add the API keys first.",
      errors: {},
      values,
    };
  }

  let razorpayPlanId: string;
  try {
    // The name is what appears on the student's card statement and in the
    // Razorpay dashboard, so it says which program as well as which schedule.
    const plan = await createPlan({
      period,
      interval,
      name: `${program.title} — ${values.label.trim()}`,
      amountPaise: cycleAmount,
      notes: { programSlug, label: values.label.trim() },
    });

    razorpayPlanId = plan.id;
  } catch (error) {
    console.error("[createFeePlan] Razorpay refused the plan:", error);

    return {
      ok: false,
      error:
        error instanceof Error && error.message.includes("Razorpay refused")
          ? // Their description names the field they disliked, which is more
            // use to an admin than anything we could write.
            error.message
          : "Couldn't create the plan with Razorpay. Nothing has been saved — please try again.",
      errors: {},
      values,
    };
  }

  const created = await FeePlan.create({
    programId: program._id,
    label: values.label.trim(),
    description: values.description.trim(),
    totalAmount,
    upfrontAmount,
    cycleAmount,
    totalCycles,
    period,
    interval,
    order: (last?.order ?? -1) + 1,
    razorpayPlanId,
    unlockSchedule: [],
    createdBy: actor.id,
  });

  await writeAudit(actor, {
    action: "feePlan.create",
    targetType: "FeePlan",
    targetId: String(created._id),
    summary: `Added "${values.label.trim()}" (${values.totalCycles} × ${formatPaise(cycleAmount)}) to ${program.title}`,
    // The Razorpay plan id is the interesting part of this entry: the object it
    // names is immutable and undeletable, so this line is the permanent record
    // of which terms were minted when.
    meta: { programSlug, totalAmount, cycleAmount, upfrontAmount, razorpayPlanId },
  });

  revalidatePath(`/admin/programs/${programSlug}/fees`);

  return { ok: true, errors: {}, values };
}

/**
 * Retire an instalment schedule.
 *
 * Archived, never deleted — the rule this codebase applies to users, sessions,
 * batches and enrolments, and here it is compulsory rather than tidy: every
 * `Payment` row points at the plan that was in force, and deleting it would
 * leave a receipt referring to terms nobody can look up.
 *
 * Students already on it stay on it and keep their terms. Archiving takes the
 * plan off the menu; it does not reprice anybody. And it can never remove the
 * ability to pay in full, because that was never a row.
 */
export async function archiveFeePlan(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("admin");
  if (!can(actor, "fee.manage")) return { ok: false, error: DENIED };

  const programSlug = text(formData, "programSlug");
  assertScope(actor, { program: programSlug });

  const planId = text(formData, "planId");
  if (!Types.ObjectId.isValid(planId)) notFound();

  await connectToDatabase();

  const plan = await FeePlan.findOneAndUpdate(
    { _id: planId, status: "active" },
    { $set: { status: "archived" } },
    { returnDocument: "after" },
  )
    .select("label totalAmount")
    .lean();
  if (!plan) notFound();

  await writeAudit(actor, {
    action: "feePlan.archive",
    targetType: "FeePlan",
    targetId: planId,
    summary: `Archived "${plan.label}" (${formatPaise(plan.totalAmount)})`,
    meta: { programSlug },
  });

  revalidatePath(`/admin/programs/${programSlug}/fees`);

  return { ok: true };
}

/**
 * Suggest a plan to one student. **Advisory, never binding.**
 *
 * The student still chooses on their own fee page; this badges one option as
 * recommended. That is why there is no "already paid" guard as there would be on
 * an assignment: changing a suggestion cannot change what anybody owes, so
 * refusing it would be ceremony.
 *
 * An empty `planId` recommends paying in full, which is also what a student with
 * no recommendation sees highlighted — it is the default either way.
 */
export async function recommendFeePlan(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("admin");
  if (!can(actor, "fee.manage")) return { ok: false, error: DENIED };

  const programSlug = text(formData, "programSlug");
  assertScope(actor, { program: programSlug });

  const studentId = text(formData, "studentId");
  const planId = text(formData, "planId");

  if (!Types.ObjectId.isValid(studentId)) notFound();

  await connectToDatabase();

  const program = await Program.findOne({ slug: programSlug })
    .select("_id title")
    .lean();
  if (!program) notFound();

  const enrollment = await Enrollment.findOne({
    studentId,
    programId: program._id,
    status: { $ne: "withdrawn" },
  })
    .select("_id")
    .lean();
  if (!enrollment) return { ok: false, error: "That student isn't on this program." };

  let plan: { _id: Types.ObjectId; label: string } | null = null;

  if (planId) {
    if (!Types.ObjectId.isValid(planId)) notFound();

    // Scoped to the program, so a forged post cannot recommend another
    // program's terms.
    const found = await FeePlan.findOne({
      _id: planId,
      programId: program._id,
      status: "active",
    })
      .select("_id label")
      .lean();

    if (!found) return { ok: false, error: "That plan isn't on this program." };

    plan = { _id: found._id, label: found.label };
  }

  await Enrollment.updateOne(
    { _id: enrollment._id },
    { $set: { recommendedFeePlanId: plan?._id ?? null } },
  );

  const student = await User.findById(studentId).select("name").lean();

  await writeAudit(actor, {
    action: "fee.recommend",
    targetType: "Enrollment",
    targetId: String(enrollment._id),
    summary: `Recommended ${plan ? `"${plan.label}"` : "paying in full"} to ${student?.name ?? "a student"} on ${program.title}`,
    meta: { programSlug, planId: planId || null },
  });

  revalidatePath(`/admin/programs/${programSlug}/fees`);
  revalidatePath(`/dashboard/${programSlug}/fees`);

  return { ok: true };
}

/**
 * Give one student a price of their own — the scholarship, the staff child, the
 * fee negotiated over the phone.
 *
 * **Admin only**, like every other price. A program manager can see who owes
 * what and chase them; quietly changing what somebody owes is a different
 * authority.
 *
 * Blank clears it and puts the student back on the program's price. Zero is a
 * free seat, which is a real decision and distinct from having no custom price
 * at all — hence the null-versus-zero care throughout.
 *
 * Refused below what they have already paid, rather than creating a phantom
 * credit the fee page would then have to explain. Lowering it to exactly what
 * they have paid is allowed and is how you write off a balance.
 */
export async function setCustomFee(
  _previous: CustomFeeFormState,
  formData: FormData,
): Promise<CustomFeeFormState> {
  const actor = await requireRole("admin");
  const values: CustomFeeInput = {
    customFeeAmount: text(formData, "customFeeAmount"),
  };

  if (!can(actor, "fee.manage")) {
    return { ok: false, error: DENIED, errors: {}, values };
  }

  const programSlug = text(formData, "programSlug");
  assertScope(actor, { program: programSlug });

  const errors = validateCustomFee(values);
  if (Object.keys(errors).length > 0) return { ok: false, errors, values };

  const studentId = text(formData, "studentId");
  if (!Types.ObjectId.isValid(studentId)) notFound();

  await connectToDatabase();

  const program = await Program.findOne({ slug: programSlug })
    .select("_id title")
    .lean();
  if (!program) notFound();

  const enrollment = await Enrollment.findOne({
    studentId,
    programId: program._id,
    status: { $ne: "withdrawn" },
  })
    .select("_id customFeeAmount")
    .lean();
  if (!enrollment) {
    return {
      ok: false,
      error: "That student isn't on this program.",
      errors: {},
      values,
    };
  }

  const customFeeAmount =
    values.customFeeAmount.trim() === ""
      ? null
      : parseRupees(values.customFeeAmount);

  if (customFeeAmount !== null) {
    const paid = await Payment.aggregate<{ total: number }>([
      { $match: { enrollmentId: enrollment._id, status: "captured" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const amountPaid = paid[0]?.total ?? 0;

    if (customFeeAmount < amountPaid) {
      return {
        ok: false,
        error: `They have already paid ${formatPaise(amountPaid)}. A price below that would leave them in credit — refund the difference first, or set it to ${formatPaise(amountPaid)} to write off the balance.`,
        errors: {},
        values,
      };
    }
  }

  await Enrollment.updateOne(
    { _id: enrollment._id },
    {
      $set: {
        customFeeAmount,
        // A custom price withholds instalment plans (their schedules add up to
        // their own totals, not to this one), so a plan already chosen is
        // cleared rather than left pointing at terms that no longer apply.
        ...(customFeeAmount !== null ? { feePlanId: null } : {}),
      },
    },
  );

  const student = await User.findById(studentId).select("name").lean();
  const previous = enrollment.customFeeAmount ?? null;

  await writeAudit(actor, {
    action: "fee.custom",
    targetType: "Enrollment",
    targetId: String(enrollment._id),
    summary:
      customFeeAmount === null
        ? `Removed ${student?.name ?? "a student"}'s custom price on ${program.title}`
        : `Set ${student?.name ?? "a student"}'s price on ${program.title} to ${formatPaise(customFeeAmount)}${
            previous === null ? "" : ` (was ${formatPaise(previous)})`
          }`,
    meta: { programSlug, customFeeAmount, previous },
  });

  revalidatePath(`/admin/programs/${programSlug}/fees`);
  revalidatePath(`/dashboard/${programSlug}/fees`);
  revalidatePath("/dashboard");

  return { ok: true, errors: {}, values };
}
