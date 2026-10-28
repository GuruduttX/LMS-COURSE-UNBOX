import "server-only";
import { notFound } from "next/navigation";
import { Types } from "mongoose";

import {
  assertScope,
  batchScopeFor,
  ownsBatch,
  requireRole,
  type CurrentUser,
} from "@/lib/auth/guards";
import type { SubmissionStatus } from "@/lib/curriculum/submission-status";
import { connectToDatabase } from "@/lib/db";
import { Attendance } from "@/models/Attendance";
import { Attempt } from "@/models/Attempt";
import { Assignment } from "@/models/Assignment";
import { Enrollment, type EnrollmentStatus } from "@/models/Enrollment";
import { LiveSession } from "@/models/LiveSession";
import { Program } from "@/models/Program";
import { Subtopic } from "@/models/Subtopic";
import { SubtopicProgress } from "@/models/SubtopicProgress";
import { Submission } from "@/models/Submission";
import { User } from "@/models/User";

import { batchOptionsFor, type BatchOption } from "./batches";
import { getMarksheet, type Marksheet } from "./marksheet-db";
import { getProgramCurriculum } from "./curriculum-db";

/**
 * Who is in a program, and how they are doing.
 *
 * Three screens hang off this — programs → students → one student — and all
 * three are shared by the admin, manager and teacher areas. The **scope check
 * lives here, not in the pages**, so a route added later cannot forget it: a
 * manager or teacher only ever sees the programs on their own `assignments`,
 * and asking for one that is not theirs is a 404 rather than a refusal, exactly
 * as `assertScope` does everywhere else.
 *
 * ## Scope is a cohort, not a program
 *
 * A teacher is assigned to **batches** of a program, because a program runs
 * several at once and one teacher rarely takes all of them. So every read here
 * narrows twice: `assertScope` decides which programs, and `batchScopeFor`
 * decides which cohorts inside one. An admin and a program manager get `null`
 * from the second — every cohort — which is why the same code serves all three
 * areas rather than a teacher-shaped copy.
 *
 * The narrowing is done **in the query**, never by filtering rows afterwards:
 * a bug then shows a teacher too few students instead of somebody else's
 * cohort. The denominators (published subtopics, published assignments) stay
 * program-wide either way, because progress is measured against the material,
 * which every cohort shares.
 *
 * ## Cheap list, rich detail
 *
 * The roster's numbers are **aggregations**, not per-student tree loads: a
 * cohort of two hundred would otherwise mean two hundred `getProgramCurriculum`
 * calls to draw one table. So the list carries the things a group query can
 * answer honestly — how much of the material is done, how many assignments are
 * in, attendance, when they were last seen — and deliberately does *not* carry
 * a mark, because a real mark needs the marksheet's maxima and the marksheet
 * needs the tree.
 *
 * The individual screen loads the tree once and shows the real marksheet. That
 * split is why the list is fast and why nothing on it is an approximation of a
 * number shown properly elsewhere.
 */

/* --------------------------------- scope --------------------------------- */

export type StudentsArea = "admin" | "manager" | "teacher";

const ROLE_FOR: Record<StudentsArea, "admin" | "program_manager" | "teacher"> = {
  admin: "admin",
  manager: "program_manager",
  teacher: "teacher",
};

/**
 * Whoever is asking, having proved they may be in this area.
 *
 * `requireRole` admits an admin everywhere — the superset rule — so the admin's
 * copy of these screens is the same code with a wider scope rather than a
 * fourth silo.
 */
export async function studentsActor(area: StudentsArea): Promise<CurrentUser> {
  return requireRole(ROLE_FOR[area]);
}

export type ProgramCard = {
  slug: string;
  title: string;
  summary: string;
  /** Active enrolments. The number the person clicking actually wants. */
  students: number;
};

