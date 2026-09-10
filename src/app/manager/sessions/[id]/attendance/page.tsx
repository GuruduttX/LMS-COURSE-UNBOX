import { ArrowLeft, CheckCircle2, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AttendanceRoster } from "@/components/staff/AttendanceRoster";
import { PageHeading } from "@/components/staff/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { assertScope, requireRole } from "@/lib/auth/guards";
import {
  getManagedSession,
  marksFor,
  rosterFor,
} from "@/lib/data/manager-sessions";
import { formatSessionDate, formatSessionTime } from "@/lib/data/sessions";

import { markAttendance } from "../../actions";

/**
 * Mark who turned up.
 *
 * Only offered once the session has actually finished — marking attendance for
 * something that hasn't happened is a data-entry error waiting to happen, so
 * the screen refuses rather than trusting the manager to notice.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/manager/sessions/[id]/attendance">): Promise<Metadata> {
  const { id } = await params;
  const session = await getManagedSession(id);
  return {
    title: session ? `Attendance · ${session.title}` : "Session not found",
  };
}

export default async function AttendancePage({
  params,
  searchParams,
}: PageProps<"/manager/sessions/[id]/attendance">) {
  const user = await requireRole("program_manager");

  const { id } = await params;
  const query = await searchParams;
  const session = await getManagedSession(id);
  if (!session) notFound();

  assertScope(user, { program: session.programSlug });

  const finished = hasFinished(session.startsAt, session.durationMinutes);

  // The cohort in the room, not the program. A program-wide session passes `""`
  // and gets everybody, which is who was actually there.
  const [roster, marks] = await Promise.all([
    rosterFor(session.programSlug, session.batch),
    marksFor(session.id),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={`/manager/sessions/${session.id}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
      >
        <ArrowLeft size={16} aria-hidden />
        Back to session
      </Link>

      <PageHeading
        title="Attendance"
        description={`${session.title} · ${formatSessionDate(session.startsAt)} at ${formatSessionTime(session.startsAt)}`}
      />

      {query.done === "marked" ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-success-500/30 bg-success-50 p-3 text-sm font-medium text-success-700"
        >
          <CheckCircle2 size={16} aria-hidden />
          Attendance saved. Every student&rsquo;s percentage updates
          immediately.
        </p>
      ) : null}

      {session.status === "cancelled" ? (
        <EmptyState
          icon={Users}
          title="This session was cancelled"
          description="Nobody can attend a cancelled session, so it doesn't count towards anyone's attendance."
        />
      ) : !finished ? (
        <EmptyState
          icon={Users}
          title="This session hasn't finished yet"
          description="Attendance can be marked once it's over — that way nobody is recorded absent before they've had the chance to turn up."
        />
      ) : roster.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students to mark"
          description="There are no active student accounts yet. Add them under People."
        />
      ) : (
        <AttendanceRoster
          sessionId={session.id}
          action={markAttendance}
          students={roster.map((student) => ({
            ...student,
            state: marks.get(student.id) ?? null,
          }))}
        />
      )}
    </div>
  );
}

/** Reading the clock, kept out of the component body (react-hooks/purity). */
function hasFinished(startsAt: string, durationMinutes: number): boolean {
  return new Date(startsAt).getTime() + durationMinutes * 60_000 < Date.now();
}
