import { ChevronRight, Lock } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/cn";
import { courseDetailsHref } from "@/lib/curriculum/links";
import { courseCounts, coursePercent } from "@/lib/curriculum/status";
import type { CourseView } from "@/lib/curriculum/types";

/**
 * The courses in the program, as the desktop rail beside the selected course's
 * panel. **From `lg` only** — below it the page is one list of expandable cards
 * (`CourseCards`) and there is no selection to make.
 *
 * Selection is a URL (`?c=<courseId>`), not client state — the page stays a
 * server component, every course is linkable and shareable, and Back does the
 * obvious thing.
 *
 * This used to carry a second `variant="switcher"` shape: a `<details>`
 * dropdown for the mobile drill-down, so a student inside one course could jump
 * sideways to another. The drill-down is gone and so is the dropdown — every
 * course is now on screen at once on a phone, which is what the picker was
 * working around.
 */
export function CourseRail({
  programSlug,
  courses,
  activeId,
}: {
  programSlug: string;
  courses: CourseView[];
  activeId: string;
}) {
  return (
    <nav aria-label="Courses in this program">
      <ol className="space-y-4">
        {courses.map((course) => (
          <li key={course.id}>
            <CourseCard
              programSlug={programSlug}
              course={course}
              isActive={course.id === activeId}
            />
          </li>
        ))}
      </ol>
    </nav>
  );
}

function CourseCard({
  programSlug,
  course,
  isActive,
}: {
  programSlug: string;
  course: CourseView;
  isActive: boolean;
}) {
  const percent = coursePercent(course);
  const { done, total } = courseCounts(course);
  const locked = course.locked;

  return (
    <Link
      href={courseDetailsHref(programSlug, course.id)}
      scroll={false}
      aria-current={isActive ? "true" : undefined}
      className={cn(
        "block rounded-xl border bg-surface p-5 transition-colors duration-[120ms]",
        isActive
          ? "border-brand-200 bg-brand-50 shadow-sm"
          : "border-border hover:border-border-strong hover:bg-ink-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm/6 font-bold text-ink-900">
          {course.number !== null ? (
            <span className="text-ink-700">Course {course.number}: </span>
          ) : null}
          <span className="font-semibold">{course.title}</span>
        </p>
        {locked ? (
          <Lock size={16} aria-hidden className="mt-0.5 shrink-0 text-ink-400" />
        ) : (
          <ChevronRight
            size={16}
            aria-hidden
            className={cn("mt-0.5 shrink-0", isActive ? "text-brand-600" : "text-ink-400")}
          />
        )}
      </div>

      {/* Checkpoint courses are a single test — a bar there would be noise.
          The bar itself is half-width: it's a glance, not a measurement, and
          running it the full card made it the loudest thing in the rail. */}
      {course.number !== null ? (
        <div className="mt-4 flex items-center gap-2">
          <div className="h-1.5 w-1/2 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-[320ms] ease-out",
                percent === 100 ? "bg-success-500" : "bg-brand-600",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-xs font-bold tabular-nums text-brand-700">
            {percent}%
          </span>
        </div>
      ) : null}

      <p className="mt-2.5 text-2xs font-medium text-ink-500">
        {course.number !== null
          ? `${done} of ${total} items done`
          : `${total} ${total === 1 ? "test" : "tests"}`}
      </p>
    </Link>
  );
}
