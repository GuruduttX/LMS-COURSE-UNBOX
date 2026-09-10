import "server-only";

import { Types } from "mongoose";

import { batchScopeFor, ownsBatch, type CurrentUser } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db";
import {
  isTaskSubmissionKind,
  type TaskSubmissionKind,
} from "@/lib/tasks/submission-kinds";
import type { UploadedFile } from "@/lib/uploads/kinds";
import { Batch } from "@/models/Batch";
import { Enrollment } from "@/models/Enrollment";
import { Program } from "@/models/Program";
import { Task, type TaskAudience } from "@/models/Task";
import { TaskSubmission } from "@/models/TaskSubmission";
import { User } from "@/models/User";

/**
 * Reading tasks, for whoever is asking.
 *
 * Two sides, one collection. Staff ask "what has been set on this program";
 * a student asks "what has been set for me". The second is the interesting one:
 *
 * ```
 * {
 *   programId: <this program>,
 *   $or: [ {audience:"program"}, {audience:"batch", batch: <mine>}, {studentId: me} ]
 * }
 * ```
 *
 * — which is why a task is stored as one row whatever its audience, rather than
 * fanned out per student. Membership is the live `Enrollment`, evaluated at read
 * time, so a student enrolled today sees the tasks their cohort already has, a
 * withdrawn one stops seeing any, and a student **moved between batches** picks
 * up their new cohort's tasks and drops the old one's. The alternative — a row
 * per recipient at write time — freezes all of that at the moment somebody
 * pressed a button.
 *
 * The staff side narrows the same way it always did by program, and now also by
 * cohort: a teacher assigned to two of a program's four batches sees the tasks
 * for those two, not their colleague's. `batchScopeFor` is the one place that
 * decides which, and `null` from it means "every cohort" — an admin, a manager,
 * or a teacher who holds the whole program.
 *
 * **The scope check lives here, not in the pages**, exactly as it does in
 * `data/students.ts`: every staff loader calls `assertScope`, so a screen added
 * later cannot forget it.
 */

export type TaskLinkView = { label: string; url: string };

export type TaskView = {
  id: string;
  title: string;
  description: string;
  document: UploadedFile | null;
  links: TaskLinkView[];
  audience: TaskAudience;
  /** Who it is for, in words: "Everyone on this program", a batch, a name. */
  audienceLabel: string;
  /** Set only on a batch task — the cohort's name. */
  batch: string;
  /** Set only on an individual task, for the staff list's filter and link. */
  studentId: string | null;
  /** What is expected back. `kinds` empty means nothing is. */
  submission: { kinds: TaskSubmissionKind[]; note: string };
  /** When staff closed it, or null. The only thing that means "done". */
  completedAt: string | null;
  createdByName: string;
  createdAt: string;
  /** The program it is on — a task alone on a screen has to say where it lives. */
  programSlug: string;
  programTitle: string;
};

/**
 * A staff row: the task, plus how far along it is.
 *
 * The counts are the whole reason this is a separate type. They are what makes
 * a "mark complete" decision an informed one, and they cost one grouped count
 * across the whole list rather than a query per card.
 */
export type StaffTaskView = TaskView & {
  /** How many students it went to, from the live enrolment. */
  recipients: number;
  /** How many have handed in. Always 0 when nothing is asked for. */
  submitted: number;
};

/* -------------------------------- staff side ------------------------------ */

export type TaskProgramGroup = {
  slug: string;
  title: string;
  tasks: StaffTaskView[];
};

/**
 * Every program this staff member may set tasks on, with what has been set.
 *
 * Built from the assignment list rather than by fetching all programs and
 * filtering, the same way `programsWithStudents` is — a bug here shows too few
 * programs rather than leaking one.
 */
