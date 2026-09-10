import Link from "next/link";

import {
  AUDIT_CATEGORIES,
  CATEGORY_LABEL,
  actionsByCategory,
} from "@/lib/auth/audit";
import { ROLES, ROLE_LABEL } from "@/lib/auth/roles";
import type { AuditFilters as Filters } from "@/lib/data/audit";

/**
 * The audit log's filter bar. URL state via a plain `method="get"` form — the
 * same idiom as the people and sessions screens, so the page stays a server
 * component, a filtered view is linkable, and Back works.
 *
 * `page` is deliberately not carried through: changing a filter should land you
 * on page 1 of the new result, not page 7 of a result that no longer has one.
 */
export function AuditFilters({
  filters,
  emails,
}: {
  filters: Filters;
  emails: string[];
}) {
  return (
    <div className="space-y-3">
      <form
        method="get"
        action="/admin/audit"
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1">
          <span className="sr-only">Search by person or description</span>
          <input
            type="search"
            name="q"
            list="audit-actor-emails"
            defaultValue={filters.q}
            placeholder="Name, email or description"
            className="h-10 w-64 rounded-lg border border-border bg-surface px-3 text-sm text-ink-800 placeholder:text-ink-400"
          />
        </label>
        <datalist id="audit-actor-emails">
          {emails.map((email) => (
            <option key={email} value={email} />
          ))}
        </datalist>

        <label className="flex flex-col gap-1">
          <span className="sr-only">Role</span>
          <select
            name="role"
            defaultValue={filters.role ?? ""}
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-ink-800"
          >
            <option value="">All roles</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
            {/* The two actors without an account — see AuditActor. */}
            <option value="anonymous">Signed-out attempts</option>
            <option value="system">System</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="sr-only">Category</span>
          <select
            name="category"
            defaultValue={filters.category ?? ""}
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-ink-800"
          >
            <option value="">All activity</option>
            {AUDIT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABEL[category]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="sr-only">Action</span>
          <select
            name="action"
            defaultValue={filters.action ?? ""}
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-ink-800"
          >
            <option value="">Any action</option>
            {actionsByCategory().map((group) => (
              <optgroup key={group.category} label={group.label}>
                {group.actions.map((action) => (
                  <option key={action.value} value={action.value}>
                    {action.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-500">From</span>
          <input
            type="date"
            name="from"
            defaultValue={filters.from ?? ""}
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-ink-800"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-500">To</span>
          <input
            type="date"
            name="to"
            defaultValue={filters.to ?? ""}
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-ink-800"
          />
        </label>

        <button
          type="submit"
          className="h-10 rounded-lg bg-brand-solid px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-solid-hover"
        >
          Apply
        </button>

        <Link
          href="/admin/audit"
          className="px-2 text-sm font-semibold text-ink-500 hover:text-ink-800"
        >
          Clear
        </Link>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-ink-500">Quick range</span>
        {QUICK_RANGES.map((range) => (
          <Link
            key={range.label}
            href={quickHref(filters, range.days)}
            className="rounded-full border border-border bg-surface px-3 py-1 font-semibold text-ink-600 hover:bg-ink-50"
          >
            {range.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

const QUICK_RANGES = [
  { label: "Today", days: 0 },
  { label: "Last 7 days", days: 6 },
  { label: "Last 30 days", days: 29 },
];

/** Keeps the other filters, replaces the dates, and drops back to page 1. */
function quickHref(filters: Filters, days: number): string {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - days);

  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.role) params.set("role", filters.role);
  if (filters.category) params.set("category", filters.category);
  if (filters.action) params.set("action", filters.action);
  params.set("from", iso(from));
  params.set("to", iso(today));

  return `/admin/audit?${params.toString()}`;
}

function iso(date: Date): string {
  // Local calendar date, not UTC: "today" at 1am IST is still today.
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
