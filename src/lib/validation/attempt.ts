/**
 * What a test attempt accepts from the client, and what it refuses.
 *
 * This module exists because a proctored test is the one place in the app where
 * the client is actively assumed hostile. Everything here is a narrowing of
 * untrusted input into the small set of things the server is willing to record:
 * an option id, or the name of a violation. Notably absent is a score — the
 * client never sends one, and the server never reads one from a request.
 */

/**
 * The violations the runner can report.
 *
 * The client detects these; the **server** counts them. A client can fail to
 * report (by suppressing the listeners) but it can never report a total, and it
 * can never decrement one.
 */
export const VIOLATION_TYPES = [
  /** Tab or application switch — document.hidden went true. */
  "hidden",
  /** The window lost focus: devtools, alt-tab, a second window. */
  "blur",
  /** The cursor left the viewport and stayed out. */
  "pointerleave",
  /** Fullscreen was exited after the test requested it. */
  "fullscreen-exit",
  "copy",
  "paste",
  "contextmenu",
] as const;

export type ViolationType = (typeof VIOLATION_TYPES)[number];

export function isViolationType(value: unknown): value is ViolationType {
  return (
    typeof value === "string" &&
    (VIOLATION_TYPES as readonly string[]).includes(value)
  );
}

/** How a violation reads in the banner and in the teacher's attempt log. */
export const VIOLATION_LABEL: Record<ViolationType, string> = {
  hidden: "You switched away from the test",
  blur: "The test window lost focus",
  pointerleave: "Your cursor left the test window",
  "fullscreen-exit": "You left fullscreen",
  copy: "Copying is not allowed during the test",
  paste: "Pasting is not allowed during the test",
  contextmenu: "The right-click menu is disabled during the test",
};

export type AnswerPayload = { questionId: string; optionId: string };

/**
 * Narrow one saved answer.
 *
 * `questionId` and `optionId` are checked against the attempt's frozen snapshot
 * by the caller — this only establishes that they are strings of a sane shape,
 * so the database is never asked to match on something absurd.
 */
export function validateAnswerPayload(value: unknown): AnswerPayload | null {
  if (typeof value !== "object" || value === null) return null;

  const { questionId, optionId } = value as Record<string, unknown>;
  if (typeof questionId !== "string" || typeof optionId !== "string") {
    return null;
  }
  if (!questionId.trim() || questionId.length > 120) return null;
  // An empty optionId is legitimate — it means the student cleared their answer.
  if (optionId.length > 120) return null;

  return { questionId, optionId };
}
