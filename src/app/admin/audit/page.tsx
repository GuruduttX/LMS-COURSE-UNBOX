import { ScrollText, SearchX, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AuditFilters } from "@/components/admin/AuditFilters";
import { PageHeading } from "@/components/staff/StatTile";
import { Button } from "@/components/ui/Button";
import { ConfirmForm } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireRole } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { isRole, ROLE_LABEL } from "@/lib/auth/roles";
import {
  PAGE_SIZE,
  auditActorSuggestions,
  hasAuditFilters,
  listAuditLogs,
  parseAuditFilters,
  type AuditFilters as Filters,
  type AuditRow,
} from "@/lib/data/audit";

import { purgeAuditLogs } from "./actions";

/**
 * Everything that has happened, newest first.
 *
 * Filters are URL state (`?q=&role=&category=&action=&from=&to=&page=`), the
 * same pattern as the people screen — so a filtered view is linkable and a
 * question like "what did this teacher do last Tuesday" is a URL somebody can
 * paste into a message.
 *
 * design.md §5: below `md` the table becomes a card list rather than a
 * horizontal scroll. Both render from the same rows.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage({
  searchParams,
}: PageProps<"/admin/audit">) {
  const user = await requireRole("admin");
  // Belt and braces: requireRole already admits only admins, but this screen
  // reads everyone's activity, so it names the capability it needs.
  if (!can(user, "audit.view")) notFound();

  const query = await searchParams;
  const filters = parseAuditFilters({
    role: first(query.role),
    category: first(query.category),
    action: first(query.action),
    q: first(query.q),
    from: first(query.from),
    to: first(query.to),
    page: first(query.page),
  });

  const [{ rows, total, page, pageCount }, emails] = await Promise.all([
    listAuditLogs(filters),
    auditActorSuggestions(),
  ]);
  const filtered = hasAuditFilters(filters);

  return (
    <div className="space-y-6">
      <PageHeading
        title="Audit log"
        description="Every sign-in, every change, and who made it."
        action={
          filtered && total > 0 ? (
            <ConfirmForm
              action={purgeAuditLogs}
              title="Delete these entries?"
              message={`This permanently removes the ${total} ${
                total === 1 ? "entry" : "entries"
              } matching the current filters. The deletion itself is recorded, but the entries cannot be recovered.`}
              confirmLabel="Delete entries"
              acknowledge="I understand these entries cannot be recovered."
            >
              {/* The filters travel with the form, so the action deletes
                  exactly what this page is showing. */}
              <input type="hidden" name="q" value={filters.q} />
              <input type="hidden" name="role" value={filters.role ?? ""} />
              <input
                type="hidden"
                name="category"
                value={filters.category ?? ""}
              />
              <input type="hidden" name="action" value={filters.action ?? ""} />
              <input type="hidden" name="from" value={filters.from ?? ""} />
              <input type="hidden" name="to" value={filters.to ?? ""} />
              <Button type="submit" variant="danger">
                <Trash2 size={16} aria-hidden />
                Delete {total} matching
              </Button>
            </ConfirmForm>
          ) : null
        }
      />

      <AuditFilters filters={filters} emails={emails} />

      {rows.length === 0 ? (
        <EmptyState
          icon={filtered ? SearchX : ScrollText}
          title={filtered ? "Nothing matches these filters" : "Nothing yet"}
          description={
            filtered
              ? "Try a wider date range, a different person, or clear the filters."
              : "Activity will appear here as people sign in and start working."
          }
        />
      ) : (
        <>
          <p className="text-sm text-ink-500">
            {total} {total === 1 ? "entry" : "entries"}
            {pageCount > 1 ? ` · page ${page} of ${pageCount}` : ""}
          </p>

          {/* Table from md; cards below it. */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-surface shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    When
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Who
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Action
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    What happened
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-ink-50">
                    <td
                      className="px-4 py-3 text-xs whitespace-nowrap text-ink-500"
                      title={exact(row.createdAt)}
                    >
                      {relative(row.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-800">
                        {row.actorName}
                      </p>
                      <p className="text-xs text-ink-500">
                        {row.actorEmail ?? "—"}
                      </p>
                      <ActorRole role={row.actorRole} />
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-ink-600">
                      {row.actionLabel}
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {row.summary}
                      <Details row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {rows.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm font-semibold text-ink-800">
                    {row.actorName}
                  </p>
                  <span className="shrink-0 text-2xs text-ink-500">
                    {relative(row.createdAt)}
                  </span>
                </div>
                <p className="truncate text-xs text-ink-500">
                  {row.actorEmail ?? "—"}
                </p>
                <p className="mt-2 text-sm text-ink-700">{row.summary}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ActorRole role={row.actorRole} />
                  <span className="text-2xs font-semibold text-ink-500">
                    {row.actionLabel}
                  </span>
                </div>
                <Details row={row} />
              </li>
            ))}
          </ul>

          {pageCount > 1 ? (
            <nav
              aria-label="Audit log pages"
              className="flex items-center justify-between gap-3 text-sm"
            >
              <PageLink
                filters={filters}
                page={page - 1}
                disabled={page <= 1}
                label="← Newer"
              />
              <span className="text-ink-500">
                {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <PageLink
                filters={filters}
                page={page + 1}
                disabled={page >= pageCount}
                label="Older →"
              />
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * The details nobody reads until they need them — ids, changed fields, the IP a
 * sign-in came from. Collapsed, so the summary column stays scannable.
 */
function Details({ row }: { row: AuditRow }) {
  const hasMeta = row.meta !== null && Object.keys(row.meta).length > 0;
  if (!hasMeta && !row.ip && !row.targetId) return null;

  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-2xs font-semibold text-ink-500 hover:text-ink-800">
        Details
      </summary>
      <dl className="mt-1 space-y-0.5 text-2xs text-ink-500">
        <Detail label="Target">
          {row.targetType}
          {row.targetId ? ` · ${row.targetId}` : ""}
        </Detail>
        {row.ip ? <Detail label="From">{row.ip}</Detail> : null}
        {hasMeta
          ? Object.entries(row.meta ?? {}).map(([key, value]) => (
              <Detail key={key} label={key}>
                {typeof value === "object" && value !== null
                  ? JSON.stringify(value)
                  : String(value)}
              </Detail>
            ))
          : null}
      </dl>
    </details>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-semibold">{label}</dt>
      <dd className="min-w-0 break-all">{children}</dd>
    </div>
  );
}

/** Machines and signed-out attempts are not roles, so they read differently. */
function ActorRole({ role }: { role: string }) {
  const label = isRole(role)
    ? ROLE_LABEL[role]
    : role === "anonymous"
      ? "Not signed in"
      : "System";

  return (
    <span className="mt-1 inline-block rounded-full border border-border bg-surface-muted px-2 py-0.5 text-2xs font-bold text-ink-600">
      {label}
    </span>
  );
}

function PageLink({
  filters,
  page,
  disabled,
  label,
}: {
  filters: Filters;
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return <span className="text-ink-400">{label}</span>;
  }

  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.role) params.set("role", filters.role);
  if (filters.category) params.set("category", filters.category);
  if (filters.action) params.set("action", filters.action);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));

  const search = params.toString();
  return (
    <Link
      href={search ? `/admin/audit?${search}` : "/admin/audit"}
      className="font-semibold text-brand-700 hover:text-brand-800"
    >
      {label}
    </Link>
  );
}

/** "3 minutes ago" for the recent, a date once that stops being useful. */
function relative(iso: string): string {
  const then = new Date(iso);
  const minutes = Math.round((Date.now() - then.getTime()) / 60_000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  if (minutes < 60 * 24 * 7) return `${Math.round(minutes / (60 * 24))}d ago`;

  return then.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function exact(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