export async function tasksForStaff(
  user: CurrentUser,
): Promise<TaskProgramGroup[]> {
  await connectToDatabase();

  const filter =
    user.role === "admin"
      ? { status: { $ne: "archived" as const } }
      : {
          status: { $ne: "archived" as const },
          slug: { $in: user.assignments.map((item) => item.programSlug) },
        };

  const programs = await Program.find(filter)
    .select("_id slug title")
    .sort({ order: 1, title: 1 })
    .lean();

  if (programs.length === 0) return [];

  const all = await Task.find({ programId: { $in: programs.map((p) => p._id) } })
    .sort({ createdAt: -1 })
    .lean();

  // Cohort scope, on top of the program scope the query already applied. Done
  // here rather than in the query because it differs per program — a teacher
  // may hold every batch of one and two of another — and the row count is a
  // screenful either way.
  const slugOf = new Map(programs.map((p) => [String(p._id), p.slug]));
  const cohortOf = await batchByEnrolment(
    all.flatMap((row) =>
      row.audience === "student" && row.studentId
        ? [{ studentId: row.studentId, programId: row.programId }]
        : [],
    ),
  );

  const rows = all.filter((row) => {
    const slug = slugOf.get(String(row.programId));
    if (!slug) return false;

    if (batchScopeFor(user, slug) === null) return true;

    // A program-wide task is wider than any cohort they hold, so it is not
    // theirs to *change* — but it is work their own students have been set, so
    // hiding it would leave them answering questions about a task they cannot
    // see. It stays on the list; the actions refuse to touch it.
    if (row.audience === "program") return true;
    if (row.audience === "batch") return ownsBatch(user, slug, row.batch ?? "");

    return ownsBatch(
      user,
      slug,
      cohortOf.get(`${String(row.studentId)}::${String(row.programId)}`) ?? "",
    );
  });

  const names = await namesFor([
    ...rows.map((row) => row.createdBy),
    ...rows.flatMap((row) => (row.studentId ? [row.studentId] : [])),
  ]);

  const [submitted, cohorts] = await Promise.all([
    submissionCounts(rows.map((row) => row._id)),
    cohortSizes(programs.map((program) => program._id)),
  ]);

  return programs.map((program) => ({
    slug: program.slug,
    title: program.title,
    tasks: rows
      .filter((row) => String(row.programId) === String(program._id))
      .map((row) => ({
        ...toView(row, names, program),
        recipients: recipientCount(row, program._id, cohorts),
        submitted: submitted.get(String(row._id)) ?? 0,
      })),
  }));
}

/**
 * How many students a task reaches, from the live cohort sizes.
 *
 * Keyed `programId` for a program task and `programId::batch` for a cohort one,
 * which is why `cohortSizes` groups by the pair rather than counting twice.
 */
function recipientCount(
  row: { audience: string; batch?: string | null },
  programId: unknown,
  cohorts: Map<string, number>,
): number {
  if (row.audience === "student") return 1;
  if (row.audience === "batch") {
    return cohorts.get(`${String(programId)}::${row.batch ?? ""}`) ?? 0;
  }
  return cohorts.get(String(programId)) ?? 0;
}

/**
 * How many hand-ins each task has, in one grouped count for the whole screen.
 *
 * A count per card would be a query per row — thirty tasks, thirty round trips
 * — for a number that only ever decorates a list. `$group` gets all of them in
 * one, and tasks with no hand-ins are simply absent from the result, which is
 * why every read of the map defaults to zero.
 */
async function submissionCounts(
  taskIds: unknown[],
): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map();

  const rows = await TaskSubmission.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { taskId: { $in: taskIds } } },
    { $group: { _id: "$taskId", n: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [String(row._id), row.n]));
}

/**
 * How many students each task reaches, counted from the live enrolment for the
 * same reason the task is one row: a cohort frozen at write time would tell a
 * teacher "8 of 12" on a program that now has fifteen people.
 *
 * Two keys per program come out of one aggregation — `programId` for the
 * program-wide total and `programId::batch` for each cohort — because a screen
 * mixing both kinds of task needs both figures and neither is worth a second
 * round trip.
 */
