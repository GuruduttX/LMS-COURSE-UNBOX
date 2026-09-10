/**
 * Course — one course inside a program, and the unit the gate works on.
 *
 * To reach the next course a student must hand in every assignment of this one
 * and score 50% on its final test. That gate is **derived at read time** from
 * submissions and attempts, never stored here — a stored `locked` flag would be
 * one more thing that can disagree with reality.
 *
 * `number` is null for the standalone graded checkpoints (mid-term, end-term)
 * that sit between courses, which is also what tells the UI not to print
 * "Course N".
 *
 * `key` — `pm-c4` — is the stable identity. It is what the staff URLs speak
 * (`/admin/programs/[program]/courses/[course]`, and the teacher's equivalent),
 * so a link survives a retitle. It never changes after creation.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { NODE_STATUSES } from "@/lib/curriculum/rules";

const courseSchema = new Schema(
  {
    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      required: true,
      index: true,
    },
    key: { type: String, required: true, unique: true, trim: true },
    /** Null = a standalone checkpoint rather than a numbered course. */
    number: { type: Number, default: null },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    summary: { type: String, default: "", trim: true, maxlength: 600 },
    completeBy: { type: Date, default: null },
    /** Contiguous 0..n-1 within the program; rewritten wholesale on reorder. */
    order: { type: Number, required: true },
    status: { type: String, enum: NODE_STATUSES, default: "draft" },
    /**
     * Informational only — who is teaching this. Authorisation still comes from
     * `User.assignments[].courseIds` via `ownsCourse`, so there is exactly one
     * answer to "may this teacher edit this course".
     */
    teacherIds: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// Every read is "this program's courses, in teaching order".
courseSchema.index({ programId: 1, order: 1 });

export type CourseDocument = InferSchemaType<typeof courseSchema>;

export const Course: Model<CourseDocument> =
  (models.Course as Model<CourseDocument>) ??
  model<CourseDocument>("Course", courseSchema);
