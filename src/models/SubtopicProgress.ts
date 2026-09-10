/**
 * SubtopicProgress — one student's relationship with one subtopic.
 *
 * ## Why this is stored when nothing else is
 *
 * "Everything countable is derived, never stored" is a rule about *summaries* —
 * a module percentage, a course status, a lock. Those all remain derived, and
 * they are derived from this. But whether a person has watched a lecture is a
 * fact about their history with no other source: it cannot be computed from the
 * syllabus, because the syllabus is the same for everyone. So it is written
 * down, once, at the smallest grain that carries meaning, and every number in
 * the app is calculated from these rows rather than kept alongside them.
 *
 * This is also what replaces the per-student `status` fields that used to sit
 * on the static curriculum tree — where they were, strictly, a lie: they
 * described one imagined student on a document every student shared.
 *
 * ## Completion is declared, not inferred
 *
 * There is no media service, so there is no watch-time signal worth trusting.
 * The student presses a button. That is more honest than a heuristic, and it is
 * one row. A quiz is the exception: submitting it *is* the completion.
 *
 * `programId`/`courseId`/`moduleId` are denormalised so a course roll-up is one
 * query rather than a join back up through the tree.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const subtopicProgressSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    subtopicId: {
      type: Schema.Types.ObjectId,
      ref: "Subtopic",
      required: true,
    },
    programId: { type: Schema.Types.ObjectId, ref: "Program", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    moduleId: { type: Schema.Types.ObjectId, ref: "Module", required: true },

    state: {
      type: String,
      enum: ["in-progress", "completed"],
      required: true,
    },
    /** Recorded when a real player lands; zero until then. */
    secondsWatched: { type: Number, default: 0 },
    lastSeenAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One row per student per subtopic; opening and completing upsert against this.
subtopicProgressSchema.index({ studentId: 1, subtopicId: 1 }, { unique: true });
// The whole-course roll-up behind every percentage on the curriculum screen.
subtopicProgressSchema.index({ studentId: 1, courseId: 1 });

export type SubtopicProgressDocument = InferSchemaType<
  typeof subtopicProgressSchema
>;

export const SubtopicProgress: Model<SubtopicProgressDocument> =
  (models.SubtopicProgress as Model<SubtopicProgressDocument>) ??
  model<SubtopicProgressDocument>("SubtopicProgress", subtopicProgressSchema);
