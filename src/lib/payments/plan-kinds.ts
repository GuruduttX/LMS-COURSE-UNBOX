/**
 * The vocabulary of fee plans, shared by the model, the validator and the forms.
 *
 * **Pure and dependency-free on purpose.** These lists were briefly declared in
 * `models/FeePlan.ts`, which meant `validation/fee-plan.ts` imported the model
 * to reach them, which dragged Mongoose into the browser bundle and broke the
 * build. Same shape as `curriculum/rules.ts` holding `NODE_STATUSES` for the
 * curriculum models, and `data/session-kinds.ts` for sessions: constants live in
 * lib, models import them, nothing imports a model to read a constant.
 */

/**
 * Razorpay's billing frequencies, verbatim — we do not invent our own, because
 * these are sent straight through as a plan's `period` and a value they do not
 * recognise is a rejected plan.
 */
export const FEE_PLAN_PERIODS = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;

export type FeePlanPeriod = (typeof FEE_PLAN_PERIODS)[number];

/** Archived, never deleted — see models/FeePlan.ts for why that is compulsory. */
export const FEE_PLAN_STATUSES = ["active", "archived"] as const;

export type FeePlanStatus = (typeof FEE_PLAN_STATUSES)[number];

export function isFeePlanPeriod(value: string): value is FeePlanPeriod {
  return (FEE_PLAN_PERIODS as readonly string[]).includes(value);
}

/**
 * How many **instalment** plans a program may offer at once.
 *
 * Paying in full is not one of these and never counts against the cap — it is
 * `Program.feeAmount`, always on the menu, with no row that could be archived
 * away. So a program offers at most four ways to pay: in full, plus three
 * schedules.
 *
 * Three, because the student picks between them on one screen and a fourth card
 * is where a choice turns into a comparison exercise. Enforced in
 * `createFeePlan`, and stated here so the admin screen can say how many are left
 * before anyone presses Add.
 *
 * The cap counts *active* plans. Archived ones are off the menu, and a program
 * whose terms have been revised twice would otherwise hit the cap having never
 * offered a student more than one schedule.
 */
export const MAX_FEE_PLANS_PER_PROGRAM = 3;

/**
 * The id the "pay in full" option carries on the student's chooser.
 *
 * A sentinel rather than a document id because there is no document — it is
 * `Program.feeAmount` wearing an option's clothes so the chooser can render one
 * uniform list. `chooseFeePlan` maps it back to `Enrollment.feePlanId = null`.
 */
export const FULL_PAYMENT_OPTION_ID = "full";