async function cohortSizes(
  programIds: unknown[],
): Promise<Map<string, number>> {
  if (programIds.length === 0) return new Map();

  const rows = await Enrollment.aggregate<{
    _id: { programId: Types.ObjectId; batch: string | null };
    n: number;
  }>([
    {
      $match: {
        programId: { $in: programIds },
        status: { $ne: "withdrawn" },
      },
    },
    {
      $group: {
        _id: { programId: "$programId", batch: "$batch" },
        n: { $sum: 1 },
      },
    },
  ]);

  const sizes = new Map<string, number>();

  for (const row of rows) {
    const program = String(row._id.programId);
    const batch = row._id.batch ?? "";

    sizes.set(program, (sizes.get(program) ?? 0) + row.n);
    sizes.set(`${program}::${batch}`, row.n);
  }

  return sizes;
}

/**
 * Which cohort each of these students sits in, on the program named alongside
 * them — keyed `studentId::programId`, the pair an enrolment is unique on.
 *
 * One query for a screen's worth of individual tasks. Somebody on three
 * programs has three enrolments and three possible cohorts, so the student id
 * alone is not an answer.
 */
async function batchByEnrolment(
  pairs: { studentId: Types.ObjectId; programId: Types.ObjectId }[],
): Promise<Map<string, string>> {
  if (pairs.length === 0) return new Map();

  const rows = await Enrollment.find({
    $or: pairs.map(({ studentId, programId }) => ({ studentId, programId })),
  })
    .select("studentId programId batch")
    .lean();

  return new Map(
    rows.map((row) => [
      `${String(row.studentId)}::${String(row.programId)}`,
      row.batch ?? "",
    ]),
  );
}

/* --------------------------- one task, for staff -------------------------- */

/** A hand-in as staff read it: who, what, and when. */
export type TaskSubmissionView = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  kind: TaskSubmissionKind;
  url: string;
  file: UploadedFile | null;
  note: string;
  submittedAt: string;
};

export type StaffTaskDetail = StaffTaskView & {
  submissions: TaskSubmissionView[];
  /**
   * Everyone the task went to who has **not** handed in. Named rather than
   * counted: "four outstanding" is a number to act on only once you know which
   * four, and the chase is the whole point of the screen.
   */
  outstanding: { id: string; name: string; email: string }[];
};

/**
 * One task in full, with its hand-ins — the individual task screen.
 *
 * Returns null for "no such task" **and** for one on a program this member of
 * staff does not hold, which the page turns into a 404: a task on someone
 * else's program should be indistinguishable from one that does not exist. That
 * is this function's job rather than the page's, exactly as it is in
 * `tasksForStaff`, so a screen added later cannot forget the check.
 */
export async function getStaffTask(
  user: CurrentUser,
  taskId: string,
): Promise<StaffTaskDetail | null> {
  await connectToDatabase();

  if (!Types.ObjectId.isValid(taskId)) return null;

  const task = await Task.findById(taskId).lean();
  if (!task) return null;

  const program = await Program.findById(task.programId)
    .select("_id slug title")
    .lean();
  if (!program) return null;

  if (
    user.role !== "admin" &&
    !user.assignments.some((item) => item.programSlug === program.slug)
  ) {
    return null;
  }

  // The cohort, on the same terms as the list: a program-wide task is visible
  // to everyone teaching the program (it was set for their students too), a
  // narrower one only to whoever holds that cohort. Null rather than a refusal,
  // which the page turns into a 404 — another teacher's task should read as a
  // task that does not exist.
  if (
    batchScopeFor(user, program.slug) !== null &&
    task.audience !== "program"
  ) {
    const batch =
      task.audience === "batch"
        ? task.batch ?? ""
        : (
            await batchByEnrolment(
              task.studentId
                ? [{ studentId: task.studentId, programId: task.programId }]
                : [],
            )
          ).get(`${String(task.studentId)}::${String(task.programId)}`) ?? "";

    if (!ownsBatch(user, program.slug, batch)) return null;
  }

  const [rows, roster] = await Promise.all([
    TaskSubmission.find({ taskId: task._id }).sort({ submittedAt: -1 }).lean(),
    recipientsOf(
      task.programId,
      task.audience as TaskAudience,
      task.batch ?? "",
      task.studentId,
    ),
  ]);

  const names = await namesFor([
    task.createdBy,
    ...(task.studentId ? [task.studentId] : []),
  ]);

  const byId = new Map(roster.map((person) => [person.id, person]));
  const handedIn = new Set(rows.map((row) => String(row.studentId)));

  return {
    ...toView(task, names, program),
    recipients: roster.length,
    submitted: rows.length,
    submissions: rows.map((row) => {
      const person = byId.get(String(row.studentId));
      return {
        id: String(row._id),
        studentId: String(row.studentId),
        // A student since withdrawn keeps their hand-in on the screen; dropping
        // it would quietly rewrite what a teacher already received.
        studentName: person?.name ?? "A former student",
        studentEmail: person?.email ?? "",
        kind: row.kind as TaskSubmissionKind,
        url: row.url,
        file: (row.file as UploadedFile | null) ?? null,
        note: row.note ?? "",
        submittedAt: row.submittedAt.toISOString(),
      };
    }),
    outstanding: roster.filter((person) => !handedIn.has(person.id)),
  };
}

