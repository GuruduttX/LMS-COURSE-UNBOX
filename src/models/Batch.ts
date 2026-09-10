/**
 * Batch — a named cohort inside one program, with a seat count.
 *
 * ## Why this exists now, when `Enrollment.batch` was deliberately free text
 *
 * That comment was right for what the field then was: a label on a group, which
 * nothing queried. Two things changed it. Staff now pick a cohort rather than
 * retype it — free text meant "Aug 2026 · Evening" and "Aug 2026 - evening"
 * were different cohorts and nobody could tell — and a batch now has a
 * **capacity**, which is a fact about the group, not about any one enrolment.
 * There is nowhere to put a seat count on a string.
 *
 * ## The name is still the join, not an id
 *
 * `Enrollment.batch` keeps holding the *name*, so every existing row and every
 * screen that renders it still works untouched. This collection is the source
 * of truth for what may be picked and how many fit; the enrolment carries the
 * label. Renaming a batch cascades to its enrolments in the same action — see
 * `renameEnrollments` in app/manager/batches/actions.ts — which is what keeps
 * the two from drifting.
 *
 * ## Closed, not deleted
 *
 * Same rule as users, sessions and enrolments. A batch nobody should join
 * again is `closed`: it disappears from the picker and stays on every
 * enrolment that names it. Deleting it would leave rows labelled with a cohort
 * that no longer exists.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

export const BATCH_STATUSES = ["open", "closed"] as const;

export type BatchStatus = (typeof BATCH_STATUSES)[number];

const batchSchema = new Schema(
  {
    /**
     * Program slug, not id — the same key `LiveSession.programSlug` and
     * `User.assignments[].programSlug` already speak, so a scope check is a
     * string comparison rather than a lookup.
     */
    programSlug: { type: String, required: true, trim: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    /** Seats. A batch always has one; "unlimited" is not a cohort. */
    capacity: { type: Number, required: true, min: 1, max: 1000 },
    /** When teaching starts. Display only — nothing schedules off it. */
    startsOn: { type: Date, default: null },
    /**
     * When teaching ends. Also display only, and **not** what closes a batch:
     * `status` is a decision somebody makes, a date is not. A cohort past its
     * end date that is still `open` is a cohort staff have not wrapped up yet,
     * which is worth being able to see rather than hiding automatically.
     */
    endsOn: { type: Date, default: null },
    status: { type: String, enum: BATCH_STATUSES, default: "open", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// The name is the join key, so two batches in one program cannot share one.
// Across programs they may: every program has an "Evening" batch.
batchSchema.index({ programSlug: 1, name: 1 }, { unique: true });

export type BatchDocument = InferSchemaType<typeof batchSchema>;

export const Batch: Model<BatchDocument> =
  (models.Batch as Model<BatchDocument>) ??
  model<BatchDocument>("Batch", batchSchema);
