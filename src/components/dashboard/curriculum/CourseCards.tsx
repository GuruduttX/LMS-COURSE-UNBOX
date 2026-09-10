import { ChevronDown, Lock, PlayCircle } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { entryHref, finalTestHref } from "@/lib/curriculum/links";
import { courseCounts, coursePercent } from "@/lib/curriculum/status";
import type { CourseView, ProgramCurriculum } from "@/lib/curriculum/types";

import {
  CertificateCard,
  FinalTestCard,
  TermPaperCard,
} from "./AssessmentCards";
import { ItemRow } from "./ItemRow";

/**
 * The whole curriculum on a phone: every course as a card, one under the next,
 * each opening to show what is inside it.
 *
 * ## Why this replaced the drill-down
 *
 * Mobile used to be two screens and a dropdown — a list of courses, then one
 * course, with a `<details>` picker at the top to move sideways between them.
 * Three problems. Comparing your progress across courses meant visiting them one
 * at a time and remembering. The picker hid the very thing it was picking
 * between, so choosing a course meant reading a collapsed line of text about it.
 * And "which course am I in" became a piece of URL state (`?c=`) that the page
 * had to explain to itself.
 *
 * One list of cards answers all of it. Everything is on one screen, each card
 * carries its own progress, and opening a course is a toggle rather than a
 * navigation — so closing it puts you back exactly where you were, with no
 * history entry and no scroll jump.
 *
 * ## Open and locked look different, not just labelled differently
 *
 * A locked course keeps a solid card but goes muted and dashed, its action
 * reads "Locked" rather than "Go to course", and where an open course describes
 * itself it instead says what to finish to open it. Its toggle is inert: there
 * is nothing to reveal, because the contents of a course you cannot enter are
 * not information, they are a tease.
 *
 * `<details>` rather than React state, matching the rest of this area — the
 * whole list stays a server component and it opens and closes without
 * JavaScript. `?c=` still has a job on the way in: a link that names a course
 * (`entryHref` sends locked courses here) opens that card.
 */
export function CourseCards({
  curriculum,
  openId,
}: {
  curriculum: ProgramCurriculum;
  /** Course named by `?c=`, if any — its card starts open. */
  openId?: string;
}) {
  return (
    <section aria-label="Courses in this program">
      <ol className="space-y-3">
        {curriculum.courses.map((course) => (
          <li key={course.id}>
            <CourseCard
              curriculum={curriculum}
              course={course}
              defaultOpen={course.id === openId}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

function CourseCard({
  curriculum,
  course,
  defaultOpen,
}: {
  curriculum: ProgramCurriculum;
  course: CourseView;
  defaultOpen: boolean;
}) {
  const programSlug = curriculum.program.slug;
  const percent = coursePercent(course);
  const { done, total } = courseCounts(course);
  const locked = course.locked;
  const isCheckpoint = course.number === null;
  const complete = percent === 100;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border shadow-sm",
        locked
          ? "border-dashed border-border-strong bg-surface-muted"
          : "border-border bg-surface",
      )}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
            {isCheckpoint ? "Assessment" : `Course ${course.number}`}
          </p>

          {/* One chip, and only when there is something to say: locked, or
              finished. A course in progress has the bar below, which says it
              better than a word would. */}
          {locked ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-ink-500">
              <Lock size={11} aria-hidden />
              Locked
            </span>
          ) : complete ? (
            <span className="shrink-0 rounded-full bg-success-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-success-700">
              Complete
            </span>
          ) : null}
        </div>

        <h2
          className={cn(
            "mt-0.5 text-base font-bold leading-snug",
            locked ? "text-ink-500" : "text-ink-900",
          )}
        >
          {course.title}
        </h2>

        {/* The one line under the title: what this course is, or — when it is
            shut — the single thing that opens it. A locked course's summary is
            not what the student needs there. `lockedReason` names the actual
            condition ("Pass the Course 2 final test…"); the fallback covers a
            lock with no reason recorded. */}
        <p
          className={cn(
            "mt-1 text-sm",
            locked ? "font-medium text-ink-600" : "text-ink-600",
          )}
        >
          {locked
            ? (course.lockedReason ??
              "Complete the previous course to unlock.")
            : course.summary}
        </p>

        {/* Same bar the desktop rail has, at full width: on a phone the card is
            the row, so the bar is its main signal rather than one element
            competing in a dense list. A checkpoint is a single paper and would
            get a bar of nothing. */}
        {isCheckpoint ? (
          <p className="mt-3 text-xs font-medium text-ink-500">
            {total} {total === 1 ? "test" : "tests"}
          </p>
        ) : (
          <>
            <div className="mt-3 flex items-center gap-2.5">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-[320ms] ease-out",
                    locked
                      ? "bg-ink-300"
                      : percent === 100
                        ? "bg-success-500"
                        : "bg-brand-600",
                  )}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span
                className={cn(
                  "shrink-0 text-sm font-bold tabular-nums",
                  locked
                    ? "text-ink-400"
                    : percent === 100
                      ? "text-success-700"
                      : "text-brand-700",
                )}
              >
                {percent}%
              </span>
            </div>

            <p className="mt-2 text-xs font-medium text-ink-500">
              {done} of {total} items done
            </p>
          </>
        )}

        <div className="mt-4">
          <CourseAction
            curriculum={curriculum}
            course={course}
            isCheckpoint={isCheckpoint}
            complete={complete}
          />
        </div>
      </div>

      <CourseContents
        programSlug={programSlug}
        course={course}
        isCheckpoint={isCheckpoint}
        complete={complete}
        defaultOpen={defaultOpen}
      />
    </article>
  );
}