/**
 * The programs this person may see students for.
 *
 * An admin gets every program; everyone else gets exactly what is on their
 * `assignments`. Built **from the assignment list** rather than by fetching all
 * programs and filtering, so a bug here shows too few programs rather than
 * leaking a cohort.
 *
 * The count on each card is **the students this person can actually reach** —
 * their own batches, not the program's whole enrolment. A teacher who takes one
 * of four cohorts should not be told "128 students" and then shown thirty-one;
 * a number on a card that the screen behind it contradicts is worse than no
 * number. Grouping by `(programId, batch)` gets every card's figure in one
 * aggregation, whichever cohorts each program contributes.
 */
export async function programsWithStudents(
  user: CurrentUser,
): Promise<ProgramCard[]> {
  await connectToDatabase();

  const filter =
    user.role === "admin"
      ? { status: { $ne: "archived" as const } }
      : {
          status: { $ne: "archived" as const },
          slug: { $in: user.assignments.map((item) => item.programSlug) },
        };

  const programs = await Program.find(filter)
    .select("_id slug title summary")
    .sort({ order: 1, title: 1 })
    .lean();

  if (programs.length === 0) return [];

  const counts = await Enrollment.aggregate<{
    _id: { programId: Types.ObjectId; batch: string | null };
    n: number;
  }>([
    {
      $match: {
        programId: { $in: programs.map((row) => row._id) },
        status: "active",
      },
    },
    {
      $group: {
        _id: { programId: "$programId", batch: "$batch" },
        n: { $sum: 1 },
      },
    },
  ]);

  const byProgram = new Map<string, number>();

  for (const program of programs) {
    const scope = batchScopeFor(user, program.slug);
    const key = String(program._id);

    const total = counts
      .filter((row) => String(row._id.programId) === key)
      .filter(
        (row) => scope === null || scope.includes(row._id.batch ?? ""),
      )
      .reduce((sum, row) => sum + row.n, 0);

    byProgram.set(key, total);
  }

  return programs.map((program) => ({
    slug: program.slug,
    title: program.title,
    summary: program.summary ?? "",
    students: byProgram.get(String(program._id)) ?? 0,
  }));
}

/* -------------------------------- the roster ------------------------------ */

export type StudentRow = {
  id: string;
  name: string;
  email: string;
  status: EnrollmentStatus;
  batch: string;
  enrolledAt: string;
  /** Published subtopics completed, as a percentage of what exists. */
  progressPercent: number;
  subtopicsDone: number;
  subtopicsTotal: number;
  assignmentsIn: number;
  assignmentsTotal: number;
  /** Null when no session of theirs has been marked yet — not zero. */
  attendancePercent: number | null;
  /** The most recent thing they did anywhere in this program. */
  lastActiveAt: string | null;
  /** True when the account itself is suspended, whatever the enrolment says. */
  suspended: boolean;
};

export type Roster = {
  program: { slug: string; title: string };
  students: StudentRow[];
  /** Students not yet enrolled here — the admin's "enrol someone" picker. */
  enrollable: { id: string; name: string; email: string }[];
  /** Open cohorts on this program, with occupancy — the batch picker. */
  batches: BatchOption[];
};

/**
 * Everyone in one program, with the numbers that fit in a table.
 *
 * Six aggregations regardless of cohort size, assembled in memory — the same
 * shape as `curriculum-db.ts` reading a whole program in six flat queries.
 */
