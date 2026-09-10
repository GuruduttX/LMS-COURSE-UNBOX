/**
 * Assessment — a module test, a course final test, or a term paper.
 *
 * One collection, not three. They differ in fields rather than in structure:
 *
 * | | Module test | Final test | Term paper |
 * |---|---|---|---|
 * | `scope`             | `module_test` | `final_test` | `term_test` |
 * | `countsTowardMerit` | **false** — assessment only | true | true |
 * | `proctored`         | false         | true         | true |
 * | attempts allowed    | many          | 3, best counts | **1** |
 * | marks per question  | 5             | 5            | 20 |
 *
 * Everything else — question shape, timing, the attempt pipeline, instant
 * grading — is shared, and splitting them would mean maintaining that pipeline
 * three times.
 *
 * ## A term paper hangs off a checkpoint course
 *
 * The mid-term and end-term are not a fourth level of the tree: a checkpoint is
 * already a `Course` with `number: null`, sitting between the numbered courses
 * and gated by finishing everything before it. So a term paper is that course's
 * paper — `courseId` points at the checkpoint — and `term` says which of the two
 * it is. A program has at most one of each, which the partial unique index on
 * `(programId, term)` enforces rather than hopes for.
 *
 * Why `term` here and not on the `Course`: the course is the container and the
 * paper is the graded thing. The marksheet groups by what was graded.
 *
 * ## The merit rule lives in data
 *
 * A module test tells a student how much of the module they absorbed. Its mark
 * appears on the marksheet, and it counts toward **nothing**: not the current
 * score, not the aggregate, not a graduation criterion. That is
 * `countsTowardMerit: false`, read by `getMarksheet`, rather than a condition
 * on `scope` scattered through the marks code.
 *
 * ## `version` and why attempts don't trust this document
 *
 * A teacher may edit a published test. An `Attempt` therefore stores a snapshot
 * of the questions **as served** along with the `version` they came from, and
 * grading reads the snapshot. Editing a live paper bumps `version` and cannot
 * corrupt an attempt already in flight.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { NODE_STATUSES, TEST_MARK_PER_QUESTION } from "@/lib/curriculum/rules";
import { questionSchema } from "./question-schema";

export const ASSESSMENT_SCOPES = [
  "module_test",
  "final_test",
  "term_test",
] as const;

/** Which of the two term papers this is. Null for every other scope. */
export const ASSESSMENT_TERMS = ["mid", "end"] as const;

const assessmentSchema = new Schema(
  {
    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      required: true,
      index: true,
    },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    /** Set exactly when `scope === "module_test"`. */
    moduleId: { type: Schema.Types.ObjectId, ref: "Module", default: null },
    scope: { type: String, enum: ASSESSMENT_SCOPES, required: true },
    /** Set exactly when `scope === "term_test"`. */
    term: { type: String, enum: [...ASSESSMENT_TERMS, null], default: null },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    durationMinutes: { type: Number, required: true, min: 5, max: 180 },
    questions: { type: [questionSchema], default: [] },
    marksPerQuestion: { type: Number, default: TEST_MARK_PER_QUESTION },
    /** Bumped whenever the questions change. Attempts freeze the one they got. */
    version: { type: Number, default: 1 },
    /** True for final tests: tab-switch detection, warnings, auto-submit. */
    proctored: { type: Boolean, default: false },
    /** False for module tests — see the note above. */
    countsTowardMerit: { type: Boolean, default: false },
    status: { type: String, enum: NODE_STATUSES, default: "draft" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// "The final test for this course", and "this course's tests" for the builder.
assessmentSchema.index({ courseId: 1, scope: 1 });
// One mid-term and one end-term per program. Partial, so the rest are exempt.
assessmentSchema.index(
  { programId: 1, term: 1 },
  { unique: true, partialFilterExpression: { term: { $type: "string" } } },
);
// A module has at most one test. Sparse, because final tests have no moduleId.
assessmentSchema.index(
  { moduleId: 1 },
  { unique: true, partialFilterExpression: { moduleId: { $type: "objectId" } } },
);

export type AssessmentDocument = InferSchemaType<typeof assessmentSchema>;

export const Assessment: Model<AssessmentDocument> =
  (models.Assessment as Model<AssessmentDocument>) ??
  model<AssessmentDocument>("Assessment", assessmentSchema);
