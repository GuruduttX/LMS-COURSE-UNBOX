import { CalendarClock, CheckCircle2, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeading } from "@/components/staff/StatTile";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireRole } from "@/lib/auth/guards";
import {
  listManagedSessions,
  schedulableProgramsFor,
  type ManagedSession,
} from "@/lib/data/manager-sessions";
import { SESSION_KIND_SINGULAR } from "@/lib/data/session-kinds";
import { formatSessionDate, formatSessionTime } from "@/lib/data/sessions";

/**
 * Every session in the programs this manager runs — upcoming first, because
 * that is what they are about to have to deal with.
 *
 * Tab and program filter are URL state, the same pattern as everywhere else.
 * The list is scoped in the query itself (`listManagedSessions` intersects with
 * the user's assignments), so a manager cannot see another program's schedule
 * even by guessing a slug.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sessions" };

type Tab = "upcoming" | "past";

export default async function ManagerSessionsPage({
  searchParams,
}: PageProps<"/manager/sessions">) {
  const user = await requireRole("program_manager");

  const query = await searchParams;
  const tab: Tab = first(query.tab) === "past" ? "past" : "upcoming";
  const programSlug = first(query.program) ?? null;

  const programs = await schedulableProgramsFor(user);
  const sessions = await listManagedSessions(user, { programSlug });

  const shown = forTab(sessions, tab);

  return (
    <div className="space-y-6">
      <PageHeading
        title="Live sessions"
        description="Schedule sessions, assign teachers, and mark attendance."
        action={
          programs.length > 0 ? (
            <ButtonLink href="/manager/sessions/new">
              <Plus size={16} aria-hidden />
              Schedule session
            </ButtonLink>
          ) : undefined
        }
      />

      {query.done === "created" ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-success-500/30 bg-success-50 p-3 text-sm font-medium text-success-700"
        >
          <CheckCircle2 size={16} aria-hidden />
          Session scheduled. Students on that program can see it now.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border">
        <nav aria-label="Session period" className="flex gap-2">
          <TabLink
            href={hrefFor("upcoming", programSlug)}
            isActive={tab === "upcoming"}
          >
            Upcoming
          </TabLink>
          <TabLink
            href={hrefFor("past", programSlug)}
            isActive={tab === "past"}
          >
            Past
          </TabLink>
        </nav>

        {programs.length > 1 ? (
          <form method="get" action="/manager/sessions" className="pb-2">
            <input type="hidden" name="tab" value={tab} />
            <label className="sr-only" htmlFor="program">
              Program
            </label>
            <select
              id="program"
              name="program"
              defaultValue={programSlug ?? ""}
              className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-ink-800"
            >
              <option value="">All programs</option>
              {programs.map((program) => (
                <option key={program.slug} value={program.slug}>
                  {program.title}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="ml-2 h-9 rounded-lg border border-border px-3 text-sm font-semibold text-ink-700 hover:bg-ink-50"
            >
              Filter
            </button>
          </form>
        ) : null}
      </div>

      {programs.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No programs assigned yet"
          description="An admin assigns programs to program managers. You can schedule sessions once you run one."
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={
            tab === "upcoming" ? "Nothing scheduled yet" : "No past sessions"
          }
          description={
            tab === "upcoming"
              ? "Schedule a session and it appears on every enrolled student's sessions screen."
              : "Sessions move here once they have finished."
          }
          action={
            tab === "upcoming" ? (
              <ButtonLink href="/manager/sessions/new">
                Schedule session
              </ButtonLink>
            ) : null
          }
        />
      ) : (
        <ul className="space-y-3">
          {shown.map((session) => (
            <li
              key={session.id}
              className="rounded-xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/manager/sessions/${session.id}`}
                      className="text-sm font-bold text-brand-700 hover:text-brand-800 sm:text-base"
                    >
                      {session.title}
                    </Link>
                    <span
                      className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${
                        session.kind === "placement"
                          ? "bg-gold-100 text-ink-800"
                          : "bg-brand-50 text-brand-700"
                      }`}
                    >
                      {SESSION_KIND_SINGULAR[session.kind]}
                    </span>
                    {session.status === "cancelled" ? (
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-bold text-ink-600">
                        Cancelled
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-1 text-xs text-ink-500">
                    {formatSessionDate(session.startsAt)} ·{" "}
                    {formatSessionTime(session.startsAt)} ·{" "}
                    {session.durationMinutes} min · {session.programTitle}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    {session.teacherName ? (
                      <>Teacher: {session.teacherName}</>
                    ) : (
                      <span className="font-semibold text-ink-700">
                        No teacher assigned
                      </span>
                    )}
                  </p>
                </div>

                {hasFinished(session) && session.status === "scheduled" ? (
                  <ButtonLink
                    href={`/manager/sessions/${session.id}/attendance`}
                    size="sm"
                    variant={
                      session.markedCount === 0 ? "primary" : "secondary"
                    }
                  >
                    {session.markedCount === 0
                      ? "Mark attendance"
                      : `Attendance (${session.markedCount})`}
                  </ButtonLink>
                ) : (
                  <ButtonLink
                    href={`/manager/sessions/${session.id}`}
                    size="sm"
                    variant="secondary"
                  >
                    Edit
                  </ButtonLink>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Split by the clock, not by whether attendance happens to be marked: a
 * finished session nobody has marked yet is still finished.
 *
 * Reading the clock lives here rather than in the component body — React's
 * purity rule is right that a component shouldn't call `Date.now()` directly.
 */
function forTab(sessions: ManagedSession[], tab: Tab): ManagedSession[] {
  const now = Date.now();

  return sessions
    .filter((session) => hasFinished(session, now) === (tab === "past"))
    .sort((a, b) => {
      const left = new Date(a.startsAt).getTime();
      const right = new Date(b.startsAt).getTime();
      return tab === "past" ? right - left : left - right;
    });
}

function hasFinished(session: ManagedSession, now = Date.now()): boolean {
  return (
    new Date(session.startsAt).getTime() + session.durationMinutes * 60_000 <
    now
  );
}

function hrefFor(tab: Tab, programSlug: string | null): string {
  const params = new URLSearchParams({ tab });
  if (programSlug) params.set("program", programSlug);
  return `/manager/sessions?${params}`;
}

function TabLink({
  href,
  isActive,
  children,
}: {
  href: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`-mb-px border-b-2 px-3 pb-3 text-sm font-semibold transition-colors ${
        isActive
          ? "border-brand-600 text-brand-600"
          : "border-transparent text-ink-600 hover:text-ink-900"
      }`}
    >
      {children}
    </Link>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