export async function programRoster(
  user: CurrentUser,
  programSlug: string,
  options: { batch?: string } = {},
): Promise<Roster> {
  assertScope(user, { program: programSlug });

  await connectToDatabase();

  const program = await Program.findOne({ slug: programSlug })
    .select("_id slug title")
    .lean();
  if (!program) notFound();

  // Two narrowings, and they are different things. `options.batch` is what the
  // screen asked for — the batch screen shows one cohort. `batchScopeFor` is
  // what this person is allowed, and it wins: a teacher asking for a cohort
  // that is not theirs gets an empty roster from the intersection rather than
  // somebody else's students.
  //
  // Narrowed in the query, not filtered afterwards, so a bug here shows too few
  // rows rather than too many. The denominators below stay program-wide — a
  // cohort's progress is still measured against the whole program's published
  // material, which every cohort shares.
  const scope = batchScopeFor(user, programSlug);
  const wanted =
    options.batch === undefined
      ? scope
      : scope === null
        ? [options.batch]
        : scope.filter((name) => name === options.batch);

  const enrollments = await Enrollment.find({
    programId: program._id,
    ...(wanted === null ? {} : { batch: { $in: wanted } }),
  })
    .sort({ status: 1, enrolledAt: 1 })
    .lean();

  const studentIds = enrollments.map((row) => row.studentId);

  const [people, subtopicsTotal, assignmentsTotal, done, submitted, attendance, lastSeen] =
    await Promise.all([
      User.find({ _id: { $in: studentIds } })
        .select("name email status")
        .lean(),
      // What "100%" means here: published material only. Counting drafts would
      // make a student's percentage fall when a teacher starts writing.
      Subtopic.countDocuments({ programId: program._id, status: "published" }),
      Assignment.countDocuments({ programId: program._id, status: "published" }),
      countByStudent(SubtopicProgress, {
        programId: program._id,
        studentId: { $in: studentIds },
        state: "completed",
      }),
      countByStudent(Submission, {
        programId: program._id,
        studentId: { $in: studentIds },
      }),
      attendanceByStudent(programSlug, studentIds),
      lastActiveByStudent(program._id, studentIds),
    ]);

  const byId = new Map(people.map((person) => [String(person._id), person]));

  const students: StudentRow[] = enrollments.flatMap((enrollment) => {
    const key = String(enrollment.studentId);
    const person = byId.get(key);
    // An enrolment whose user is gone is a broken row, not a student. It is
    // skipped rather than rendered as a blank line nobody can click.
    if (!person) return [];

    const subtopicsDone = done.get(key) ?? 0;
    const marked = attendance.get(key);

    return [
      {
        id: key,
        name: person.name,
        email: person.email,
        status: enrollment.status as EnrollmentStatus,
        batch: enrollment.batch ?? "",
        enrolledAt: enrollment.enrolledAt.toISOString(),
        progressPercent:
          subtopicsTotal === 0
            ? 0
            : Math.round((subtopicsDone / subtopicsTotal) * 100),
        subtopicsDone,
        subtopicsTotal,
        assignmentsIn: submitted.get(key) ?? 0,
        assignmentsTotal,
        attendancePercent:
          marked && marked.total > 0
            ? Math.round((marked.present / marked.total) * 100)
            : null,
        lastActiveAt: lastSeen.get(key)?.toISOString() ?? null,
        suspended: person.status === "suspended",
      },
    ];
  });

  // Only an admin is offered the picker, but the query is cheap and the page
  // decides what to render — see the enrol action for who may actually post.
  //
  // Program-wide when the rows are one batch's: somebody already in a *sibling*
  // cohort is not enrollable here — the enrolment is unique per (student,
  // program), so offering them would silently move them between batches.
  /**
   * **Withdrawn students are not counted as enrolled here.** The roster above
   * still lists them — that is the point of keeping the row — but a withdrawn
   * enrolment must not go on excluding them from this picker, or there is no
   * way back: `enrollStudent` reactivates a withdrawn row and refuses only an
   * *active* one, so the rule allowed a return that nothing could reach.
   */
  const enrolled = new Set(
    options.batch === undefined
      ? students
          .filter((row) => row.status !== "withdrawn")
          .map((row) => row.id)
      : (
          await Enrollment.find({
            programId: program._id,
            status: { $ne: "withdrawn" },
          })
            .select("studentId")
            .lean()
        ).map((row) => String(row.studentId)),
  );
  const enrollable = (
    await User.find({ role: "student", status: "active" })
      .select("name email")
      .sort({ name: 1 })
      .lean()
  )
    .filter((person) => !enrolled.has(String(person._id)))
    .map((person) => ({
      id: String(person._id),
      name: person.name,
      email: person.email,
    }));

  return {
    program: { slug: program.slug, title: program.title },
    students,
    enrollable,
    batches: await batchOptionsFor(programSlug),
  };
}

/* ------------------------------ one student ------------------------------- */

