import "server-only";

import { connectToDatabase } from "@/lib/db";
import { Attendance } from "@/models/Attendance";
import { Enrollment } from "@/models/Enrollment";
import { LiveSession } from "@/models/LiveSession";
import { Program } from "@/models/Program";

import { sessionBatchFilter } from "./session-batches";
import {
  SESSION_KINDS,
  SESSION_KIND_LABEL,
  type SessionKind,
} from "./session-kinds";

export { SESSION_KINDS, SESSION_KIND_LABEL };
export type { SessionKind };

/**
 * Live sessions for one program, and the attendance they add up to.
 *
 * Real now: this used to be a static seed with times stored as minutes from
 * midnight so the placeholder could never go stale. Sessions carry real UTC
 * datetimes, created by a program manager at /manager/sessions.
 *
 * Two things kept from the placeholder because they were right:
 *
 * - **Everything countable is derived.** Attendance totals and percentages are
 *   computed from the marks, never stored, so no row can contradict another.
 * - **`getCourseSessions` returns null** for "no such program *or* not
 *   enrolled", which the page turns into a 404.
 *
 * **A student sees their own cohort's timetable**, plus the program-wide
 * sessions every batch is invited to. Two cohorts of one program are taught on
 * different evenings, so showing a student every session of the program would
 * fill their screen with classes they cannot attend and then mark their
 * attendance against them. `sessionBatchFilter` states that rule once; this is
 * one of its three readers.
 *
 * What changed: upcoming vs completed is now decided by the clock
 * (`startsAt` in the past), not by whether attendance happens to be marked.
 * A finished session nobody has marked yet is still finished.
 */

export type SessionAttendance = "present" | "absent";

export type LiveSessionView = {
  id: string;
  title: string;
  description: string;
  kind: SessionKind;
  /** ISO datetime, UTC. Format for display at the edge of the UI. */
  startsAt: string;
  durationMinutes: number;
  teacherName: string;
  status: "scheduled" | "cancelled";
  /** Running right now, as of the request that read it. Derived here because
   *  the clock cannot be read during render. */
  isLive: boolean;
  /** Null until attendance is marked — which is not the same as absent. */
  attendance: SessionAttendance | null;
  recordingUrl: string | null;
  joinUrl: string | null;
};

export type KindAttendance = {
  kind: SessionKind;
  total: number;
  attended: number;
};

export type AttendanceSummary = {
  /** 0–100 across every marked session. */
  percent: number;
  byKind: KindAttendance[];
};

export type CourseSessions = {
  program: { slug: string; title: string };
  attendance: AttendanceSummary;
  upcoming: LiveSessionView[];
  completed: LiveSessionView[];
};

/**
 * @param slug program slug
 * @param studentId whose attendance to read
 */
export async function getCourseSessions(
  slug: string,
  studentId: string,
): Promise<CourseSessions | null> {
  await connectToDatabase();

  // The `Program` collection — which is now the only place programs live. This
  // used to look the slug up in a hand-written array holding the four launch
  // programs, so it answered "no such program" for every program created since,
  // and this returns null, which the page turns into a 404. The rows below were
  // always real; only the guard in front of them pointed at the old source.
  const program = await Program.findOne({ slug }).select("slug title").lean();
  if (!program) return null;

  const docs = await LiveSession.find({
    programSlug: slug,
    ...sessionBatchFilter([await batchOf(slug, studentId)]),
  })
    .sort({ startsAt: -1 })
    .lean();

  const marks = await Attendance.find({
    studentId,
    sessionId: { $in: docs.map((doc) => doc._id) },
  })
    .select("sessionId state")
    .lean();

  const bySession = new Map(
    marks.map((mark) => [String(mark.sessionId), mark.state as SessionAttendance]),
  );

  const now = Date.now();
  const sessions: LiveSessionView[] = docs.map((doc) => ({
    id: String(doc._id),
    title: doc.title,
    description: doc.description ?? "",
    kind: doc.kind as SessionKind,
    startsAt: doc.startsAt.toISOString(),
    durationMinutes: doc.durationMinutes,
    teacherName: doc.teacherName ?? "",
    status: doc.status as "scheduled" | "cancelled",
    isLive:
      doc.status !== "cancelled" &&
      now >= doc.startsAt.getTime() &&
      now < doc.startsAt.getTime() + doc.durationMinutes * 60_000,
    attendance: bySession.get(String(doc._id)) ?? null,
    recordingUrl: doc.recordingUrl || null,
    joinUrl: doc.joinUrl || null,
  }));

  const isPast = (session: LiveSessionView) =>
    new Date(session.startsAt).getTime() +
      session.durationMinutes * 60_000 <
    now;

  const completed = sessions.filter(isPast);
  const upcoming = sessions
    .filter((session) => !isPast(session))
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );

  return {
    program: { slug: program.slug, title: program.title },
    attendance: summarise(completed),
    upcoming,
    completed,
  };
}

/**
 * Which cohort this student sits in on this program, or `""`.
 *
 * `""` covers "not enrolled", "no batch on the enrolment" and "no such
 * program". All three land in the same place: `sessionBatchFilter` then matches
 * only the program-wide sessions, which is the honest answer — a student with
 * no cohort has no cohort's timetable, and inventing one would show them
 * somebody else's classes.
 */
async function batchOf(programSlug: string, studentId: string): Promise<string> {
  const program = await Program.findOne({ slug: programSlug })
    .select("_id")
    .lean();
  if (!program) return "";

  const enrollment = await Enrollment.findOne({
    studentId,
    programId: program._id,
  })
    .select("batch")
    .lean();

  return enrollment?.batch ?? "";
}

/**
 * Attendance across the sessions that have actually been marked.
 *
 * Unmarked sessions are excluded on purpose: a session the program manager
 * hasn't got to yet is not an absence, and counting it as one would tell a
 * student their attendance had dropped because of paperwork. Cancelled sessions
 * are excluded for the same reason — nobody can attend one.
 */
function summarise(completed: LiveSessionView[]): AttendanceSummary {
  const marked = completed.filter(
    (session) => session.attendance !== null && session.status !== "cancelled",
  );

  const byKind = SESSION_KINDS.map((kind) => {
    const ofKind = marked.filter((session) => session.kind === kind);
    return {
      kind,
      total: ofKind.length,
      attended: ofKind.filter((session) => session.attendance === "present")
        .length,
    };
  }).filter((row) => row.total > 0);

  const total = byKind.reduce((sum, row) => sum + row.total, 0);
  const attended = byKind.reduce((sum, row) => sum + row.attended, 0);

  return {
    percent: total === 0 ? 0 : Math.round((attended / total) * 100),
    byKind,
  };
}

/** "18th Aug, 2026" — the format the reference screens use. */
export function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  const day = Number(
    date.toLocaleDateString("en-IN", { day: "numeric", timeZone: IST }),
  );
  const month = date.toLocaleDateString("en-IN", {
    month: "short",
    timeZone: IST,
  });
  const year = date.toLocaleDateString("en-IN", {
    year: "numeric",
    timeZone: IST,
  });

  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";

  return `${day}${suffix} ${month}, ${year}`;
}

/** "8:00 pm" — always IST, wherever the server happens to be. */
export function formatSessionTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: IST,
    })
    .replace("am", "am")
    .replace("pm", "pm");
}

/** yyyy-mm-dd in IST — for date filters, which are typed in local terms. */
export function istDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: IST });
}

const IST = "Asia/Kolkata";
