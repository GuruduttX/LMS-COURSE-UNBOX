import { ArrowRight, PlayCircle } from "lucide-react";

import { ButtonLink } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { Assessment, CurrentPosition } from "@/lib/data/course-overview";

/**
 * The primary action on the page: pick up where you stopped. When the course is
 * finished there is no "next", so the card reports the final marks instead.
 */
export function ContinueCard({
  current,
  assessment,
  resumeHref,
  detailsHref,
}: {
  current: CurrentPosition | null;
  assessment: Assessment;
  /** Deep link to the exact lesson they stopped on — the desktop destination. */
  resumeHref: string;
  /** The program's course list — the mobile destination. See CourseAction. */
  detailsHref: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      {current ? (
        <>
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
              Course {current.moduleNumber}
            </p>
            <h2 className="mt-1 text-lg font-bold text-ink-900">
              {current.moduleTitle}
            </h2>
            <p className="mt-1 text-sm text-ink-600">
              Up next: {current.lessonTitle}
            </p>
          </div>

          <ProgressBar
            className="mt-5"
            value={current.modulePercent}
            label={`course ${current.moduleNumber} progress`}
          />

          {/* Last in the card and full width: everything above it — the lesson
              named, the bar showing how far in you are — is the case for
              pressing it, so it reads as the conclusion rather than something
              tucked beside the title. */}
          <div className="mt-4">
            <CourseAction resumeHref={resumeHref} detailsHref={detailsHref}>
              <PlayCircle size={16} aria-hidden />
              Go to course
            </CourseAction>
          </div>
        </>
      ) : (
        <div>
          <h2 className="text-lg font-bold text-ink-900">
            You&apos;ve finished every module
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Revisit any lesson or rewatch a recording at any time.
          </p>

          <div className="mt-4">
            <CourseAction
              resumeHref={resumeHref}
              detailsHref={detailsHref}
              variant="secondary"
            >
              Review course
              <ArrowRight size={16} aria-hidden />
            </CourseAction>
          </div>
        </div>
      )}

      <ScoreRow assessment={assessment} />
    </section>
  );
}

/**
 * One button, two destinations, decided by width.
 *
 * On a desktop the deep link is right: the rail, the outline and the lesson are
 * all on screen at once, so landing mid-course costs nothing — everything else
 * is still one glance away.
 *
 * On a phone it is not. Each screen is the *whole* screen, so a deep link drops
 * the student straight into a single lesson with no sense of which course it
 * belongs to or what else is in the program, and getting back out means the
 * drawer. So the phone takes the step the desktop can skip: the course list
 * first, then a course, then the lesson.
 *
 * Two links behind breakpoint classes rather than `useMediaQuery`, matching the
 * rest of this area: the card stays a server component, and both hrefs are real
 * URLs in the HTML — shareable, prefetchable, correct before hydration.
 *
 * **The breakpoint goes on a wrapper, never on the button.** `cn` is a plain
 * joiner with no Tailwind conflict resolution, so a `hidden` passed in as
 * `className` does not replace the `inline-flex` that `ButtonLink` sets on
 * itself — both survive into the class list and the cascade decides, which it
 * settled in `inline-flex`'s favour. Both buttons rendered on a phone. A span
 * the component knows nothing about cannot be overruled that way.
 */
function CourseAction({
  resumeHref,
  detailsHref,
  variant,
  children,
}: {
  resumeHref: string;
  detailsHref: string;
  variant?: "primary" | "secondary";
  children: React.ReactNode;
}) {
  return (
    <>
      {/* `block` on the wrapper as well as `w-full` on the link: a span is
          inline by default, and a full-width child of an inline box has no
          width to fill. */}
      <span className="block lg:hidden">
        <ButtonLink href={detailsHref} variant={variant} className="w-full">
          {children}
        </ButtonLink>
      </span>
      <span className="hidden lg:block">
        <ButtonLink href={resumeHref} variant={variant} className="w-full">
          {children}
        </ButtonLink>
      </span>
    </>
  );
}

function ScoreRow({ assessment }: { assessment: Assessment }) {
  return (
    <dl className="mt-5 grid grid-cols-2 divide-x divide-border rounded-lg border border-border">
      <ScoreCell label="Final test" value={assessment.finalTest} />
      <ScoreCell label="Assignments" value={assessment.assignments} />
    </dl>
  );
}

function ScoreCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="px-4 py-3 text-center">
      <dt className="text-xs font-medium text-ink-500">{label}</dt>
      <dd
        className={
          value === null
            ? "mt-0.5 text-sm font-medium text-ink-400"
            : "mt-0.5 text-lg font-extrabold tabular-nums text-brand-600"
        }
      >
        {value === null ? "Not attempted" : `${value}%`}
      </dd>
    </div>
  );
}