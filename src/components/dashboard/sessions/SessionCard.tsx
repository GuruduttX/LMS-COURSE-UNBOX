import { CalendarDays, Clock, PlayCircle, User, Video } from "lucide-react";

import { ButtonLink } from "@/components/ui/Button";
import {
  formatSessionDate,
  formatSessionTime,
  type LiveSessionView,
} from "@/lib/data/sessions";

/**
 * One session. The same card serves both tabs — an upcoming session shows when
 * it runs and how to join, a completed one shows whether the student was there
 * and where the recording is. The left rule is a quiet kind marker; the badge
 * carries the state, which is what a student is scanning for.
 */
export function SessionCard({
  session,
  isUpcoming,
}: {
  session: LiveSessionView;
  isUpcoming: boolean;
}) {
  const cancelled = session.status === "cancelled";

  return (
    <li className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface p-4 pl-5 shadow-sm">
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 ${
          cancelled
            ? "bg-ink-300"
            : session.kind === "placement"
              ? "bg-gold-400"
              : "bg-brand-500"
        }`}
      />

      <div className="flex items-start justify-between gap-3">
        <h3
          className={`text-sm font-bold sm:text-base ${
            cancelled ? "text-ink-500 line-through" : "text-ink-900"
          }`}
        >
          {session.title}
        </h3>
        <SessionBadge session={session} isUpcoming={isUpcoming} />
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-ink-600">
        <CalendarDays size={14} aria-hidden className="text-ink-400" />
        {formatSessionDate(session.startsAt)}
      </p>

      <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
        <span className="flex items-center gap-1.5">
          <Clock size={14} aria-hidden className="text-ink-400" />
          {formatSessionTime(session.startsAt)} · {session.durationMinutes} min
        </span>
        {session.teacherName ? (
          <span className="flex items-center gap-1.5">
            <User size={14} aria-hidden className="text-ink-400" />
            {session.teacherName}
          </span>
        ) : null}
      </p>

      {session.description ? (
        <p className="mt-3 text-sm text-ink-600">{session.description}</p>
      ) : null}

      {/* Pushed to the bottom so cards in a row line their actions up. */}
      <div className="mt-4 flex-1 content-end">
        {cancelled ? (
          <p className="text-xs text-ink-500">This session was cancelled.</p>
        ) : isUpcoming ? (
          session.joinUrl ? (
            <ButtonLink
              href={session.joinUrl}
              size="sm"
              className="w-full sm:w-auto"
            >
              <Video size={14} aria-hidden />
              Join session
            </ButtonLink>
          ) : (
            <p className="text-xs text-ink-500">
              The joining link appears here closer to the time.
            </p>
          )
        ) : session.recordingUrl ? (
          <ButtonLink
            href={session.recordingUrl}
            size="sm"
            variant="ghost"
            className="px-0 text-brand-600 hover:bg-transparent hover:text-brand-700"
          >
            View video
            <PlayCircle size={15} aria-hidden />
          </ButtonLink>
        ) : (
          <p className="text-xs text-ink-500">Recording not available yet.</p>
        )}
      </div>
    </li>
  );
}

/**
 * Three states, deliberately distinct: upcoming, marked present/absent, and
 * finished-but-unmarked. The last one must not read as an absence — nobody has
 * said the student wasn't there.
 */
function SessionBadge({
  session,
  isUpcoming,
}: {
  session: LiveSessionView;
  isUpcoming: boolean;
}) {
  if (session.status === "cancelled") {
    return (
      <span className="shrink-0 rounded-full border border-border bg-ink-100 px-2.5 py-0.5 text-2xs font-bold text-ink-600">
        Cancelled
      </span>
    );
  }

  if (isUpcoming) {
    return (
      <span className="shrink-0 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-2xs font-bold text-brand-700">
        Upcoming
      </span>
    );
  }

  if (session.attendance === null) {
    return (
      <span className="shrink-0 rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-2xs font-bold text-ink-500">
        Not marked
      </span>
    );
  }

  const present = session.attendance === "present";

  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-2xs font-bold ${
        present
          ? "border-success-500/30 bg-success-50 text-success-700"
          : "border-danger-500/30 bg-danger-50 text-danger-700"
      }`}
    >
      {present ? "Present" : "Absent"}
    </span>
  );
}