/**
 * The card's action. Locked says so and does nothing — a button that navigates
 * to an explanation of why it cannot navigate is worse than one that is plainly
 * off, and the reason is already printed above it.
 *
 * A checkpoint has no lessons to enter, so its action is its paper. `entryHref`
 * would have nowhere to send it and would loop back to this page.
 */
function CourseAction({
  curriculum,
  course,
  isCheckpoint,
  complete,
}: {
  curriculum: ProgramCurriculum;
  course: CourseView;
  isCheckpoint: boolean;
  complete: boolean;
}) {
  if (course.locked) {
    return (
      <Button disabled className="w-full">
        <Lock size={16} aria-hidden />
        Locked
      </Button>
    );
  }

  if (isCheckpoint) {
    if (!course.termTest) return null;
    return (
      <ButtonLink
        href={finalTestHref(curriculum.program.slug, course.id)}
        className="w-full"
        variant={course.termTest.best ? "secondary" : "primary"}
      >
        {course.termTest.best ? "Review the paper" : "Sit the paper"}
      </ButtonLink>
    );
  }

  return (
    <ButtonLink
      href={entryHref(curriculum, course.id)}
      className="w-full"
      variant={complete ? "secondary" : "primary"}
    >
      <PlayCircle size={16} aria-hidden />
      {complete ? "Review course" : "Go to course"}
    </ButtonLink>
  );
}

/**
 * The toggle and what it reveals: the course's modules and assignments, then
 * its test, then its certificate once it is finished.
 *
 * Locked renders the same row without the `<details>` around it — dimmed, not
 * focusable, and honest that there is nothing behind it.
 */
function CourseContents({
  programSlug,
  course,
  isCheckpoint,
  complete,
  defaultOpen,
}: {
  programSlug: string;
  course: CourseView;
  isCheckpoint: boolean;
  complete: boolean;
  defaultOpen: boolean;
}) {
  // What the toggle opens, named rather than counted as "items": the rows
  // behind it are modules and assignments, so the label says so. Assignments
  // are only mentioned when the course has any.
  const modules = course.modules.length;
  const assignments = course.assignments.length;
  const label = isCheckpoint
    ? "Assessment details"
    : [
        `${modules} ${modules === 1 ? "module" : "modules"}`,
        assignments > 0
          ? `${assignments} ${assignments === 1 ? "assignment" : "assignments"}`
          : null,
      ]
        .filter(Boolean)
        .join(", ");

  if (course.locked) {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm font-semibold text-ink-400">
        {label}
        <ChevronDown size={18} aria-hidden className="shrink-0 text-ink-300" />
      </div>
    );
  }

  return (
    <details open={defaultOpen} className="group border-t border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-brand-600">
        {label}
        <ChevronDown
          size={18}
          aria-hidden
          className="shrink-0 transition-transform duration-[120ms] group-open:rotate-180"
        />
      </summary>

      {/* Sunken, so the contents read as being *inside* the card rather than as
          more cards stacked after it. */}
      <div className="space-y-3 border-t border-border bg-surface-muted p-3">
        {course.items.length > 0 ? (
          // ItemRow renders the <li> itself, exactly as it does in the desktop
          // panel — same rows, same links, same statuses.
          <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {course.items.map((item) => (
              <ItemRow
                key={item.id}
                programSlug={programSlug}
                courseId={course.id}
                item={item}
              />
            ))}
          </ol>
        ) : null}

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
    </details>
  );
}
