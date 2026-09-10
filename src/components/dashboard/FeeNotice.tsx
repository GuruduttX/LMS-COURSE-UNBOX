import { ArrowRight, Wallet } from "lucide-react";

import { ButtonLink } from "@/components/ui/Button";
import type { EnrolledProgram } from "@/lib/data/enrolled";

/**
 * "You have fees to pay" — the top of the dashboard, when there are any.
 *
 * ## It replaces the referral banner rather than stacking above it
 *
 * Two banners compete and neither gets read, and of the two this is the one
 * that stands between the student and the thing they logged in for. The
 * referral art comes back the moment nothing is owed.
 *
 * ## It names the program
 *
 * A student on two programs who has paid for one must not be told "you have
 * pending fees" — they will reasonably assume it is the one they already paid
 * and ignore it. With more than one outstanding it names the first and counts
 * the rest, which is still specific enough to act on.
 *
 * ## Amber, not red
 *
 * design.md §7: red is for something broken. An unpaid fee on the day of
 * enrolment is the normal state of a new student, not a failure — and gold is
 * reserved for things earned, so it cannot be that either.
 */
export function FeeNotice({ unpaid }: { unpaid: EnrolledProgram[] }) {
  if (unpaid.length === 0) return null;

  const first = unpaid[0];
  const others = unpaid.length - 1;

  return (
    <section
      aria-labelledby="fee-notice-heading"
      className="mt-4 rounded-xl border border-warning-500/40 bg-warning-50 p-4 md:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-500/15 text-warning-700"
          >
            <Wallet size={18} />
          </span>

          <div className="min-w-0">
            <h2
              id="fee-notice-heading"
              className="text-sm font-bold text-ink-900 md:text-base"
            >
              Pay your fees to start {first.title}
            </h2>
            <p className="mt-0.5 text-sm text-ink-700">
              {first.fee.amountDueLabel} is due. Your lessons open as soon as
              it&rsquo;s paid.
              {others > 0
                ? ` ${others === 1 ? "One other program is" : `${others} other programs are`} waiting too.`
                : ""}
            </p>
          </div>
        </div>

        <ButtonLink
          href={`/dashboard/${first.slug}/fees`}
          className="shrink-0 max-sm:w-full"
        >
          Pay {first.fee.amountDueLabel}
          <ArrowRight size={16} aria-hidden />
        </ButtonLink>
      </div>
    </section>
  );
}
