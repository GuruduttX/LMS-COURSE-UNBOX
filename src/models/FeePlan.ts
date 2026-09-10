/**
 * FeePlan — one instalment schedule for a program. **EMI only.**
 *
 * There is no "pay in full" plan and there should never be one. A one-time
 * payment is a Razorpay *Order*, created per payment out of `Program.feeAmount`;
 * only instalments need a Razorpay *Plan*. A row standing in for the full price
 * would be a fake plan mirroring nothing, and it would make "you can always pay
 * in full" a rule somebody has to remember not to break instead of a fact about
 * the shape of the data.
 *
 * So a program offers: **paying in full, always, plus up to
 * `MAX_FEE_PLANS_PER_PROGRAM` of these.** The student picks.
 *
 * ## Append-only, and archived rather than deleted
 *
 * The same rule as users, sessions, batches and enrolments — but here it is not
 * a preference, it is inherited from Razorpay. **A Razorpay plan cannot be
 * edited or deleted.** Once `razorpayPlanId` is set, this row describes an
 * object on their side that is frozen forever, so changing `cycleAmount` here
 * would make the two disagree about what a student is being charged.
 *
 * Changing terms is therefore: create a new plan, archive the old one. Students
 * already on the old one stay on it, which is also correct — a change does not
 * reach back to someone who already signed up. `lib/actions/fee-plans.ts`
 * enforces this; there is deliberately no update.
 *
 * And a plan a payment points at must stay readable. Delete it and a past
 * receipt refers to terms nobody can look up, which is the one thing a fee
 * dispute needs.
 *
 * ## Money is paise
 *
 * See `lib/payments/money.ts`. `3499900` is ₹34,999.
 *
 * ## What Razorpay actually holds, and what it doesn't
 *
 * A Razorpay plan is thinner than it looks. It holds only the period, the
 * interval and the per-cycle amount — it is "₹8,000 every month, forever". It
 * has no idea how many months, and no concept of a down payment. So:
 *
 * - `period`, `interval` and `cycleAmount` **duplicate** the Razorpay plan.
 *   Safe to copy precisely because that plan is immutable, and necessary
 *   because the fee page has to price the option before any student has a
 *   subscription.
 * - `totalCycles` and `upfrontAmount` exist **nowhere** on Razorpay's side
 *   until a student signs up: they become `total_count` and `addons[]` on the
 *   *subscription*. They live here so an admin configures them once instead of
 *   retyping them per student.
 * - `unlockSchedule` is ours alone. Razorpay has never heard of a module.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

// The vocabulary lives in lib, not here — the admin form and the validator need
// it too, and reaching it through this file would pull Mongoose into the
// browser bundle. Same arrangement as NODE_STATUSES in curriculum/rules.ts.
import { FEE_PLAN_PERIODS, FEE_PLAN_STATUSES } from "@/lib/payments/plan-kinds";

/**
 * "Once cycle N is paid, the student may reach modules up to this order."
 *
 * Written down by an admin rather than computed from `paidCycles / totalCycles`.
 * Proportional arithmetic produces fractional modules, silently re-gates
 * everyone the moment a teacher reorders the curriculum, and gives nobody a way
 * to say "cycle 1 opens the three short foundation modules, cycle 2 opens the
 * one long project". A table is deterministic and an admin can read it back.
 *
 * `afterCycle: 0` is what the upfront payment buys, before any instalment.
 */
const unlockStepSchema = new Schema(
  {
    afterCycle: { type: Number, required: true, min: 0 },
    /** Inclusive. Matches `Module.order`, not `Module.number`. */
    throughModuleOrder: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const feePlanSchema = new Schema(
  {
    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      required: true,
      index: true,
    },
    /** What the student picks between. "6 months", "9-month plan". */
    label: { type: String, required: true, trim: true, maxlength: 80 },
    /**
     * What the program costs **on this plan**, in paise, and what the
     * instalments must add up to exactly — see `validateFeePlan`.
     *
     * Held per plan rather than read from `Program.feeAmount` because paying
     * over time usually costs more, and a plan that quietly charged the base
     * price would be a discount nobody decided to give.
     */
    totalAmount: { type: Number, required: true, min: 100 },
    status: {
      type: String,
      enum: FEE_PLAN_STATUSES,
      default: "active",
      index: true,
    },
    /** Shown to the student under the label. Optional. */
    description: { type: String, default: "", trim: true, maxlength: 300 },
    order: { type: Number, default: 0 },

    /**
     * Taken in the authorisation transaction, as a Razorpay `addon`. Also where
     * the rounding remainder goes: every cycle of a Razorpay plan is the same
     * amount, so an arbitrary total rarely divides evenly and the difference has
     * to land somewhere the merchant controls.
     */
    upfrontAmount: { type: Number, required: true, min: 0, default: 0 },
    /** Per-instalment amount. Duplicates the Razorpay plan's `item.amount`. */
    cycleAmount: { type: Number, required: true, min: 100 },
    /** Becomes `total_count` on the subscription, not a field on the plan. */
    totalCycles: { type: Number, required: true, min: 1, max: 60 },
    period: { type: String, enum: FEE_PLAN_PERIODS, required: true },
    interval: { type: Number, required: true, min: 1, default: 1 },
    /**
     * The Razorpay plan this mirrors.
     *
     * Null until the plan is first used, and null on every row today: nothing
     * creates Razorpay plans yet. A plan row is the *terms*, agreed with the
     * admin; the Razorpay object is created from it when subscriptions land.
     * Written from the API response rather than from the admin's form, so the
     * copy is a copy of what Razorpay actually created.
     */
    razorpayPlanId: { type: String, default: null, trim: true },
    unlockSchedule: { type: [unlockStepSchema], default: [] },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// The student's fee page: "the instalment plans I may pick, in order".
feePlanSchema.index({ programId: 1, status: 1, order: 1 });

export type FeePlanDocument = InferSchemaType<typeof feePlanSchema>;

export const FeePlan: Model<FeePlanDocument> =
  (models.FeePlan as Model<FeePlanDocument>) ??
  model<FeePlanDocument>("FeePlan", feePlanSchema);
