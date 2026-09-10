import { ChevronDown } from "lucide-react";

import type { CourseModuleMarks } from "@/lib/data/marksheet-db";

import { MarkValue } from "./MarkValue";

/**
 * Module-level detail, one collapsible section per course. Collapsed by default
 * except the first: the summary tables above already answer "how am I doing",
 * and this is for the student who wants to know *where* the marks went.
 *
 * Native `<details>`, like the rest of the app's disclosures — works without
 * JavaScript, and keeps the page a server component.
 */
export function ModuleBreakdown({ courses }: { courses: CourseModuleMarks[] }) {
  return (
    <section aria-labelledby="module-marks">
      <h2
        id="module-marks"
        className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500"
      >
        Module
      </h2>

      <div className="mt-3 space-y-4">
        {courses.map((course, index) => (
          <details
            key={course.id}
            open={index === 0}
            className="group overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 bg-surface-sunken px-4 py-3 md:px-5">
              <span className="min-w-0 flex-1">
                <span className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
                  Course {course.number}
                </span>
                <span className="ml-2 text-sm font-bold text-ink-900">
                  {course.title}
                </span>
              </span>

              <span className="hidden shrink-0 gap-6 text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500 sm:flex">
                <span className="w-24 text-right">Assignment</span>
                <span className="w-24 text-right">Module test</span>
              </span>

              <ChevronDown
                size={18}
                aria-hidden
                className="shrink-0 text-brand-600 transition-transform duration-[120ms] group-open:rotate-180"
              />
            </summary>

            <ul className="divide-y divide-border border-t border-border">
              {course.rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 md:px-5"
                >
                  <p className="min-w-0 flex-1 text-sm text-ink-800">{row.title}</p>

                  {/* Labels only on mobile, where the header row is hidden. */}
                  <div className="flex shrink-0 gap-6 sm:gap-6">
                    <Cell label="Assignment" value={row.assignment} />
                    <Cell label="Module test" value={row.test} />
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}

function Cell({
  label,
  value,
}: {
  label: string;
  value: Parameters<typeof MarkValue>[0]["value"];
}) {
  return (
    <div className="w-24 text-left sm:text-right">
      <p className="text-2xs font-medium text-ink-500 sm:hidden">{label}</p>
      <MarkValue value={value} />
    </div>
  );
}
