import { Radio } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { AttendanceBand } from "@/components/dashboard/sessions/AttendanceBand";
import { SessionCard } from "@/components/dashboard/sessions/SessionCard";
import { SessionFilters } from "@/components/dashboard/sessions/SessionFilters";
import { BackLink } from "@/components/ui/BackLink";
import { Container } from "@/components/ui/Container";
import { getStudent } from "@/lib/data/student";
import {
  getCourseSessions,
  istDateKey,
  SESSION_KINDS,
  SESSION_KIND_LABEL,
  type LiveSessionView,
  type SessionKind,
} from "@/lib/data/sessions";

/**
 * Every live session for one program — upcoming and completed — plus the
 * attendance the completed ones add up to. Reached from "View all" on the
 * overview's sessions card.
 *
 * The route param is called `course` to match the sibling pages, but it holds
 * the *program* slug.
 *
 * Tab and filters are URL state (`?tab=`, `?kind=`, `?from=`, `?to=`), so the
 * whole page is a server component apart from the attendance dialog, and an
 * unrecognised value reads as the default rather than 404ing.
 *
 * Rendered per request: the schedule is per-student and "upcoming" is relative
 * to now, which would freeze at build time.
 */
export const dynamic = "force-dynamic";

type Tab = "upcoming" | "completed";

export async function generateMetadata({
  params,
}: PageProps<"/dashboard/[course]/sessions">): Promise<Metadata> {
  const { course } = await params;
  const student = await getStudent();
  const sessions = await getCourseSessions(course, student.id);

  return {
    title: sessions ? `Live sessions · ${sessions.program.title}` : "Program not found",
  };
}

export default async function SessionsPage({
  params,
  searchParams,
}: PageProps<"/dashboard/[course]/sessions">) {
  const { course } = await params;
  const query = await searchParams;
  const student = await getStudent();
  const data = await getCourseSessions(course, student.id);

  // Not enrolled, or no such program — same answer either way.
  if (!data) notFound();

  const tab: Tab = first(query.tab) === "completed" ? "completed" : "upcoming";
  const kind = asKind(first(query.kind));
  const from = first(query.from) ?? "";
  const to = first(query.to) ?? "";

  const basePath = `/dashboard/${data.program.slug}/sessions`;
  const list = tab === "completed" ? data.completed : data.upcoming;

  // Filters apply to the completed tab only — that is where they are shown.
  const filtered =
    tab === "completed"
      ? list.filter(
          (session) =>
            (!kind || session.kind === kind) &&
            (!from || istDateKey(session.startsAt) >= from) &&
            (!to || istDateKey(session.startsAt) <= to),
        )
      : list;

  return (
    <>
      <DashboardHeader />

      <main id="main" className="flex-1 py-8 md:py-10">
        <Container size="wide">
          <BackLink href={`/dashboard/${data.program.slug}/overview`}>
            Back to overview
          </BackLink>

          <header className="mt-5">
            <p className="text-sm text-ink-600">
              Hi {student.firstName}, this is your {data.program.title} program
            </p>
            <h1 className="mt-1 text-xl font-extrabold tracking-tight text-ink-900 md:text-2xl">
              Live sessions
            </h1>
          </header>

          <div className="mt-6 space-y-6 lg:mt-8">
            <AttendanceBand attendance={data.attendance} />

            <nav
              aria-label="Session status"
              className="flex gap-2 border-b border-border"
            >
              <TabLink href={`${basePath}?tab=upcoming`} isActive={tab === "upcoming"}>
                Upcoming sessions
              </TabLink>
              <TabLink
                href={`${basePath}?tab=completed`}
                isActive={tab === "completed"}
              >
                Completed sessions
              </TabLink>
            </nav>

            {tab === "completed" ? (
              <SessionFilters basePath={basePath} kind={kind} from={from} to={to} />
            ) : null}

            {filtered.length === 0 ? (
              <Empty tab={tab} isFiltered={tab === "completed" && Boolean(kind || from || to)} />
            ) : (
              <div className="space-y-8">
                {SESSION_KINDS.map((sessionKind) => (
                  <KindSection
                    key={sessionKind}
                    kind={sessionKind}
                    isUpcoming={tab === "upcoming"}
                    sessions={filtered.filter((item) => item.kind === sessionKind)}
                  />
                ))}
              </div>
            )}
          </div>
        </Container>
      </main>
    </>
  );
}

/** Sessions of one kind. Renders nothing when the kind is empty — an empty
 *  "Placement sessions" heading tells a student nothing. */
function KindSection({
  kind,
  sessions,
  isUpcoming,
}: {
  kind: SessionKind;
  sessions: LiveSessionView[];
  isUpcoming: boolean;
}) {
  if (sessions.length === 0) return null;

  return (
    <section>
      <h2 className="text-base font-bold text-ink-900 md:text-lg">
        {SESSION_KIND_LABEL[kind]}
      </h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            isUpcoming={isUpcoming}
          />
        ))}
      </ul>
    </section>
  );
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
      className={`-mb-px border-b-2 px-3 pb-3 text-sm font-semibold transition-colors sm:text-base ${
        isActive
          ? "border-brand-600 text-brand-600"
          : "border-transparent text-ink-600 hover:text-ink-900"
      }`}
    >
      {children}
    </Link>
  );
}

function Empty({ tab, isFiltered }: { tab: Tab; isFiltered: boolean }) {
  return (
    <div className="rounded-xl bg-surface-muted px-6 py-14 text-center">
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface text-ink-400">
        <Radio size={20} aria-hidden />
      </span>
      <p className="text-sm text-ink-600">
        {isFiltered
          ? "No sessions match these filters."
          : tab === "upcoming"
            ? "No upcoming sessions yet."
            : "No completed sessions yet."}
      </p>
    </div>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Unknown values read as "no filter" rather than 404ing. */
function asKind(value: string | undefined): SessionKind | null {
  return SESSION_KINDS.find((kind) => kind === value) ?? null;
}