/**
 * Who a task went to: everyone on the program, everyone in one cohort, or the
 * one student named on it — read from the live enrolment, never from the task.
 */
async function recipientsOf(
  programId: Types.ObjectId,
  audience: TaskAudience,
  batch: string,
  studentId: Types.ObjectId | null | undefined,
): Promise<{ id: string; name: string; email: string }[]> {
  const ids: Types.ObjectId[] =
    audience === "student"
      ? studentId
        ? [studentId]
        : []
      : (
          await Enrollment.find({
            programId,
            status: { $ne: "withdrawn" },
            ...(audience === "batch" ? { batch } : {}),
          })
            .select("studentId")
            .lean()
        ).map((row) => row.studentId);

  if (ids.length === 0) return [];

  const people = await User.find({ _id: { $in: ids } })
    .select("name email")
    .sort({ name: 1 })
    .lean();

  return people.map((person) => ({
    id: String(person._id),
    name: person.name,
    email: person.email,
  }));
}

/** The programs, their cohorts and their rosters — the composer's pickers. */
export type TaskAudienceOptions = {
  slug: string;
  title: string;
  /** The cohorts this author may address on this program. */
  batches: string[];
  /**
   * True when they hold the whole program and may therefore set a task for
   * everyone on it. False for a teacher on some of its batches: their widest
   * audience is one cohort, and `createTask` refuses the wider one.
   */
  mayAddressProgram: boolean;
  students: { id: string; name: string; email: string }[];
}[];

/**
 * Who a task can be aimed at.
 *
 * Three queries in total, not three per program: the composer needs every
 * roster and cohort list at once because both change as the program picker
 * moves, and a per-program round trip would be a query per option in a
 * dropdown.
 *
 * **Scoped to the author's own cohorts**, so a teacher on two of four batches
 * is offered those two and the students in them. That is a convenience — the
 * action re-checks every one of these — but an offer the action would refuse is
 * a form that lies, so the two agree.
 *
 * Withdrawn enrolments are left out: setting a task for somebody taken off the
 * program is a mistake the picker should not offer.
 */
