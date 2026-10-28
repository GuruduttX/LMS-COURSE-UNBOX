/**
 * The month a course runs in, and how consecutive courses group under one label.
 *
 * Pure and dependency-free, in `lib/curriculum/` for the same reason `status.ts`
 * and `links.ts` are: the public curriculum page renders it and the staff
 * screens will want it, and a formatting rule that lives in one component is a
 * formatting rule the other copy of gets wrong.
 *
 * The whole of the policy is in `models/Course.ts`: the span is **stored, not
 * derived**, so everything here is presentation. Nothing in this file invents a
 * month for a course that has none — an unset span formats as "" and groups on
 * its own, and the page prints no badge rather than a guess.
 */
import { MAX_PROGRAM_MONTHS } from "./rules";

export type MonthSpan = {
  startMonth: number | null;
  endMonth: number | null;
};

export type MonthGroup<T> = {
  /** "Month 1", "Months 2–3", or "" when the span is unset. */
  label: string;
  span: MonthSpan;
  courses: T[];
};

/**
 * "Month 1", "Months 2–3", or "" when nobody has set the timeline.
 *
 * An `endMonth` equal to the start reads as a single month, not a range — a
 * course somebody marked as running months 2 to 2 runs in month 2, and
 * "Months 2–2" is the sort of thing that makes a page look generated.
 *
 * The dash is an en dash (–), which is what a range takes.
 */
export function monthLabel(span: MonthSpan): string {
  const start = normalise(span.startMonth);
  if (start === null) return "";

  const end = normalise(span.endMonth);
  if (end === null || end <= start) return `Month ${start}`;

  return `Months ${start}–${end}`;
}

/**
 * Consecutive courses sharing a span collapse into one block.
 *
 * **Consecutive, not sorted.** Two courses in Month 1 print one "Month 1" rail
 * beside both, but the courses stay in the order the curriculum gave them —
 * teaching order. Sorting by month would move a course whose month nobody set
 * to one end of the page and quietly rewrite the syllabus; grouping only
 * neighbours means the timeline is a label on the order, never a reordering of
 * it. A programme whose months genuinely run 1, 3, 2 gets three blocks, which
 * is the honest picture of what was entered.
 */
export function groupByMonth<T extends MonthSpan>(
  courses: readonly T[],
): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = [];

  for (const course of courses) {
    const label = monthLabel(course);
    const last = groups.at(-1);

    // An unset span never joins the block before it: two courses with no month
    // are not "the same month", they are two courses nobody has scheduled.
    if (last && label !== "" && last.label === label) {
      last.courses.push(course);
      continue;
    }

    groups.push({
      label,
      span: { startMonth: course.startMonth, endMonth: course.endMonth },
      courses: [course],
    });
  }

  return groups;
}

/**
 * How long the programme runs, in months — the furthest month any course reaches.
 *
 * Null when no course carries a span, which is what stops the public page
 * printing "0 months" at a programme whose timeline simply is not set yet.
 */
export function durationMonths(courses: readonly MonthSpan[]): number | null {
  let furthest: number | null = null;

  for (const course of courses) {
    const reach = normalise(course.endMonth) ?? normalise(course.startMonth);
    if (reach === null) continue;
    if (furthest === null || reach > furthest) furthest = reach;
  }

  return furthest;
}

/**
 * A stored month, or null if it is not one.
 *
 * The schema bounds these, but a document written before the field existed — or
 * by a script — can hold anything, and a public page is the wrong place to find
 * out. Out-of-range is treated as unset rather than clamped: clamping would
 * print a month nobody chose.
 */
function normalise(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 1 || value > MAX_PROGRAM_MONTHS) return null;
  return value;
}
