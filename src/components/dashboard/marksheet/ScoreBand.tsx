import type { Criterion, Total } from "@/lib/data/marksheet-db";

import { GraduationCriteria } from "./GraduationCriteria";

/**
 * The two numbers at the top, and the difference between them matters:
 * **current** is scored against what has been attempted, **aggregate** against
 * everything in the program. Early on the first flatters and the second warns —
 * which is exactly the honest picture a student needs.
 */
export function ScoreBand({
  current,
  aggregate,
  criteria,
}: {
  current: Total;
  aggregate: Total;
  criteria: { items: Criterion[]; deadline: string | null };
}) {
  return (
    <section
      aria-label="Your score"
      className="grid gap-6 rounded-xl border border-brand-200 bg-brand-50 p-5 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-brand-200 md:p-6"
    >
      <Score
        label="Your current score"
        total={current}
        note="Counts only what you have attempted so far."
      />
      <Score
        label="Your aggregate score"
        total={aggregate}
        note="Counts everything in the program. It rises as you finish more."
        action={
          <GraduationCriteria
            criteria={criteria.items}
            deadline={criteria.deadline}
          />
        }
        className="sm:pl-6"
      />
    </section>
  );
}

function Score({
  label,
  total,
  note,
  action,
  className,
}: {
  label: string;
  total: Total;
  note: string;
  /** Optional control beside the label — the criteria dialog's trigger. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-sm font-bold text-ink-900">{label}</h2>
        {action}
      </div>

      <p className="mt-1 text-2xl font-extrabold tracking-tight text-ink-900">
        {total.percent}%{" "}
        <span className="text-base font-bold tabular-nums text-ink-600">
          ({total.scored}/{total.max})
        </span>
      </p>
      <p className="mt-1 text-xs text-ink-600">{note}</p>
    </div>
  );
}
