import { BookOpen, Layers } from "lucide-react";

import { groupByMonth } from "@/lib/curriculum/months";
import type { PublicCourse } from "@/lib/data/public-programs";

/**
 * The curriculum as a month-by-month timeline.
 *
 * A rail of month badges down the left, the courses that run in each beside
 * them, and each course's modules folded into a `<details>` so the page is
 * skimmable but the depth is there for anyone who wants it.
 *
 * **The grouping is a label on the order, never a reordering of it.** Courses
 * arrive in teaching order and stay in it; `groupByMonth` only merges
 * neighbours that share a span. A course whose month nobody set keeps its place
 * with an empty rail cell rather than being swept to the end — the syllabus is
 * what it is, and the timeline is an annotation on it.
 */
export function CurriculumTimeline({ courses }: { courses: PublicCourse[] }) {
  const groups = groupByMonth(courses);

  return (
    <ol className="space-y-4">
      {groups.map((group, index) => (
        <li
          key={`${group.label}-${index}`}
          className="grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-0"
        >
          {/* The rail. An unset month gets an empty cell, not a dash: a
              programme with no timeline should read as a plain course list
              rather than as a page whose data failed to load. */}
          <div className="relative sm:pr-6">
            {group.label ? (
              <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-2xs font-bold uppercase tracking-[0.08em] text-brand-700 sm:sticky sm:top-24">
                {group.label}
              </span>
            ) : null}
          </div>

          <div className="space-y-3 sm:border-l sm:border-border sm:pl-6">
            {group.courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

function CourseCard({ course }: { course: PublicCourse }) {
  const hasModules = course.modules.length > 0;

  return (
    <article className="relative rounded-xl border border-border bg-surface p-5 shadow-sm">
      {/* The dot on the rail, tying the card to its month. */}
      <span
        aria-hidden
        className="absolute -left-[1.9rem] top-6 hidden h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-surface sm:block"
      />

      <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
        {course.number === null ? "Checkpoint" : `Course ${course.number}`}
      </p>

      <h3 className="mt-1 text-base font-bold leading-snug text-ink-900">
        {course.title}
      </h3>

      {course.summary ? (
        <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
          {course.summary}
        </p>
      ) : null}

      {hasModules ? (
        <details className="group mt-4">
          <summary className="flex cursor-pointer list-none items-center gap-4 border-t border-border pt-3 text-xs font-medium text-ink-500 transition-colors hover:text-ink-700">
            <span className="inline-flex items-center gap-1.5">
              <Layers size={14} aria-hidden />
              {course.modules.length}{" "}
              {course.modules.length === 1 ? "module" : "modules"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BookOpen size={14} aria-hidden />
              {course.lessonCount}{" "}
              {course.lessonCount === 1 ? "lesson" : "lessons"}
            </span>
            <span className="ml-auto font-semibold text-brand-600">
              <span className="group-open:hidden">Show modules</span>
              <span className="hidden group-open:inline">Hide modules</span>
            </span>
          </summary>

          {/* No <Reveal> in here: an animated element inside a collapsed
              container never enters the viewport observer, so it would open to
              a list that stays invisible. */}
          <ul className="mt-3 space-y-2 border-t border-border pt-3">
            {course.modules.map((module) => (
              <li
                key={module.id}
                className="flex items-baseline justify-between gap-4 text-sm"
              >
                <span className="text-ink-700">
                  <span className="font-medium text-ink-500">
                    Module {module.number}:
                  </span>{" "}
                  {module.title}
                </span>
                {module.lessonCount > 0 ? (
                  <span className="shrink-0 text-xs text-ink-500">
                    {module.lessonCount}{" "}
                    {module.lessonCount === 1 ? "lesson" : "lessons"}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        // A checkpoint has nothing inside it by design — it is the exam that
        // sits between courses — so this is a normal state, not a gap.
        <p className="mt-4 border-t border-border pt-3 text-xs text-ink-500">
          {course.number === null
            ? "A graded checkpoint between courses."
            : "Modules for this course are being finalised."}
        </p>
      )}
    </article>
  );
}
