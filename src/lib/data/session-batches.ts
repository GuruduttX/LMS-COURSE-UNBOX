import "server-only";

/**
 * "Which sessions belong to these cohorts", as one filter fragment.
 *
 * Three readers ask it — the staff list, the student's timetable, and the
 * upcoming-session counts on the staffing panels — and getting it subtly
 * different in one of them is how a cohort ends up seeing another cohort's
 * class.
 *
 * Two rules it encodes:
 *
 * - **A session with no batch belongs to everybody.** `batch: ""` is the
 *   program-wide session — the induction, the placement talk — so it is in
 *   every cohort's answer rather than nobody's.
 * - **A missing field reads as no batch.** Every `LiveSession` written before
 *   batches existed has no `batch` key at all, and Mongoose defaults apply on
 *   write, never retroactively. `null` in an `$in` matches a missing field,
 *   which is what keeps those rows visible instead of quietly disappearing from
 *   every timetable the day this shipped.
 */
export function sessionBatchFilter(
  batches: string[] | null,
): Record<string, unknown> {
  // Null is "every cohort" — an admin, a manager, a program-wide screen.
  if (batches === null) return {};

  return { batch: { $in: ["", null, ...batches] } };
}
