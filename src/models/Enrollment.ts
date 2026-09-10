/**
 * Enrollment — one student in one program.
 *
 * The row that finally makes "the students of this program" a question the
 * database can answer. Until this existed, `rosterFor()` returned every active
 * student whatever program it was asked about, `ENROLLMENTS` in
 * `data/dashboard.ts` was a hard-coded array, and every scoped screen was
 * scoped to nothing.
 *
 * ## Its own collection, unlike staff assignments
 *
 * A staff member's `assignments` are embedded on the `User`: there are a
 * handful, they are always read with the user, and only an admin writes them.
 * Enrolments are the opposite on all three counts — a program has hundreds, the
 * common read is "everyone in this program" rather than "this person's
 * programs", and they carry their own history. So they are rows, indexed both
 * ways.
 *
 * ## Withdrawn, never deleted
 *
 * Same rule as users and sessions. A deleted enrolment orphans the student's
 * progress, attempts and submissions — rows that still point at a program
 * nobody can see they were ever in — and it erases the fact that they were
 * here, which is the one thing a fee dispute turns on. `status` carries the
 * outcome; the row stays.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

export const ENROLLMENT_STATUSES = ["active", "completed", "withdrawn"] as const;

export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

const enrollmentSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      required: true,
      index: true,
    },
    status: { type: String, enum: ENROLLMENT_STATUSES, default: "active" },
    /**
     * Which cohort they sit with — "Aug 2026 · Evening batch". Free text
     * rather than a `Batch` collection: it is a label on a group today, and
     * inventing a model for something nothing queries would be a table that
     * only ever gets joined for its name.
     */
    batch: { type: String, trim: true, default: "", maxlength: 80 },
    /**
     * The **instalment plan** this student chose, or null.
     *
     * **Null is not "unset" — it is "paying in full",** which is the default
     * and needs no row: the amount is `Program.feeAmount`, and a one-time
     * payment is an Order rather than a subscription. A student who never opens
     * the chooser simply owes the full fee, which is exactly right and is why
     * there is no "you must choose before you can pay" state to get stuck in.
     *
     * Whether fees apply at all is a fact about the *program*
     * (`Program.feeAmount === null` means it is free to reach), never about this
     * field. That is what keeps every enrolment made before fees existed
     * working untouched.
     *
     * Configuration, not state: a choice somebody made, not a running total.
     * What they have paid, whether they are paid up and which instalment they
     * are on are all counted from the `Payment` ledger by `lib/data/fees.ts`,
     * for the same reason progress is derived from the curriculum tree and
     * never stored here.
     */
    feePlanId: { type: Schema.Types.ObjectId, ref: "FeePlan", default: null },
    /**
     * A price for **this student only**, in paise, overriding
     * `Program.feeAmount`. Null means they pay the program's price.
     *
     * The scholarship, the staff child, the second course at a discount, the
     * one negotiated over the phone. Admin-only (`fee.manage`), and audited
     * with both the old and the new figure, because a fee quietly lowered for
     * one person is exactly the entry a dispute or an audit goes looking for.
     *
     * **It replaces the full-payment price, and while it is set the student is
     * not offered instalment plans.** A plan's schedule adds up to that plan's
     * own total; against a custom price the arithmetic no longer closes, and
     * silently charging somebody a schedule that does not match the figure they
     * were promised is worse than not offering it. `getFeeStatus` enforces this.
     *
     * Never below what they have already paid — `setCustomFee` refuses that
     * rather than creating a phantom credit.
     */
    customFeeAmount: { type: Number, default: null, min: 0 },
    /**
     * The plan staff suggest for this student. **Advisory, never binding.**
     *
     * The student still picks — this only badges one option as recommended on
     * their fee page. Kept apart from `feePlanId` precisely so the two cannot be
     * confused: one is what somebody was advised, the other is what they chose,
     * and collapsing them would turn a suggestion into an assignment the first
     * time anybody read the wrong field.
     */
    recommendedFeePlanId: {
      type: Schema.Types.ObjectId,
      ref: "FeePlan",
      default: null,
    },
    /**
     * The Razorpay subscription collecting this enrolment's instalments, or
     * null while they are paying in full or have not authorised one yet.
     *
     * **Configuration, not state** — the same rule as `feePlanId` above. It is
     * the *address* of the standing instruction, nothing more. How many cycles
     * have been paid, whether they are up to date and what they still owe are
     * all counted from the `Payment` ledger by `lib/data/fees.ts`, because a
     * `paidCount` cached here is exactly the counter `models/Payment.ts` exists
     * to argue against: a replayed webhook would double it and hand out a
     * module nobody paid for.
     *
     * One per enrolment. Razorpay allows many subscriptions against a plan, but
     * a student paying one program's fee twice over is a support call, not a
     * feature, so `/api/payments/subscription` reuses whatever is here if it is
     * still live and only mints a new one when it is not.
     */
    razorpaySubscriptionId: { type: String, default: null, trim: true },
    enrolledAt: { type: Date, required: true, default: () => new Date() },
    completedAt: { type: Date, default: null },
    /** The staff member who enrolled them. Null for migrated rows. */
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// One enrolment per student per program. A re-enrolment reactivates this row
// rather than adding a second, so a student cannot appear twice in a roster.
enrollmentSchema.index({ studentId: 1, programId: 1 }, { unique: true });
// The roster: "everyone in this program", which is the read that happens most.
enrollmentSchema.index({ programId: 1, status: 1 });

export type EnrollmentDocument = InferSchemaType<typeof enrollmentSchema>;

export const Enrollment: Model<EnrollmentDocument> =
  (models.Enrollment as Model<EnrollmentDocument>) ??
  model<EnrollmentDocument>("Enrollment", enrollmentSchema);
