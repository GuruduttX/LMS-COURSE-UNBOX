import { ArrowLeft, ClipboardCheck, Ban, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SessionForm } from "@/components/staff/SessionForm";
import { PageHeading } from "@/components/staff/StatTile";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmForm } from "@/components/ui/ConfirmDialog";
import { assertScope, requireRole } from "@/lib/auth/guards";
import {
  batchesForPrograms,
  getManagedSession,
  schedulableProgramsFor,
  teachersForPrograms,
} from "@/lib/data/manager-sessions";
import { isGoogleCalendarConfigured } from "@/lib/googleCalendar";
import { toIstFields } from "@/lib/validation/session";

import { setSessionStatus, updateSession } from "../actions";

/**
 * Edit one session, and cancel or restore it.
 *
 * `assertScope` here is what stops a program manager opening a session in a
 * program they don't run by pasting its id — and it 404s rather than refusing,
 * so the id isn't confirmed to exist either.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/manager/sessions/[id]">): Promise<Metadata> {
  const { id } = await params;
  const session = await getManagedSession(id);
  return { title: session ? session.title : "Session not found" };
}

export default async function EditSessionPage({
  params,
}: PageProps<"/manager/sessions/[id]">) {
  const user = await requireRole("program_manager");

  const { id } = await params;
  const session = await getManagedSession(id);
  if (!session) notFound();

  assertScope(user, { program: session.programSlug });

  const programs = await schedulableProgramsFor(user);
  const slugs = programs.map((program) => program.slug);
  const [teachers, batchesByProgram] = await Promise.all([
    teachersForPrograms(slugs),
    batchesForPrograms(slugs),
  ]);
  const { date, time } = toIstFields(new Date(session.startsAt));

  const isPast = hasFinished(session.startsAt, session.durationMinutes);

  return (
    <div className="space-y-6">
      <Link
        href="/manager/sessions"
        className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
      >
        <ArrowLeft size={16} aria-hidden />
        Back to sessions
      </Link>

      <PageHeading
        title={session.title}
        description={session.programTitle}
        action={
          isPast && session.status === "scheduled" ? (
            <ButtonLink href={`/manager/sessions/${session.id}/attendance`}>
              <ClipboardCheck size={16} aria-hidden />
              {session.markedCount === 0 ? "Mark attendance" : "Attendance"}
            </ButtonLink>
          ) : undefined
        }
      />

      {session.status === "cancelled" ? (
        <p className="rounded-lg border border-border bg-surface-muted p-3 text-sm text-ink-600">
          This session is cancelled. Students still see it, marked as cancelled.
        </p>
      ) : null}

      <SessionForm
        mode="edit"
        action={updateSession}
        programs={programs}
        batchesByProgram={batchesByProgram}
        teachers={teachers}
        googleConfigured={isGoogleCalendarConfigured()}
        generatedLink={
          session.googleEventId
            ? { url: session.joinUrl, isMock: session.isMockLink }
            : null
        }
        initial={{
          id: session.id,
          title: session.title,
          description: session.description,
          kind: session.kind,
          programSlug: session.programSlug,
          batch: session.batch,
          date,
          time,
          durationMinutes: String(session.durationMinutes),
          teacherId: session.teacherId ?? "",
          joinUrl: session.joinUrl,
          generateMeet: "",
        }}
      />

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <header className="border-b border-border bg-surface-muted px-5 py-3.5 sm:px-6">
          <h2 className="text-sm font-bold text-ink-900">
            {session.status === "cancelled"
              ? "Restore this session"
              : "Cancel this session"}
          </h2>
        </header>
        <div className="p-5 sm:p-6">
          <ConfirmForm
            action={setSessionStatus}
            when={session.status !== "cancelled"}
            title={`Cancel “${session.title}”?`}
            message="Students keep seeing it, marked as cancelled. You can restore it here afterwards."
            confirmLabel="Cancel session"
            cancelLabel="Keep it"
            className="mt-3 flex flex-wrap items-center gap-3"
          >
            <input type="hidden" name="id" value={session.id} />
            <input
              type="hidden"
              name="cancel"
              value={session.status === "cancelled" ? "false" : "true"}
            />
            <Button type="submit" variant="secondary">
              {session.status === "cancelled" ? (
                <>
                  <RotateCcw size={15} aria-hidden />
                  Restore session
                </>
              ) : (
                <>
                  <Ban size={15} aria-hidden />
                  Cancel session
                </>
              )}
            </Button>
            <p className="text-xs text-ink-500">
              Cancelling keeps the session visible to students, marked as
              cancelled — it is never deleted.
            </p>
          </ConfirmForm>
        </div>
      </section>
    </div>
  );
}

/** Reading the clock, kept out of the component body (react-hooks/purity). */
function hasFinished(startsAt: string, durationMinutes: number): boolean {
  return new Date(startsAt).getTime() + durationMinutes * 60_000 < Date.now();
}
