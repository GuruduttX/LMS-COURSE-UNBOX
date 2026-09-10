/**
 * Attempt — one sitting of a quiz, a module test or a final test.
 *
 * This is the security boundary of the whole testing feature, so it is worth
 * being explicit about what it guarantees and what it cannot.
 *
 * ## The client is assumed hostile
 *
 * A proctored test runs in the student's browser, which they control. Every
 * detection the runner does — tab switch, focus loss, fullscreen exit — can be
 * suppressed by anyone who opens devtools. Client-side proctoring is deterrence.
 * **This document is the enforcement**, and it holds because of four things:
 *
 * 1. `deadlineAt` is set from the *server* clock at `startAttempt`. Moving the
 *    client's clock buys nothing.
 * 2. `violationCount` is incremented server-side. The client reports events; it
 *    never reports a total and can never decrement one.
 * 3. `answers` is written incrementally as each question is answered, so an
 *    auto-submit grades real stored answers even if the client never manages to
 *    send a final request.
 * 4. `snapshot` holds the questions **as served**, `correctOptionId` included,
 *    and grading reads only from here. The client never sends a score and the
 *    server never reads one from a request body. The payload sent to the runner
 *    has the correct answers stripped — see `toRunnerQuestions`.
 *
 * ## Why the questions are copied
 *
 * A teacher may edit a live test. Freezing the paper into the attempt means an
 * edit mid-flight cannot change what a student is being marked against, and a
 * result stays explicable months later even if the question has since been
 * rewritten. `version` records which edition they sat.
 *
 * ## Statuses
 *
 * `submitted` is the student choosing to finish. `auto-submitted` is the server
 * ending it — out of warnings, or out of time (`autoSubmitReason` says which).
 * `expired` is the lazy sweep: any read that finds an in-flight attempt past its
 * deadline finalises it, so no cron job is needed.
 *
 * All three are *finished*, and all three are marked: an attempt that ran out
 * of time is graded on the answers it had, because those answers were real work.
 * Only `in-progress` has a null score.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { VIOLATION_TYPES } from "@/lib/validation/attempt";
import { questionSchema } from "./question-schema";

export const ATTEMPT_TARGETS = [
  "subtopic_quiz",
  "module_test",
  "final_test",
  "term_test",
] as const;

/**
 * One saved answer, in the one shape every kind of question fits.
 *
 * `optionIds` carries a single choice, a true/false, or a multi-select; `pairs`
 * carries a matching answer. Both are lists rather than four kind-specific
 * fields, so writing an answer is the same operation whatever was asked and the
 * grader has one thing to read. An answer row exists as soon as a student
 * touches a question — an empty one means they cleared it, which is different
 * from never having reached it.
 */
const answerSchema = new Schema(
  {
    questionId: { type: String, required: true },
    optionIds: { type: [String], default: [] },
    pairs: {
      type: [
        new Schema(
          {
            leftId: { type: String, required: true },
            rightId: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    answeredAt: { type: Date, required: true },
  },
  { _id: false },
);

const violationSchema = new Schema(
  {
    type: { type: String, enum: VIOLATION_TYPES, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const attemptSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    programId: { type: Schema.Types.ObjectId, ref: "Program", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    moduleId: { type: Schema.Types.ObjectId, ref: "Module", default: null },

    targetType: { type: String, enum: ATTEMPT_TARGETS, required: true },
    /** A Subtopic._id for a quiz, an Assessment._id for a test. */
    targetId: { type: Schema.Types.ObjectId, required: true },
    /** The Assessment.version served. 1 for a subtopic quiz. */
    version: { type: Number, required: true, default: 1 },
    /**
     * Frozen with the paper, for the same reason the questions are: a teacher
     * changing 20 marks a question to 5 while somebody is sitting must not
     * change what that person's paper is out of.
     */
    marksPerQuestion: { type: Number, required: true, default: 1 },
    /** The paper as served. Grading reads this and nothing else. */
    snapshot: { type: [questionSchema], default: [] },
    answers: { type: [answerSchema], default: [] },

    status: {
      type: String,
      enum: ["in-progress", "submitted", "auto-submitted", "expired"],
      required: true,
    },
    startedAt: { type: Date, required: true },
    /** Server clock at start + durationMinutes. Not negotiable by the client. */
    deadlineAt: { type: Date, required: true },
    submittedAt: { type: Date, default: null },

    /** Null while in flight. Unattempted questions score zero on submission. */
    scored: { type: Number, default: null },
    maxScore: { type: Number, default: null },
    percent: { type: Number, default: null },
    passed: { type: Boolean, default: null },

    violations: { type: [violationSchema], default: [] },
    /** Server-authoritative. The 11th ends the attempt. */
    violationCount: { type: Number, default: 0 },
    autoSubmitReason: {
      type: String,
      enum: ["violations", "deadline", null],
      default: null,
    },
  },
  { timestamps: true },
);

// "This student's attempts at this test, newest first" — the retake check and
// the best-score read behind the course gate.
attemptSchema.index({ studentId: 1, targetId: 1, startedAt: -1 });
// The marksheet: every attempt this student made in this program.
attemptSchema.index({ studentId: 1, programId: 1, targetType: 1 });
// One live attempt per test, enforced rather than hoped for: a second
// `startAttempt` finds the existing one instead of opening a fresh paper.
attemptSchema.index(
  { studentId: 1, targetId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "in-progress" },
  },
);

export type AttemptDocument = InferSchemaType<typeof attemptSchema>;

export const Attempt: Model<AttemptDocument> =
  (models.Attempt as Model<AttemptDocument>) ??
  model<AttemptDocument>("Attempt", attemptSchema);