export async function taskAudienceOptions(
  user: CurrentUser,
): Promise<TaskAudienceOptions> {
  await connectToDatabase();

  const filter =
    user.role === "admin"
      ? { status: { $ne: "archived" as const } }
      : {
          status: { $ne: "archived" as const },
          slug: { $in: user.assignments.map((item) => item.programSlug) },
        };

  const programs = await Program.find(filter)
    .select("_id slug title")
    .sort({ order: 1, title: 1 })
    .lean();

  if (programs.length === 0) return [];

  const slugs = programs.map((program) => program.slug);

  const [enrollments, allBatches] = await Promise.all([
    Enrollment.find({
      programId: { $in: programs.map((p) => p._id) },
      status: { $ne: "withdrawn" },
    })
      .select("studentId programId batch")
      .lean(),
    Batch.find({ programSlug: { $in: slugs } })
      .select("programSlug name")
      .sort({ name: 1 })
      .lean(),
  ]);

  const people = await User.find({
    _id: { $in: enrollments.map((row) => row.studentId) },
    status: "active",
  })
    .select("name email")
    .sort({ name: 1 })
    .lean();

  const byId = new Map(people.map((person) => [String(person._id), person]));

  return programs.map((program) => {
    const scope = batchScopeFor(user, program.slug);

    return {
      slug: program.slug,
      title: program.title,
      batches: allBatches
        .filter((row) => row.programSlug === program.slug)
        .map((row) => row.name)
        .filter((name) => scope === null || scope.includes(name)),
      mayAddressProgram: scope === null,
      students: enrollments
        .filter((row) => String(row.programId) === String(program._id))
        .filter((row) => ownsBatch(user, program.slug, row.batch ?? ""))
        .flatMap((row) => {
          // A suspended account is skipped rather than offered: they cannot
          // sign in to read the task, and the picker should not pretend
          // otherwise.
          const person = byId.get(String(row.studentId));
          return person
            ? [{ id: String(person._id), name: person.name, email: person.email }]
            : [];
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

/* ------------------------------- student side ----------------------------- */

/** The student's own hand-in, as they see it on the task. */
export type MyTaskSubmission = {
  kind: TaskSubmissionKind;
  url: string;
  file: UploadedFile | null;
  note: string;
  submittedAt: string;
};

/**
 * A task on a student's screen, carrying whether *they* have done it.
 *
 * Note what this is not: the task's `completedAt`, which is staff's decision
 * about the task as a whole. On a cohort task the two say different things —
 * everyone's copy is "closed", but only this student's `mySubmission` says
 * whether they handed anything in — and collapsing them would tell a student
 * who submitted nothing that they were finished.
 */
export type StudentTaskView = TaskView & {
  mySubmission: MyTaskSubmission | null;
};

export type StudentTasks = {
  program: { slug: string; title: string };
  /** Set for this student by name. Shown first — it is addressed to them. */
  mine: StudentTaskView[];
  /** Set for the whole cohort. */
  everyone: StudentTaskView[];
};

/**
 * This student's tasks on one program.
 *
 * Returns null for "no such program *or* not enrolled" — the same contract
 * every other student loader has, which the page turns into a 404. A program a
 * student is not on should be indistinguishable from one that does not exist.
 */
export async function getStudentTasks(
  programSlug: string,
  studentId: string,
): Promise<StudentTasks | null> {
  await connectToDatabase();

  if (!Types.ObjectId.isValid(studentId)) return null;

  const program = await Program.findOne({ slug: programSlug })
    .select("_id slug title")
    .lean();
  if (!program) return null;

  const enrolled = await Enrollment.findOne({
    studentId,
    programId: program._id,
    status: { $ne: "withdrawn" },
  })
    .select("batch")
    .lean();
  if (!enrolled) return null;

  // Their cohort's tasks come from the enrolment, read now rather than frozen
  // at write time — which is what makes a student moved between batches pick up
  // their new cohort's tasks and drop the old one's, with nothing to migrate.
  const audiences: Record<string, unknown>[] = [
    { audience: "program" },
    { studentId },
  ];
  if (enrolled.batch) {
    audiences.push({ audience: "batch", batch: enrolled.batch });
  }

  const rows = await Task.find({ programId: program._id, $or: audiences })
    .sort({ createdAt: -1 })
    .lean();

  const names = await namesFor(rows.map((row) => row.createdBy));

  // One query for every hand-in this student has on this program's tasks,
  // rather than one per card — the list is short, but the shape is the same one
  // the staff screen needed and there is no reason for it to be worse here.
  const mine = await TaskSubmission.find({
    taskId: { $in: rows.map((row) => row._id) },
    studentId,
  }).lean();

  const byTask = new Map(
    mine.map((row) => [String(row.taskId), toMySubmission(row)]),
  );

  const views: StudentTaskView[] = rows.map((row) => ({
    ...toView(row, names, program),
    mySubmission: byTask.get(String(row._id)) ?? null,
  }));

  return {
    program: { slug: program.slug, title: program.title },
    mine: views.filter((task) => task.audience === "student"),
    // A cohort task sits with the program-wide ones rather than under "For
    // you": to the student they are the same thing — work set for a group they
    // are in — and a third heading would ask them to care about a staffing
    // arrangement that is none of their business.
    everyone: views.filter((task) => task.audience !== "student"),
  };
}

/**
 * One task as the student who has to do it sees it, or null.
 *
 * Null covers "no such task", "not on this program" and "this task was set for
 * a different student" without distinguishing them, which is what the page
 * turns into a 404 — the same contract as `getStudentTasks`. It reuses that
 * loader rather than writing a fourth copy of the `$or` audience query: the
 * list is small, and one query shape for "what may this student see" is the
 * thing that keeps a cohort task from leaking through a narrower one.
 */
export async function getStudentTask(
  programSlug: string,
  studentId: string,
  taskId: string,
): Promise<{ program: { slug: string; title: string }; task: StudentTaskView } | null> {
  const data = await getStudentTasks(programSlug, studentId);
  if (!data) return null;

  const task = [...data.mine, ...data.everyone].find((row) => row.id === taskId);
  return task ? { program: data.program, task } : null;
}

function toMySubmission(row: {
  kind: string;
  url: string;
  file?: UploadedFile | null;
  note?: string | null;
  submittedAt: Date;
}): MyTaskSubmission {
  return {
    kind: row.kind as TaskSubmissionKind,
    url: row.url,
    file: row.file ?? null,
    note: row.note ?? "",
    submittedAt: row.submittedAt.toISOString(),
  };
}

/** The newest few, for the overview card. Empty when there is nothing. */
export async function getRecentStudentTasks(
  programSlug: string,
  studentId: string,
  limit = 3,
): Promise<StudentTaskView[]> {
  const tasks = await getStudentTasks(programSlug, studentId);
  if (!tasks) return [];

  // Individual tasks first — a task addressed to one person is the one they
  // most need to see — then the cohort's, newest first within each.
  return [...tasks.mine, ...tasks.everyone].slice(0, limit);
}

/* --------------------------------- shared --------------------------------- */

/** One lookup for every name a list of tasks needs — author and recipient. */
async function namesFor(
  ids: (Types.ObjectId | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean).map((id) => String(id)))];
  if (unique.length === 0) return new Map();

  const people = await User.find({ _id: { $in: unique } })
    .select("name")
    .lean();

  return new Map(people.map((person) => [String(person._id), person.name]));
}

type TaskRow = {
  _id: unknown;
  audience: string;
  batch?: string | null;
  studentId?: unknown;
  title: string;
  description?: string | null;
  document?: UploadedFile | null;
  links?: { label: string; url: string }[] | null;
  submission?: { kinds?: string[] | null; note?: string | null } | null;
  completedAt?: Date | null;
  createdBy: unknown;
  createdAt: Date;
};

function toView(
  row: TaskRow,
  names: Map<string, string>,
  program: { slug: string; title: string },
): TaskView {
  const audience = row.audience as TaskAudience;
  const studentId = row.studentId ? String(row.studentId) : null;

  return {
    id: String(row._id),
    title: row.title,
    description: row.description ?? "",
    document: row.document ?? null,
    links: (row.links ?? []).map((link) => ({ label: link.label, url: link.url })),
    audience,
    audienceLabel:
      audience === "program"
        ? "Everyone on this program"
        : audience === "batch"
          ? // The bare name, because that is what staff call the cohort and
            // what the batch screens are titled with.
            row.batch || "A batch"
          : // A deleted account leaves the id readable but the name gone;
            // saying so is better than printing a blank where a person
            // should be.
            (studentId ? names.get(studentId) : null) ?? "A student",
    batch: row.batch ?? "",
    studentId,
    submission: {
      // Filtered through our own list rather than cast: a kind removed from the
      // code later would otherwise reach a picker that no longer renders it.
      kinds: (row.submission?.kinds ?? []).filter(isTaskSubmissionKind),
      note: row.submission?.note ?? "",
    },
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdByName: names.get(String(row.createdBy)) ?? "Staff",
    createdAt: row.createdAt.toISOString(),
    programSlug: program.slug,
    programTitle: program.title,
  };
}
