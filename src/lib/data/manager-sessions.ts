import "server-only";

import type { CurrentUser } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db";
import { isMockEventId } from "@/lib/googleCalendar";
import { Attendance } from "@/models/Attendance";
import { Batch } from "@/models/Batch";
import { LiveSession } from "@/models/LiveSession";
import { Enrollment } from "@/models/Enrollment";
import { Program } from "@/models/Program";
import { User } from "@/models/User";

import { programTitles, programsFor, type ProgramIdentity } from "./programs";
import type { SessionKind } from "./session-kinds";

/**
 * Reads behind the program manager's session screens — the staff-side view of
 * the same rows the student sees, with the things only staff care about:
 * who is teaching it, and how much of the roster has been marked.
 */

export type ManagedSession = {
  id: string;
  programSlug: string;
  programTitle: string;
  title: string;
  description: string;
  kind: SessionKind;
  startsAt: string;
  durationMinutes: number;
  /** The cohort it is for; `""` is the whole program — see models/LiveSession. */
  batch: string;
  teacherId: string | null;
  teacherName: string;
  joinUrl: string;
  /** Non-empty when we minted the link via Calendar — see models/LiveSession. */
  googleEventId: string;
  /** The link exists but is the placeholder from an unconfigured environment. */
  isMockLink: boolean;
  status: "scheduled" | "cancelled";
  /** How many attendance rows exist for it — 0 means nobody has marked it. */
  markedCount: number;
};

/**
 * The programs this user may schedule into. Admins get all of them.
 *
 * Async since it reads the `Program` collection: it used to filter `COURSES`
 * from data/home.ts, which meant the composer offered the four launch programs
 * — none of which is a row — and offered no way to pick a program anyone had
 * actually created. See lib/data/programs.ts.
 */
export function schedulableProgramsFor(
  user: CurrentUser,
): Promise<ProgramIdentity[]> {
  return programsFor(user);
}

export async function listManagedSessions(
  user: CurrentUser,
  filters: { programSlug?: string | null } = {},
): Promise<ManagedSession[]> {
  const schedulable = await schedulableProgramsFor(user);
  const allowed = schedulable.map((item) => item.slug);
  if (allowed.length === 0) return [];

  const slugs =
    filters.programSlug && allowed.includes(filters.programSlug)
      ? [filters.programSlug]
      : allowed;

  await connectToDatabase();
  const docs = await LiveSession.find({ programSlug: { $in: slugs } })
    .sort({ startsAt: -1 })
    .limit(200)
    .lean();

  const counts = await Attendance.aggregate<{ _id: unknown; count: number }>([
    { $match: { sessionId: { $in: docs.map((doc) => doc._id) } } },
    { $group: { _id: "$sessionId", count: { $sum: 1 } } },
  ]);

  const marked = new Map(counts.map((row) => [String(row._id), row.count]));
  // One lookup for the page, not one per row.
  const titles = new Map(schedulable.map((item) => [item.slug, item.title]));

  return docs.map((doc) =>
    toManaged(doc, marked.get(String(doc._id)) ?? 0, titles),
  );
}

export async function getManagedSession(
  id: string,
): Promise<ManagedSession | null> {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) return null;

  await connectToDatabase();
  const doc = await LiveSession.findById(id).lean();
  if (!doc) return null;

  const markedCount = await Attendance.countDocuments({ sessionId: doc._id });
  const titles = await programTitles([doc.programSlug]);
  return toManaged(doc, markedCount, titles);
}

/**
 * Active teachers who could take a session, across several programs.
 *
 * One flat list rather than a query per program: the schedule form needs every
 * option up front because its teacher dropdown re-filters as the program and
 * batch pickers move, and a round trip per option is a round trip per keystroke.
 *
 * Each teacher carries **which cohorts they take on each program**, because
 * that is the question the form is really asking — a teacher on the Tuesday
 * batch must not be offered for a Thursday class. `batches: []` means every
 * cohort of that program, the convention from models/User.ts, and the form
 * reads it the same way `batchScopeFor` does.
 */
