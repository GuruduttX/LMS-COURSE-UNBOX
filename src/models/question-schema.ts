/**
 * One question, shared by everything that asks one.
 *
 * Quizzes, module tests, course final tests and the term papers all grade
 * themselves: the author marks the right answer while writing the question, so
 * a student sees their result the instant they submit and no teacher is in the
 * loop. Assignments are the only work a human marks.
 *
 * ## Four kinds, one document
 *
 * `kind` decides which fields carry meaning — `options` + `correctOptionId` for
 * single and true/false, `options` + `correctOptionIds` for multi-select,
 * `pairs` for matching. Every field is present on every question rather than
 * split across four collections or a discriminated union, for the same reason
 * `SubtopicView` carries all four of its kinds' fields: one shape round-trips
 * through a form, a JSON payload and an attempt snapshot without a translation
 * layer at each step. `lib/curriculum/question-kinds.ts` is where a kind's
 * meaning actually lives — this file only stores it.
 *
 * This is a subdocument, not a collection. A question has no life outside the
 * thing that asks it, and `Attempt` stores a **copy** of the questions as they
 * were served — so editing a live test can never rewrite a paper someone is
 * already sitting.
 *
 * `_id: false` because the author-supplied `id` is the identity; letting
 * Mongoose mint a second one would give every question two names and make the
 * attempt snapshot ambiguous.
 */
import { Schema } from "mongoose";

import { QUESTION_KINDS } from "@/lib/curriculum/question-kinds";

const optionSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true, trim: true },
  },
  { _id: false },
);

/**
 * One row of a matching question. `id` names the left item, `rightId` its
 * match — two ids on purpose, so the runner can be handed the right-hand list
 * without the pairing being readable from it. See `question-kinds.ts`.
 */
const pairSchema = new Schema(
  {
    id: { type: String, required: true },
    rightId: { type: String, required: true },
    left: { type: String, required: true, trim: true, maxlength: 300 },
    right: { type: String, required: true, trim: true, maxlength: 300 },
  },
  { _id: false },
);

export const questionSchema = new Schema(
  {
    id: { type: String, required: true },
    prompt: { type: String, required: true, trim: true, maxlength: 1000 },
    kind: { type: String, enum: QUESTION_KINDS, default: "single" },
    /** single, multi, boolean. Empty for matching. */
    options: { type: [optionSchema], default: [] },
    /** single and boolean ("true" / "false"). Empty for the others. */
    correctOptionId: { type: String, default: "" },
    /** multi only. Two or more ids; marking is all-or-nothing. */
    correctOptionIds: { type: [String], default: [] },
    /** matching only. */
    pairs: { type: [pairSchema], default: [] },
    /**
     * Set only inside an `Attempt` snapshot: the shuffled order of a matching
     * question's right-hand list, frozen so the choices do not rearrange
     * themselves under a student between renders. Never set on an `Assessment`.
     */
    choiceOrder: { type: [String], default: [] },
    /** Shown after submitting, right or wrong — the explanation is the teaching. */
    explanation: { type: String, default: "", trim: true, maxlength: 1000 },
  },
  { _id: false },
);
