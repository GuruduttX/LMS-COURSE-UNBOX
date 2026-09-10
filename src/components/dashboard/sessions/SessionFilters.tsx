import Link from "next/link";

import { Button } from "@/components/ui/Button";
import {
  SESSION_KINDS,
  SESSION_KIND_LABEL,
  type SessionKind,
} from "@/lib/data/session-kinds";

/**
 * Filters for the completed tab: session type and a date range.
 *
 * A native `method="get"` form, so the filters are the URL — the page stays a
 * server component, a filtered view is linkable, and Back works. That is also
 * why "Clear filters" is a link rather than a reset button: it goes to the
 * unfiltered URL instead of only emptying the inputs.
 */
export function SessionFilters({
  basePath,
  kind,
  from,
  to,
}: {
  basePath: string;
  kind: SessionKind | null;
  from: string;
  to: string;
}) {
  const hasFilters = Boolean(kind || from || to);

  return (
    <form
      method="get"
      action={basePath}
      className="flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="tab" value="completed" />

      <p className="w-full text-sm font-semibold text-ink-700 sm:w-auto sm:pb-2.5">
        Filter by:
      </p>

      <label className="flex flex-col gap-1">
        <span className="sr-only">Session type</span>
        <select
          name="kind"
          defaultValue={kind ?? ""}
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-ink-800"
        >
          <option value="">Session type</option>
          {SESSION_KINDS.map((value) => (
            <option key={value} value={value}>
              {SESSION_KIND_LABEL[value]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase tracking-wide text-ink-500">
          From
        </span>
        <input
          type="date"
          name="from"
          defaultValue={from}
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-ink-800"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase tracking-wide text-ink-500">
          To
        </span>
        <input
          type="date"
          name="to"
          defaultValue={to}
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-ink-800"
        />
      </label>

      <Button type="submit">Apply filter</Button>

      {hasFilters ? (
        <Link
          href={`${basePath}?tab=completed`}
          className="px-2 text-sm font-semibold text-ink-500 hover:text-ink-800"
        >
          Clear filters
        </Link>
      ) : (
        <span className="px-2 text-sm font-semibold text-ink-300">
          Clear filters
        </span>
      )}
    </form>
  );
}