export async function teachersForPrograms(
  slugs: string[],
): Promise<TeacherOption[]> {
  if (slugs.length === 0) return [];

  await connectToDatabase();

  const docs = await User.find({
    role: "teacher",
    status: "active",
    "assignments.programSlug": { $in: slugs },
  })
    .select("name assignments")
    .sort({ name: 1 })
    .lean();

  return docs.map((doc) => ({
    id: String(doc._id),
    name: doc.name,
    programs: (doc.assignments ?? [])
      .filter((item) => slugs.includes(item.programSlug))
      .map((item) => ({
        slug: item.programSlug,
        batches: item.batches ?? [],
      })),
  }));
}

/** A teacher as the schedule form needs them — see `teachersForPrograms`. */
export type TeacherOption = {
  id: string;
  name: string;
  /** One entry per program they teach; empty `batches` means every cohort. */
  programs: { slug: string; batches: string[] }[];
};

/**
 * The cohorts each program has, for the schedule form's batch picker.
 *
 * Closed batches are included, unlike the enrol picker's `batchOptionsFor`:
 * a cohort that has stopped taking new students is still being taught, and its
 * timetable is exactly the thing a manager is still filling in. What closes it
 * to *enrolment* says nothing about whether it has classes.
 */
export async function batchesForPrograms(
  slugs: string[],
): Promise<{ slug: string; batches: string[] }[]> {
  if (slugs.length === 0) return [];

  await connectToDatabase();

  const docs = await Batch.find({ programSlug: { $in: slugs } })
    .select("programSlug name")
    .sort({ name: 1 })
    .lean();

  return slugs.map((slug) => ({
    slug,
    batches: docs
      .filter((doc) => doc.programSlug === slug)
      .map((doc) => doc.name),
  }));
}

/**
 * The students to mark.
 *
 * Narrowed twice, and both narrowings were bugs once. It used to return every
 * active student whatever program it was asked about, because there was no
 * enrolment to ask; `Enrollment` fixed that. Now `batch` fixes the second half:
 * a session belongs to one cohort, and marking a register that lists the other
 * three cohorts is how somebody gets marked absent from a class they were never
 * in.
 *
 * `batch: ""` — the program-wide session every cohort attends — deliberately
 * returns the whole program's roster, because that is who was in the room.
 */
export async function rosterFor(programSlug: string, batch = "") {
  await connectToDatabase();

  const program = await Program.findOne({ slug: programSlug })
    .select("_id")
    .lean();
  if (!program) return [];

  const enrolled = await Enrollment.find({
    programId: program._id,
    status: "active",
    ...(batch ? { batch } : {}),
  })
    .select("studentId")
    .lean();

  if (enrolled.length === 0) return [];

  const docs = await User.find({
    _id: { $in: enrolled.map((row) => row.studentId) },
    status: "active",
  })
    .select("name email")
    .sort({ name: 1 })
    .lean();

  return docs.map((doc) => ({
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
  }));
}

/** Existing marks for one session, as a studentId → state map. */
export async function marksFor(sessionId: string) {
  await connectToDatabase();
  const docs = await Attendance.find({ sessionId }).select("studentId state").lean();

  return new Map(
    docs.map((doc) => [String(doc.studentId), doc.state as "present" | "absent"]),
  );
}

type Lean = {
  _id: unknown;
  programSlug: string;
  title: string;
  description?: string;
  kind: string;
  startsAt: Date;
  durationMinutes: number;
  batch?: string;
  teacherId?: unknown;
  teacherName?: string;
  joinUrl?: string;
  googleEventId?: string;
  status: string;
};

function toManaged(
  doc: Lean,
  markedCount: number,
  titles: Map<string, string>,
): ManagedSession {
  return {
    id: String(doc._id),
    programSlug: doc.programSlug,
    // Falls back to the slug for a session whose program has since been
    // deleted — a row that still has to render rather than crash the list.
    programTitle: titles.get(doc.programSlug) ?? doc.programSlug,
    title: doc.title,
    description: doc.description ?? "",
    kind: doc.kind as SessionKind,
    startsAt: doc.startsAt.toISOString(),
    durationMinutes: doc.durationMinutes,
    batch: doc.batch ?? "",
    teacherId: doc.teacherId ? String(doc.teacherId) : null,
    teacherName: doc.teacherName ?? "",
    joinUrl: doc.joinUrl ?? "",
    googleEventId: doc.googleEventId ?? "",
    isMockLink: isMockEventId(doc.googleEventId ?? ""),
    status: doc.status as "scheduled" | "cancelled",
    markedCount,
  };
}
