/**
 * The kinds of live session, and what they are called.
 *
 * Dependency-free and shared by everything: the Mongoose enum, the scheduling
 * form's dropdown, the student's section headings, and the attendance
 * breakdown. Adding a third kind is one entry here — nothing else enumerates
 * them.
 */
export const SESSION_KINDS = ["learning", "placement"] as const;

export type SessionKind = (typeof SESSION_KINDS)[number];

/** Plural, as used for a section heading or an attendance row. */
export const SESSION_KIND_LABEL: Record<SessionKind, string> = {
  learning: "Learning sessions",
  placement: "Placement sessions",
};

/** Singular, as used in a form or a badge. */
export const SESSION_KIND_SINGULAR: Record<SessionKind, string> = {
  learning: "Learning",
  placement: "Placement",
};

export function isSessionKind(value: unknown): value is SessionKind {
  return (
    typeof value === "string" &&
    (SESSION_KINDS as readonly string[]).includes(value)
  );
}
