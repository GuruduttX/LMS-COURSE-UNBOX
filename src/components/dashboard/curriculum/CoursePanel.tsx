import { Clock3, PlayCircle } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { formatDate } from "@/lib/curriculum/format";
import { entryHref } from "@/lib/curriculum/links";
import { courseCounts, coursePercent } from "@/lib/curriculum/status";
import type { CourseView, ProgramCurriculum } from "@/lib/curriculum/types";

import {
  CertificateCard,
  FinalTestCard,
  TermPaperCard,
} from "./AssessmentCards";
import { ItemRow } from "./ItemRow";

/**
 * The right-hand detail for whichever course is selected: header + action, the
 * rows inside it (modules and assignments), then the final test as its own card
 * below — and the certificate once the whole course is done.
 *
 * It takes the **curriculum** rather than just the course because `entryHref`
 * needs the program around it to decide where "Go to course" lands. Every
 * caller has the tree loaded already, which is precisely why that function is
 * pure rather than a second database read.
 *
 * The course project card went when the static tree did. There is no `Project`
 * model, so the card had nothing to read; inventing a status for it would be
 * the fake-metric mistake this codebase avoids elsewhere. The marksheet still
 * carries its seeded project row until that rewrite.
 */
export function CoursePanel({
  curriculum,
  course,
}: {
  curriculum: ProgramCurriculum;
  course: CourseView;
}) {
  const programSlug = curriculum.program.slug;
  const { done, total, minutes } = courseCounts(course);
  const locked = course.locked;
  const complete = coursePercent(course) === 100;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <header className="border-b border-border bg-brand-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-ink-900">
                {course.number !== null ? `Course ${course.number}: ` : ""}
                {course.title}
              </h2>
              <p className="mt-1 max-w-[68ch] text-sm text-ink-600">
                {course.summary}
              </p>
            </div>

            {course.completeBy ? (
              <p className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600">
                <Clock3 size={16} aria-hidden className="text-ink-500" />
                Complete by {formatDate(course.completeBy)}
              </p>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {locked ? (
              <>
                <Button disabled>Locked</Button>
                {/* The reason, not just the state — "Locked" on its own is
                    nothing a student can act on. */}
                <p className="text-sm text-ink-600">
                  {course.lockedReason ?? "Not available yet."}
                </p>
              </>
            ) : (
              <ButtonLink href={entryHref(curriculum, course.id)}>
                <PlayCircle size={16} aria-hidden />
                Go to course
              </ButtonLink>
            )}

            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
              {done} / {total} done
              {minutes > 0 ? ` · ${minutes} min` : ""}
            </p>
          </div>
        </header>

        <ol className="divide-y divide-border">
          {course.items.map((item) => (
            <ItemRow
              key={item.id}
              programSlug={programSlug}
              courseId={course.id}
              item={item}
            />
          ))}
        </ol>
      </section>

      {course.finalTest ? (
        <FinalTestCard
          programSlug={programSlug}
          course={course}
          test={course.finalTest}
        />
      ) : null}

      {course.termTest ? (
        <TermPaperCard
          programSlug={programSlug}
          course={course}
          test={course.termTest}
        />
      ) : null}

      {complete ? <CertificateCard title={course.title} /> : null}
    </div>
  );
}