export type StudentDetail = {
  program: { slug: string; title: string };
  student: {
    id: string;
    name: string;
    email: string;
    phone: string;
    suspended: boolean;
  };
  enrollment: {
    status: EnrollmentStatus;
    batch: string;
    enrolledAt: string;
    completedAt: string | null;
  };
  /** The real thing, from the same function the student's own screen uses. */
  marksheet: Marksheet | null;
  progress: { done: number; total: number; percent: number };
  /** Every published assignment, and what this student did about it. */
  assignments: {
    id: string;
    title: string;
    courseTitle: string;
    dueDate: string | null;
    maxMarks: number;
    submission: {
      fileUrl: string;
      fileName: string;
      format: string;
      note: string;
      submittedAt: string;
      status: SubmissionStatus;
      version: number;
      scored: number | null;
      feedback: string;
    } | null;
  }[];
  attendance: { present: number; absent: number; percent: number | null };
};

/**
 * One student, in one program, in full.
 *
 * The marksheet is `getMarksheet` — the very function behind the student's own
 * marksheet screen — so staff and student cannot be looking at two different
 * sets of marks. That is the same rule the marksheet itself follows about the
 * curriculum page, applied one level up.
 */
export async function studentDetail(
  user: CurrentUser,
  programSlug: string,
  studentId: string,
): Promise<StudentDetail> {
  assertScope(user, { program: programSlug });

  await connectToDatabase();
  if (!Types.ObjectId.isValid(studentId)) notFound();

  const program = await Program.findOne({ slug: programSlug })
    .select("_id slug title")
    .lean();
  if (!program) notFound();

  // Scoped by program in the query: a student who is not in this program is
  // not found here, even for an admin who could see them somewhere else.
  const enrollment = await Enrollment.findOne({
    programId: program._id,
    studentId,
  }).lean();
  if (!enrollment) notFound();

  // And scoped by cohort, which the program check above cannot make: a teacher
  // holding the Tuesday batch reaching a Thursday student by typing their id is
  // exactly the hole batch assignment exists to close.
  //
  // `ownsBatch` rather than `assertScope({ batch })` on purpose. A student with
  // no batch on their enrolment belongs to no cohort, so no cohort's teacher
  // holds them — where an empty batch on a *session* means the opposite, and
  // that is the case `assertScope` is written for. See guards.ts.
  if (!ownsBatch(user, programSlug, enrollment.batch ?? "")) notFound();

  const person = await User.findOne({ _id: studentId, role: "student" })
    .select("name email phone status")
    .lean();
  if (!person) notFound();

  const [curriculum, marksheet, subtopicsTotal, done, attendance] =
    await Promise.all([
      getProgramCurriculum(programSlug, { studentId }),
      getMarksheet(programSlug, studentId),
      Subtopic.countDocuments({ programId: program._id, status: "published" }),
      SubtopicProgress.countDocuments({
        programId: program._id,
        studentId,
        state: "completed",
      }),
      attendanceByStudent(programSlug, [new Types.ObjectId(studentId)]),
    ]);

  const assignments = (curriculum?.courses ?? []).flatMap((course) =>
    course.assignments.map((assignment) => ({
      id: assignment.id,
      title: assignment.title,
      courseTitle: course.title,
      dueDate: assignment.dueDate,
      maxMarks: assignment.maxMarks,
      submission: assignment.submission
        ? {
            fileUrl: assignment.submission.fileUrl,
            // The uploaded name when there is one; the bare link otherwise,
            // because a Drive URL is all a pasted hand-in has to show.
            fileName:
              assignment.submission.file?.name ?? assignment.submission.fileUrl,
            format: assignment.submission.format,
            note: assignment.submission.note,
            submittedAt: assignment.submission.submittedAt,
            status: assignment.submission.status,
            version: assignment.submission.version,
            scored: assignment.submission.scored,
            feedback: assignment.submission.feedback,
          }
        : null,
    })),
  );

  const marked = attendance.get(studentId);

  return {
    program: { slug: program.slug, title: program.title },
    student: {
      id: String(person._id),
      name: person.name,
      email: person.email,
      phone: person.phone ?? "",
      suspended: person.status === "suspended",
    },
    enrollment: {
      status: enrollment.status as EnrollmentStatus,
      batch: enrollment.batch ?? "",
      enrolledAt: enrollment.enrolledAt.toISOString(),
      completedAt: enrollment.completedAt
        ? enrollment.completedAt.toISOString()
        : null,
    },
    marksheet,
    progress: {
      done,
      total: subtopicsTotal,
      percent:
        subtopicsTotal === 0 ? 0 : Math.round((done / subtopicsTotal) * 100),
    },
    assignments,
    attendance: {
      present: marked?.present ?? 0,
      absent: marked ? marked.total - marked.present : 0,
      percent:
        marked && marked.total > 0
          ? Math.round((marked.present / marked.total) * 100)
          : null,
    },
  };
}

