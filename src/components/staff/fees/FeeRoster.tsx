"use client";

import { CheckCircle2, Search, Tag, Users, X } from "lucide-react";
import { useMemo, useState } from "react";

import { CustomFeeControl } from "@/components/staff/fees/CustomFeeControl";
import { RecommendPlanSelect } from "@/components/staff/fees/RecommendPlanSelect";
import { TextInput } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import type { FeeBatchGroup, FeePlanOption } from "@/lib/data/fees";
import { formatPaise } from "@/lib/payments/money";

/**
 * Who has paid, **by cohort**.
 *
 * Two questions this screen gets asked, and they need different shapes:
 * "how is the August batch doing?" wants a group with its own subtotals, and
 * "what does Priya owe?" wants a search box. So: a batch filter across the top,
 * subtotals on every group header, and a search that cuts across all of them.
 *
 * ## Filtering is client-side, deliberately
 *
 * A program's roster is hundreds of rows, not thousands, and it arrives with the
 * page already. Round-tripping a search term to the server would put a spinner
 * between an admin and a name they can already see, and would turn the batch
 * filter into a navigation. Both are instant this way.
 *
 * ## Search matches name and email
 *
 * Two students called Priya is not unusual; two with the same email is
 * impossible. The email is what disambiguates them, so it is searchable even
 * though the row leads with the name.
 *
 * ## Batch groups survive a search
 *
 * A search narrows the rows inside each group and drops groups that end up
 * empty, rather than flattening everything into one list. Which cohort somebody
 * is in is part of the answer to "what does this person owe" — it is who to ask
 * about them.
 */

const ALL = "__all__";
/** The bucket for students with no cohort. `""` is their real batch value. */
const NO_BATCH = "No batch";

export function FeeRoster({
  programSlug,
  groups,
  planOptions,
  programFeeLabel,
}: {
  programSlug: string;
  groups: FeeBatchGroup[];
  /** Instalment plans that may be recommended. Empty hides the dropdown. */
  planOptions: FeePlanOption[];
  programFeeLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [batch, setBatch] = useState<string>(ALL);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return groups
      .filter((group) => batch === ALL || group.batch === batch)
      .map((group) => {
        if (!needle) return group;

        const rows = group.rows.filter(
          (row) =>
            row.name.toLowerCase().includes(needle) ||
            row.email.toLowerCase().includes(needle),
        );

        // Subtotals are recomputed for what is on screen. A header saying
        // "₹2.4L outstanding" above three visible rows that owe ₹30,000 would
        // be a number nobody could reconcile with what they are looking at.
        return {
          ...group,
          rows,
          collected: rows.reduce((total, row) => total + row.amountPaid, 0),
          outstanding: rows.reduce(
            (total, row) => total + (row.isPaid ? 0 : row.amountDue),
            0,
          ),
          paidCount: rows.filter((row) => row.isPaid).length,
          unpaidCount: rows.filter((row) => !row.isPaid).length,
        };
      })
      .filter((group) => group.rows.length > 0);
  }, [groups, query, batch]);

  const matches = visible.reduce((total, group) => total + group.rows.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <TextInput
            aria-label="Search students"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or email"
            leadingIcon={<Search size={15} />}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            >
              <X size={14} aria-hidden />
            </button>
          ) : null}
        </div>

        {/* Only worth a filter when there is more than one cohort to filter to. */}
        {groups.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            <BatchChip
              label="All batches"
              active={batch === ALL}
              onClick={() => setBatch(ALL)}
            />
            {groups.map((group) => (
              <BatchChip
                key={group.batch || NO_BATCH}
                label={group.batch || NO_BATCH}
                count={group.rows.length}
                active={batch === group.batch}
                onClick={() => setBatch(group.batch)}
              />
            ))}
          </div>
        ) : null}
      </div>

      {query ? (
        <p className="text-xs text-ink-500" role="status">
          {matches === 0
            ? "No students match that."
            : `${matches} ${matches === 1 ? "student" : "students"} match “${query.trim()}”.`}
        </p>
      ) : null}

      {visible.length === 0 ? null : (
        <div className="space-y-5">
          {visible.map((group) => (
            <section key={group.batch || NO_BATCH}>
              <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-2">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
                  <Users size={14} className="text-ink-400" aria-hidden />
                  {group.batch || NO_BATCH}
                  <span className="font-normal text-ink-500">
                    · {group.rows.length}
                  </span>
                </h3>

                <p className="text-xs text-ink-600">
                  {group.outstanding > 0 ? (
                    <>
                      <span className="font-semibold text-warning-700">
                        {formatPaise(group.outstanding)} outstanding
                      </span>
                      {" · "}
                    </>
                  ) : null}
                  {formatPaise(group.collected)} collected
                  {group.unpaidCount > 0
                    ? ` · ${group.unpaidCount} unpaid`
                    : " · all paid"}
                </p>
              </header>

              <ul className="divide-y divide-border">
                {group.rows.map((row) => (
                  <li
                    key={row.studentId}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink-900">{row.name}</p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {row.email} · on {row.planLabel}
                      </p>
                      <div className="mt-1">
                        <CustomFeeControl
                          programSlug={programSlug}
                          studentId={row.studentId}
                          studentName={row.name}
                          customFeeAmount={row.customFeeAmount}
                          programFeeLabel={programFeeLabel}
                        />
                      </div>
                    </div>

                    {/* Withheld from a student on their own price: a plan's
                        schedule adds up to that plan's total, not to theirs, so
                        there is nothing here worth recommending. */}
                    {planOptions.length > 0 && row.customFeeAmount === null ? (
                      <div className="w-44 shrink-0">
                        <RecommendPlanSelect
                          programSlug={programSlug}
                          studentId={row.studentId}
                          options={planOptions}
                          recommendedPlanId={row.recommendedPlanId}
                        />
                      </div>
                    ) : null}

                    <div className="shrink-0 text-right">
                      {row.isPaid ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-2xs font-semibold text-success-700">
                          <CheckCircle2 size={12} aria-hidden />
                          {row.totalAmount === 0
                            ? "Free seat"
                            : `Paid ${formatPaise(row.amountPaid)}`}
                        </span>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-warning-700">
                            {formatPaise(row.amountDue)} due
                          </p>
                          {/* Only when they are part-way — "of ₹34,999" beside
                              an untouched fee just repeats the number. */}
                          {row.amountPaid > 0 ? (
                            <p className="text-2xs text-ink-500">
                              {formatPaise(row.amountPaid)} of{" "}
                              {formatPaise(row.totalAmount)} paid
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function BatchChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-border bg-surface text-ink-700 hover:border-border-strong hover:bg-ink-50",
      )}
    >
      {label}
      {count === undefined ? null : (
        <span className={active ? "text-white/70" : "text-ink-400"}>
          {count}
        </span>
      )}
    </button>
  );
}

/** Exported for the page's empty state, so the two describe the same thing. */
export function CustomPriceLegend() {
  return (
    <p className="flex items-start gap-1.5 text-xs text-ink-500">
      <Tag size={12} className="mt-0.5 shrink-0" aria-hidden />
      A custom price replaces the program&rsquo;s for that student, and takes
      them off instalment plans.
    </p>
  );
}
