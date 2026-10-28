import { Plus, UserPlus, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeading } from "@/components/staff/StatTile";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireRole } from "@/lib/auth/guards";
import { ROLES, ROLE_LABEL } from "@/lib/auth/roles";
import {
  listPeople,
  parsePeopleFilters,
  type PersonRow,
} from "@/lib/data/people";
import { programTitles } from "@/lib/data/programs";

/**
 * Everyone in the system. Filters are URL state (`?role=&status=&q=`) — the
 * same pattern as the student sessions screen, so the page stays a server
 * component, a filtered view is linkable, and Back works.
 *
 * design.md §5: below `md` the table becomes a card list rather than a
 * horizontal scroll. Both layouts render from the same rows, so there is no
 * second source of truth about what a row contains.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage({
  searchParams,
}: PageProps<"/admin/people">) {
  await requireRole("admin");

  const query = await searchParams;
  const filters = parsePeopleFilters({
    role: first(query.role),
    status: first(query.status),
    q: first(query.q),
  });
  const people = await listPeople(filters);

  // One query for the page rather than one per row — and against the `Program`
  // collection, which is the register of what exists. This used to look titles
  // up in the static home-page array, so every program created through the
  // admin UI printed as its raw slug.
  const titles = await programTitles(
    people.flatMap((person) =>
      person.assignments.map((item) => item.programSlug),
    ),
  );
  const hasFilters = Boolean(filters.role || filters.status || filters.q);

  return (
    <div className="space-y-6">
      <PageHeading
        title="People"
        description="Everyone with an account — staff and students."
        action={
          <ButtonLink href="/admin/people/new">
            <Plus size={16} aria-hidden />
            Add person
          </ButtonLink>
        }
      />

      <form
        method="get"
        action="/admin/people"
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1">
          <span className="sr-only">Search by name or email</span>
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Name or email"
            className="h-10 w-56 rounded-lg border border-border bg-surface px-3 text-sm text-ink-800 placeholder:text-ink-400"
          />
        </label>

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
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="sr-only">Status</span>
          <select
            name="status"
            defaultValue={filters.status ?? ""}
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-ink-800"
          >
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>

        <button
          type="submit"
          className="h-10 rounded-lg bg-brand-solid px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-solid-hover"
        >
          Apply
        </button>

        {hasFilters ? (
          <Link
            href="/admin/people"
            className="px-2 text-sm font-semibold text-ink-500 hover:text-ink-800"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {people.length === 0 ? (
        <EmptyState
          icon={hasFilters ? UsersRound : UserPlus}
          title={
            hasFilters ? "Nobody matches these filters" : "No accounts yet"
          }
          description={
            hasFilters
              ? "Try a different role or status, or clear the filters."
              : "Add the program managers and teachers who will run your programs."
          }
          action={
            hasFilters ? null : (
              <ButtonLink href="/admin/people/new">Add person</ButtonLink>
            )
          }
        />
      ) : (
        <>
          <p className="text-sm text-ink-500">
            {people.length} {people.length === 1 ? "person" : "people"}
          </p>

          {/* Table from md; cards below it. */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-surface shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Role
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Assigned to
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Last sign-in
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {people.map((person) => (
                  <tr key={person.id} className="hover:bg-ink-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/people/${person.id}`}
                        className="font-semibold text-brand-700 hover:text-brand-800"
                      >
                        {person.name}
                      </Link>
                      <p className="text-xs text-ink-500">{person.email}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {ROLE_LABEL[person.role]}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-600">
                      {assignedSummary(person, titles)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={person.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500">
                      {formatWhen(person.lastLoginAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {people.map((person) => (
              <li
                key={person.id}
                className="rounded-xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/people/${person.id}`}
                      className="truncate text-sm font-bold text-brand-700"
                    >
                      {person.name}
                    </Link>
                    <p className="truncate text-xs text-ink-500">
                      {person.email}
                    </p>
                  </div>
                  <StatusBadge status={person.status} />
                </div>
                <p className="mt-2 text-xs text-ink-600">
                  {ROLE_LABEL[person.role]} · {assignedSummary(person, titles)}
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  Last sign-in {formatWhen(person.lastLoginAt)}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "suspended" }) {
  return status === "active" ? (
    <span className="rounded-full border border-success-500/30 bg-success-50 px-2 py-0.5 text-2xs font-bold text-success-700">
      Active
    </span>
  ) : (
    <span className="rounded-full border border-danger-500/30 bg-danger-50 px-2 py-0.5 text-2xs font-bold text-danger-700">
      Suspended
    </span>
  );
}

function assignedSummary(
  person: PersonRow,
  titles: Map<string, string>,
): string {
  if (person.role === "admin") return "Everything";
  if (person.assignments.length === 0) return "—";

  return person.assignments
    .map((item) => {
      const title = titles.get(item.programSlug) ?? item.programSlug;
      // A teacher's real scope is their cohorts, so the row says which. No
      // batches means every batch (models/User.ts) and prints as the bare
      // program title, which is what "all of it" has always looked like here.
      if (item.batches.length > 0) {
        return `${title} (${item.batches.join(", ")})`;
      }
      return item.courseIds.length > 0
        ? `${title} (${item.courseIds.length} courses)`
        : title;
    })
    .join(", ");
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
