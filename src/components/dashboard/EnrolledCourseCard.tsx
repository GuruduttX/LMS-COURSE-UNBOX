import {
  ArrowRight,
  Award,
  CalendarDays,
  CheckCircle2,
  Lock,
  PlayCircle,
  Wallet,
} from "lucide-react";

import { ButtonLink } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { formatDeadline } from "@/lib/data/dashboard";
import type { EnrolledProgram } from "@/lib/data/enrolled";

/**
 * A program the student is enrolled in. The primary action is always "carry on
 * from where you stopped" — design.md §7, rules 2 and 14.
 *
 * Every number here is derived from the curriculum tree rather than stored on
 * the enrolment (see `data/enrolled.ts`), so this card and the course's own
 * screens cannot disagree about how far along somebody is.
 *
 * ## Unpaid is a different card, not a warning taped to this one
 *
 * When the fee is outstanding the badge, the body and the button all change
 * together. A working "Resume" button beside a notice saying "pay first" is two
 * contradictory affordances, and a student will press the one that costs them
 * nothing — then land on the gate, which redirects them back. The progress bar
 * goes too: "0 of 62 lessons" implies they have started and stalled, when in
 * fact nothing has opened yet.
 */
export function EnrolledCourseCard({ item }: { item: EnrolledProgram }) {
  const { lessonsDone, lessonsTotal, percent, nextLesson, status, deadline, batch } =
    item;
  const isComplete = status === "completed";
  const unpaid = !item.fee.paid;

  return (
    <article className="flex flex-col rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold leading-snug text-ink-900">
            {item.title}
          </h3>
          {batch ? (
            <p className="mt-1 text-xs text-ink-500">{batch}</p>
          ) : null}
        </div>
        <StatusBadge isComplete={isComplete} unpaid={unpaid} />
      </div>

      {unpaid ? (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg bg-warning-50 p-3">
          <Wallet
            size={18}
            className="mt-0.5 shrink-0 text-warning-700"
            aria-hidden
          />
          <div>
            <p className="text-sm font-semibold text-ink-900">
              {item.fee.amountDueLabel} due
            </p>
            <p className="mt-0.5 text-xs text-ink-600">
              {lessonsTotal} lessons open as soon as this is paid.
            </p>
          </div>
        </div>
      ) : (
        <ProgressBar
          className="mt-5"
          value={percent}
          tone={isComplete ? "success" : "brand"}
          label={`${lessonsDone} of ${lessonsTotal} lessons`}
        />
      )}

      {unpaid ? null : nextLesson ? (
        <div className="mt-5 rounded-lg bg-surface-muted p-3">
          <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
            Up next
          </p>
          <p className="mt-1 text-sm font-semibold text-ink-900">
            {nextLesson.title}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            Module {nextLesson.moduleNumber} · {nextLesson.minutes} min
          </p>
        </div>
      ) : (
        <div className="mt-5 flex items-center gap-2.5 rounded-lg bg-gold-50 p-3">
          <Award size={18} className="shrink-0 text-gold-600" aria-hidden />
          <p className="text-sm font-semibold text-ink-800">
            Certificate ready to download
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        {/* Dropped when the program has no date rather than printed as
            "Ends —", which reads as a broken deadline. */}
        {deadline ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500">
            <CalendarDays size={14} aria-hidden />
            {isComplete ? "Completed" : "Ends"} {formatDeadline(deadline)}
          </span>
        ) : (
          <span />
        )}

        {unpaid ? (
          <ButtonLink href={`/dashboard/${item.slug}/fees`}>
            <Wallet size={16} aria-hidden />
            Pay fees
          </ButtonLink>
        ) : (
          <ButtonLink
            href={`/dashboard/${item.slug}/overview`}
            variant={isComplete ? "secondary" : "primary"}
          >
            {isComplete ? (
              <>
                View course
                <ArrowRight size={16} />
              </>
            ) : (
              <>
                <PlayCircle size={16} />
                study
              </>
            )}
          </ButtonLink>
        )}
      </div>
    </article>
  );
}

function StatusBadge({
  isComplete,
  unpaid,
}: {
  isComplete: boolean;
  unpaid: boolean;
}) {
  // Checked before "completed": a paid-up finisher cannot be unpaid, so the
  // order only matters for the case where an admin has repriced someone
  // mid-program — and there the fee is the thing to say.
  if (unpaid) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-500/15 px-2.5 py-1 text-2xs font-semibold text-warning-700">
        <Lock size={12} aria-hidden />
        Payment pending
      </span>
    );
  }

  if (isComplete) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-2xs font-semibold text-success-700">
        <CheckCircle2 size={12} aria-hidden />
        Completed
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-2xs font-semibold text-brand-700">
      <PlayCircle size={12} aria-hidden />
      In progress
    </span>
  );
}
