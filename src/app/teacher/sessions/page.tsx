import { CalendarClock, Video } from "lucide-react";
import type { Metadata } from "next";

import { PageHeading } from "@/components/staff/StatTile";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireRole } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db";
import { programTitles } from "@/lib/data/programs";
import { SESSION_KIND_SINGULAR } from "@/lib/data/session-kinds";
import { formatSessionDate, formatSessionTime } from "@/lib/data/sessions";
import { LiveSession } from "@/models/LiveSession";

/**
 * The sessions a teacher has been given, and how to join them.
 *
 * Read-only by design: the program manager owns the timetable, so there is
 * nothing here to edit. A teacher who needs a change asks the manager — which
 * is what the role split decided, and pretending otherwise with a disabled
 * button would only invite the question.
 *
 * Already scoped correctly without a batch filter: `teacherId` is who the
 * manager put on the class, one at a time, which is narrower than "every
 * session of every cohort I take". The cohort is printed on the row instead,
 * because a teacher on three batches of one program needs to know which one is
 * turning up on Tuesday.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "My sessions" };

export default async function TeacherSessionsPage() {
  const user = await requireRole("teacher");

  await connectToDatabase();

  // An admin viewing this area sees every session; a teacher sees only theirs.
  const where =
    user.role === "admin"
      ? {}
      : { teacherId: user.id, status: "scheduled" as const };

  const docs = await LiveSession.find(where)
    .sort({ startsAt: -1 })
    .limit(100)
    .lean();

  // One lookup for the page: the title comes from the Program collection,
  // not the marketing array, which never held anything created since launch.
  const titles = await programTitles(docs.map((doc) => doc.programSlug));
  const sessions = toRows(docs, titles);
  const upcoming = sessions
    .filter((session) => !session.isPast)
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  const past = sessions.filter((session) => session.isPast);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeading
        title="My sessions"
        description="Sessions your program manager has assigned to you."
      />

      {sessions.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No sessions assigned"
          description="Your program manager schedules sessions and picks who takes them. Yours appear here."
        />
      ) : (
        <>
          <Group title="Upcoming" sessions={upcoming} showJoin />
          <Group title="Past" sessions={past} showJoin={false} />
        </>
      )}
    </div>
  );
}

type Row = {
  id: string;
  title: string;
  kind: "learning" | "placement";
  programTitle: string;
  /** The cohort, or "" for a program-wide session. */
  batch: string;
  startsAt: string;
  durationMinutes: number;
  joinUrl: string;
  status: "scheduled" | "cancelled";
  isPast: boolean;
};

type SessionDoc = {
  _id: unknown;
  title: string;
  kind: string;
  programSlug: string;
  batch?: string;
  startsAt: Date;
  durationMinutes: number;
  joinUrl?: string;
  status: string;
};

/**
 * Documents → rows, including "has it finished".
 *
 * Reading the clock lives here rather than in the component body: React's
 * purity rule is right that a component shouldn't call `Date.now()` directly.
 */
function toRows(docs: SessionDoc[], titles: Map<string, string>): Row[] {
  const now = Date.now();

  return docs.map((doc) => ({
    id: String(doc._id),
    title: doc.title,
    kind: doc.kind as "learning" | "placement",
    programTitle: titles.get(doc.programSlug) ?? doc.programSlug,
    batch: doc.batch ?? "",
    startsAt: doc.startsAt.toISOString(),
    durationMinutes: doc.durationMinutes,
    joinUrl: doc.joinUrl ?? "",
    status: doc.status as "scheduled" | "cancelled",
    isPast: doc.startsAt.getTime() + doc.durationMinutes * 60_000 < now,
  }));
}

function Group({
  title,
  sessions,
  showJoin,
}: {
  title: string;
  sessions: Row[];
  showJoin: boolean;
}) {
  if (sessions.length === 0) return null;

  return (
    <section>
      <h2 className="text-base font-bold text-ink-900 md:text-lg">{title}</h2>
      <ul className="mt-4 space-y-3">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-ink-900 sm:text-base">
                  {session.title}
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${
                    session.kind === "placement"
                      ? "bg-gold-100 text-ink-800"
                      : "bg-brand-50 text-brand-700"
                  }`}
                >
                  {SESSION_KIND_SINGULAR[session.kind]}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-500">
                {formatSessionDate(session.startsAt)} ·{" "}
                {formatSessionTime(session.startsAt)} ·{" "}
                {session.durationMinutes} min · {session.programTitle}
                {session.batch ? ` · ${session.batch}` : ""}
              </p>
            </div>

            {showJoin && session.joinUrl ? (
              <ButtonLink href={session.joinUrl} size="sm">
                <Video size={14} aria-hidden />
                Join
              </ButtonLink>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
