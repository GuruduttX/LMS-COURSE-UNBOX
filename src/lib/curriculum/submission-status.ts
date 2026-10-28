/**
 * Where a hand-in stands, and the one rule about when a student may hand in.
 *
 * Pure and dependency-free, so the model, the actions, the grading queue and
 * the student's dialog all read the same list — a status the UI knows and the
 * model rejects (or the other way round) is how a hand-in ends up stuck.
 *
 * ## Handing in is final — unless the teacher says otherwise
 *
 *   submitted ──(teacher marks)──────────────▶ evaluated
 *       │                                         │
 *       └──(teacher requests resubmission)────────┤
 *                                                 ▼
 *                                   resubmission_requested
 *                                                 │
 *                          (student hands in again, version + 1)
 *                                                 ▼
 *                                             submitted
 *
 * Only `resubmission_requested` reopens the form, and only a teacher's action
 * writes it. `canHandIn` is what the screen asks; the action enforces the same
 * rule with a conditional write, so the screen is a courtesy and not the lock.
 */
export const SUBMISSION_STATUSES = [
  "submitted",
  "evaluated",
  "resubmission_requested",
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** May this student hand in now? Nothing yet, or the teacher asked for another. */
export function canHandIn(
  submission: { status: SubmissionStatus } | null | undefined,
): boolean {
  return !submission || submission.status === "resubmission_requested";
}

/**
 * The words for a hand-in's state, for badges and headings.
 *
 * "Resubmitted" is `submitted` on a second or later version — the same state
 * as far as the rules go, but the student and the teacher both want to know
 * this is the revised work rather than the first go.
 */
export function submissionStatusLabel(
  submission: { status: SubmissionStatus; version: number } | null | undefined,
): string {
  if (!submission) return "Not submitted";
  switch (submission.status) {
    case "evaluated":
      return "Graded";
    case "resubmission_requested":
      return "Resubmission requested";
    default:
      return submission.version > 1 ? "Resubmitted" : "Submitted";
  }
}

/** Refused hand-ins all read the same, and say what would open the form. */
export const HAND_IN_LOCKED =
  "Assignment has already been submitted. Resubmission is only available when requested by your teacher.";