/* --------------------------------- helpers -------------------------------- */

/** One grouped count per student, for whatever collection is asked. */
async function countByStudent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: { aggregate: (pipeline: any[]) => Promise<any[]> },
  match: Record<string, unknown>,
): Promise<Map<string, number>> {
  const rows = await model.aggregate([
    { $match: match },
    { $group: { _id: "$studentId", n: { $sum: 1 } } },
  ]);

  return new Map(
    rows.map((row: { _id: Types.ObjectId; n: number }) => [
      String(row._id),
      row.n,
    ]),
  );
}

/**
 * Attendance per student, over this program's sessions.
 *
 * `total` counts **marked** rows only, never scheduled sessions: an unmarked
 * session is excluded rather than counted as an absence, which is the same rule
 * the student's own attendance band follows. A staff screen quietly using a
 * stricter definition would show a manager a worse number than the student
 * sees, over the same sessions.
 */
async function attendanceByStudent(
  programSlug: string,
  studentIds: Types.ObjectId[],
): Promise<Map<string, { present: number; total: number }>> {
  if (studentIds.length === 0) return new Map();

  const sessions = await LiveSession.find({
    programSlug,
    status: { $ne: "cancelled" },
  })
    .select("_id")
    .lean();

  if (sessions.length === 0) return new Map();

  const rows = await Attendance.aggregate<{
    _id: Types.ObjectId;
    present: number;
    total: number;
  }>([
    {
      $match: {
        sessionId: { $in: sessions.map((row) => row._id) },
        studentId: { $in: studentIds },
      },
    },
    {
      $group: {
        _id: "$studentId",
        present: {
          $sum: { $cond: [{ $eq: ["$state", "present"] }, 1, 0] },
        },
        total: { $sum: 1 },
      },
    },
  ]);

  return new Map(
    rows.map((row) => [
      String(row._id),
      { present: row.present, total: row.total },
    ]),
  );
}

/**
 * When each student last did anything here.
 *
 * Three collections, because "active" means any of them: watched something,
 * sat a paper, handed work in. The max of the three is the only honest answer —
 * reading progress alone would call a student inactive the week they sat their
 * mid-term.
 */
async function lastActiveByStudent(
  programId: Types.ObjectId,
  studentIds: Types.ObjectId[],
): Promise<Map<string, Date>> {
  if (studentIds.length === 0) return new Map();

  const match = { programId, studentId: { $in: studentIds } };

  const [progress, attempts, submissions] = await Promise.all([
    SubtopicProgress.aggregate<{ _id: Types.ObjectId; at: Date }>([
      { $match: match },
      { $group: { _id: "$studentId", at: { $max: "$updatedAt" } } },
    ]),
    Attempt.aggregate<{ _id: Types.ObjectId; at: Date }>([
      { $match: match },
      { $group: { _id: "$studentId", at: { $max: "$startedAt" } } },
    ]),
    Submission.aggregate<{ _id: Types.ObjectId; at: Date }>([
      { $match: match },
      { $group: { _id: "$studentId", at: { $max: "$submittedAt" } } },
    ]),
  ]);

  const latest = new Map<string, Date>();

  for (const row of [...progress, ...attempts, ...submissions]) {
    if (!row.at) continue;
    const key = String(row._id);
    const current = latest.get(key);
    if (!current || row.at > current) latest.set(key, row.at);
  }

  return latest;
}
