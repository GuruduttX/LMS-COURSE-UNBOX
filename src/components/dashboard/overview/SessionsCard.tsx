import { CalendarDays, ExternalLink, Radio, Video } from "lucide-react";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/Button";
import {
  formatSessionDate,
  formatSessionTime,
  type LiveSessionView,
} from "@/lib/data/sessions";

/**
 * Right-rail schedule: the next few sessions for this program, real rows from
 * `getCourseSessions`. Cancelled ones are kept rather than filtered — a student
 * who planned around a session needs to see that it is off, not see it vanish.
 *
 * Liveness comes in on the row (`isLive`) rather than being computed here:
 * reading the clock during render is impure, so `getCourseSessions` derives it
 * once per request.
 */
export function SessionsCard({
  slug,
  sessions,
}: {
  slug: string;
  sessions: LiveSessionView[];
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4">
        <h2 className="text-base font-bold text-ink-900">Sessions</h2>
        <Link
          href={`/dashboard/${slug}/sessions`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
        >
          View all
          <ExternalLink size={13} aria-hidden />
        </Link>
      </div>

      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
          <CalendarDays size={15} aria-hidden className="text-ink-400" />
          Next up
        </p>
        <span className="rounded-full bg-ink-100 px-2.5 py-1 text-2xs font-semibold text-ink-600">
          {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
        </span>
      </div>

      <div className="p-4">
        {sessions.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-3">
            {sessions.map((session) => {
              const cancelled = session.status === "cancelled";
              const live = session.isLive;

              return (
                <li
                  key={session.id}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`text-sm font-semibold ${
                        cancelled
                          ? "text-ink-500 line-through"
                          : "text-ink-900"
                      }`}
                    >
                      {session.title}
                    </p>
                    {cancelled ? (
                      <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-bold uppercase text-ink-600">
                        Cancelled
                      </span>
                    ) : live ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-2xs font-bold uppercase text-danger-700">
                        <Radio size={11} aria-hidden />
                        Live
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {formatSessionDate(session.startsAt)} ·{" "}
                    {formatSessionTime(session.startsAt)} ·{" "}
                    {session.durationMinutes} min
                    {session.teacherName ? ` · ${session.teacherName}` : ""}
                  </p>
                  {!cancelled && session.joinUrl ? (
                    <ButtonLink
                      href={session.joinUrl}
                      size="sm"
                      variant={live ? "primary" : "secondary"}
                      className="mt-3 w-full"
                    >
                      <Video size={14} aria-hidden />
                      {live ? "Join now" : "Join link"}
                    </ButtonLink>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg bg-surface-muted px-4 py-8 text-center">
      <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-400">
        <Radio size={18} aria-hidden />
      </span>
      <p className="text-sm text-ink-500">No upcoming sessions scheduled.</p>
    </div>
  );
}
