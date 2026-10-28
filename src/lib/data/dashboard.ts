/**
 * Pure helpers for the dashboard.
 *
 * The enrolments that used to live here are real rows now, read in
 * `data/enrolled.ts`, and the catalogue join has moved to
 * `data/public-programs.ts` where a database read belongs. What stays is
 * everything that must remain importable from a client component:
 * `components/dashboard/EnrolledCourseCard.tsx` and `data/sessions.ts` both
 * reach this module, and one `server-only` import anywhere in that chain breaks
 * the browser bundle.
 *
 * **This module has no imports, and that is the point.** Its purity used to be a
 * comment; now it is structural, and adding one is the thing to think twice
 * about rather than the thing to do quickly.
 */

/**
 * The old static enrolments. **The dashboard no longer reads these.**
 *
 * They survive as seed data for the two things still waiting on their own
 * rewrite — `data/course-overview.ts`, whose metrics are still placeholders,
 * and the migration scripts, which use the slugs to decide which programs the
 * seeded students belong to. Real enrolments are rows; see `models/Enrollment.ts`
 * and `data/enrolled.ts`. Do not add a caller.
 */
export type Enrollment = {
  slug: string;
  status: "in-progress" | "completed" | "not-started";
  lessonsDone: number;
  nextLesson: { moduleNumber: number; title: string; minutes: number } | null;
  deadline: string;
  batch: string;
};

export const ENROLLMENTS: Enrollment[] = [
  {
    slug: "performance-marketing",
    status: "in-progress",
    lessonsDone: 27,
    nextLesson: {
      moduleNumber: 4,
      title: "Building your first Meta campaign",
      minutes: 18,
    },
    deadline: "2026-11-14",
    batch: "Aug 2026 · Evening batch",
  },
  {
    slug: "ai-marketing",
    status: "completed",
    lessonsDone: 48,
    nextLesson: null,
    deadline: "2026-07-30",
    batch: "May 2026 · Weekend batch",
  },
];

export function progressPercent(lessonsDone: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((lessonsDone / total) * 100);
}

export function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
