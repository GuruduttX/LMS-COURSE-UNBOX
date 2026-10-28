import { ChevronLeft, ChevronRight, Code2, MessagesSquare, Sparkles } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/cn";
import type { LearnScreen, LearnStep } from "@/lib/curriculum/types";

/**
 * Sticky bar under the content pane: the three side-tools on the left, the
 * walk-through controls on the right.
 *
 * What Prev/Next mean depends on what's in the pane, so the bar doesn't decide:
 * a video passes `<SubtopicSteps>` (move between subtopics), a quiz passes its
 * own buttons (move between questions). Same bar, same position, one meaning at
 * a time.
 */
export function LearnFooterBar({ children }: { children: React.ReactNode }) {
  return (
    // Sticky below lg, where the outline and the pane share one scrolling
    // column — the controls have to stay reachable without scrolling to the end.
    <div className="sticky bottom-0 z-10 flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border bg-surface px-4 py-3 md:px-6 lg:static">
      {/* Hidden on a phone. All three are placeholders with no handler, and on
          a 390px screen they wrapped onto two rows and pushed Prev/Next into a
          third — three controls that do nothing costing more of the footer than
          the two that do. They stay from `sm`, where they fit on one line. */}
      <div className="hidden flex-wrap items-center gap-x-5 gap-y-2 sm:flex">
        <Tool icon={<MessagesSquare size={16} aria-hidden />} label="Q & A forum" />
        <Tool icon={<Code2 size={16} aria-hidden />} label="Test your code" />
        <Tool icon={<Sparkles size={16} aria-hidden />} label="Practice questions" />
      </div>

      {/* `ml-auto` so Prev/Next stay right-aligned once the tools above are
          hidden and `justify-between` has only one child to work with.

          Wrapping, because Next can carry a sentence beside it at the end of a
          course ("Hand in … to finish this course") and on a phone that
          sentence is wider than what is left of the row. It takes a line of its
          own there and sits inline everywhere else. */}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-1 gap-y-1.5">
        {children}
      </div>
    </div>
  );
}

/**
 * Prev/Next across the whole course — the controls a video pane gets.
 *
 * Both steps arrive from the server already resolved to an href and a label
 * (`nextAfterLessons`), so this decides nothing: at the last lesson of a course
 * Next reads "Assignment" or "Final test" or "Next course" rather than going
 * grey, and when the thing it points at is closed it stays inert but prints
 * *why*. A dead control with no explanation was the whole bug — a student who
 * had watched every video was told only that they could not continue.
 */
export function SubtopicSteps({ screen }: { screen: LearnScreen }) {
  const { prev, next } = screen;

  return (
    <>
      {/* Before the buttons rather than after, so it reads as a caption on the
          pair and doesn't push Next off the right edge of a narrow footer. */}
      {next?.note ? (
        <p
          className={cn(
            "order-first w-full text-right text-2xs font-medium sm:order-0 sm:w-auto sm:max-w-88",
            next.href ? "text-ink-500" : "text-ink-600",
          )}
        >
          {next.note}
        </p>
      ) : null}

      <StepLink step={prev} fallbackLabel="Prev" direction="prev" />
      <StepLink step={next} fallbackLabel="Next" direction="next" />
    </>
  );
}

export const STEP_CLASS =
  "inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold";
export const STEP_ACTIVE = "text-brand-600 hover:bg-brand-50 hover:text-brand-700";
export const STEP_INERT = "text-ink-300";

export function StepIcon({ direction }: { direction: "prev" | "next" }) {
  return direction === "prev" ? (
    <ChevronLeft size={16} aria-hidden />
  ) : (
    <ChevronRight size={16} aria-hidden />
  );
}

/** Disabled ends are rendered as text, not dead links — nothing to focus. */
function StepLink({
  step,
  fallbackLabel,
  direction,
}: {
  step: LearnStep | null;
  /** What the control says when there is no step at all — the ends of the run. */
  fallbackLabel: string;
  direction: "prev" | "next";
}) {
  const label = step?.label ?? fallbackLabel;

  const inner = (
    <>
      {direction === "prev" ? <StepIcon direction="prev" /> : null}
      {label}
      {direction === "next" ? <StepIcon direction="next" /> : null}
    </>
  );

  // No step, or a step whose destination is closed. Both are inert, but only
  // the second has anything to say — and it says it in the note beside us,
  // which is why nothing is repeated here.
  if (!step?.href) {
    return <span className={cn(STEP_CLASS, STEP_INERT)}>{inner}</span>;
  }

  return (
    <Link
      href={step.href}
      scroll={false}
      title={step.title}
      className={cn(STEP_CLASS, STEP_ACTIVE)}
    >
      {inner}
    </Link>
  );
}

function Tool({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 text-sm font-semibold text-ink-700 hover:text-brand-700"
    >
      <span className="text-ink-500">{icon}</span>
      {label}
    </button>
  );
}
