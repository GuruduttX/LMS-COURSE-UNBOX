import { ChevronLeft, ChevronRight, Code2, MessagesSquare, Sparkles } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/cn";
import { learnHref } from "@/lib/curriculum/links";
import type { LearnScreen } from "@/lib/curriculum/types";

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
          hidden and `justify-between` has only one child to work with. */}
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </div>
  );
}

/** Prev/Next across the whole course — the controls a video pane gets. */
export function SubtopicSteps({ screen }: { screen: LearnScreen }) {
  const { program, course, prev, next } = screen;

  return (
    <>
      <StepLink
        href={prev ? learnHref(program.slug, course.id, prev.moduleId, prev.subtopicId) : null}
        label="Prev"
        title={prev?.title}
        direction="prev"
      />
      <StepLink
        href={next ? learnHref(program.slug, course.id, next.moduleId, next.subtopicId) : null}
        label="Next"
        title={next?.title}
        direction="next"
      />
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
  href,
  label,
  title,
  direction,
}: {
  href: string | null;
  label: string;
  title?: string;
  direction: "prev" | "next";
}) {
  const inner = (
    <>
      {direction === "prev" ? <StepIcon direction="prev" /> : null}
      {label}
      {direction === "next" ? <StepIcon direction="next" /> : null}
    </>
  );

  if (!href) {
    return <span className={cn(STEP_CLASS, STEP_INERT)}>{inner}</span>;
  }

  return (
    <Link
      href={href}
      scroll={false}
      title={title}
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
