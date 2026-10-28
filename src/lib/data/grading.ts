import "server-only";

/**
 * The teacher's grading queue: hand-ins waiting for a mark.
 *
 * This is the read half of the one loop in the app that was built at both ends
 * and never joined in the middle. The `Submission` model has carried
 * `scored`, `feedback`, `evaluatedBy` and `evaluatedAt` since it was written,
 * along with the index this file reads — `{ courseId, status, submittedAt }`,
 * commented "the teacher's grading queue" — and `validateGrade` has sat unused
 * in `validation/curriculum.ts`. Nothing wrote any of it. Every hand-in read
 * "Awaiting marking" forever, and because `courseMaximum` counts an
 * assignment's marks in the aggregate denominator whether or not it has been
 * marked, an unmarked hand-in quietly held the whole programme's aggregate
 * down. See `marksheet-db.ts`.
 *
 * ## Scope is a cohort, not a program
 *
 * The same rule `students.ts` follows, and for the same reason: a teacher is
 * assigned to **batches** of a program, so a grading queue that showed every
 * cohort's work would hand one teacher another's students. Two narrowings —
 * `ownsProgram` decides which programs, `batchScopeFor` decides which cohorts
 * inside one — and both are applied **in the query**, so a bug here shows a
 * teacher too little rather than somebody else's cohort.
 *
 * An admin gets `null` from the second and every program from the first, which
 * is why one function serves both areas rather than a teacher-shaped copy.
 *
 * ## Flat reads, joined in memory
 *
 * Submissions first, then one read each for the programs, courses, assignments
 * and students they point at. The alternative — populating four refs per row —
 * is four round trips per hand-in on a screen whose whole point is a long list.
 */
import { Types } from "mongoose";

import { batchScopeFor, type CurrentUser } from "@/lib/auth/guards";
import type { SubmissionFormat } from "@/lib/curriculum/submission-formats";
import type { SubmissionStatus } from "@/lib/curriculum/submission-status";
import type { SubmissionVersionView } from "@/lib/curriculum/types";
import { toVersionViews } from "@/lib/data/progress";
import { connectToDatabase } from "@/lib/db";
import { Assignment } from "@/models/Assignment";
import { Course } from "@/models/Course";
import { Enrollment } from "@/models/Enrollment";
import { Program } from "@/models/Program";
import { Submission } from "@/models/Submission";
import { User } from "@/models/User";

/** One hand-in, with everything the queue needs to render and mark it. */
export type GradingRow = {
  id: string;
  studentName: string;
  studentEmail: string;
  /** "" for a student on no cohort — only a program-wide holder sees those. */
  batch: string;
  programSlug: string;
  programTitle: string;
  courseTitle: string;
  assignmentTitle: string;
  /** Frozen onto the submission at hand-in, so a later edit cannot rescale it. */
  maxMarks: number;
  fileUrl: string;
  /** The uploaded name, or the bare link when they pasted one. */
  fileName: string;
  format: SubmissionFormat;
  note: string;
  submittedAt: string;
  status: SubmissionStatus;
  /** 1 for a first hand-in; each resubmission adds one. */
  version: number;
  scored: number | null;
  feedback: string;
  evaluatedAt: string | null;
  /** The open request, while the student has yet to hand in again. */
  resubmission: { reason: string; requestedAt: string } | null;
  /** Earlier versions, oldest first — what was sent back, and why. */
  history: SubmissionVersionView[];
};

/**
 * Which programs this person may grade in, and whose work inside each.
 *
 * `studentIds: null` means "no narrowing" — an admin, or a teacher who holds
 * the whole program rather than named cohorts. An empty array means the
 * opposite: they hold cohorts that currently contain nobody, and must therefore
 * see nothing rather than everything.
 */
type Slice = {
  programId: Types.ObjectId;
  slug: string;
  title: string;
  studentIds: Types.ObjectId[] | null;
};

async function slicesFor(user: CurrentUser): Promise<Slice[]> {
  await connectToDatabase();

  const slugs = user.assignments.map((item) => item.programSlug);

  // An admin holds no assignments and every program; anybody else holds only
  // what is listed against them, and an empty list is genuinely nothing.
  if (user.role !== "admin" && slugs.length === 0) return [];

  const programs = await Program.find(
    user.role === "admin" ? {} : { slug: { $in: slugs } },
    { slug: 1, title: 1 },
  ).lean();

  return Promise.all(
    programs.map(async (program) => {
      const scope = batchScopeFor(user, program.slug);

      if (scope === null) {
        return {
          programId: program._id,
          slug: program.slug,
          title: program.title,
          studentIds: null,
        };
      }

      const enrollments = await Enrollment.find(
        { programId: program._id, batch: { $in: scope } },
        { studentId: 1 },
      ).lean();

      return {
        programId: program._id,
        slug: program.slug,
        title: program.title,
        studentIds: enrollments.map((row) => row.studentId),
      };
    }),
  );
}

/** The `$or` that expresses those slices as one query. Null when there are none. */
function matchFor(slices: Slice[]): Record<string, unknown> | null {
  const clauses = slices
    // A slice narrowed to nobody matches nothing; including it as
    // `{ $in: [] }` would be correct but pointless, and dropping it keeps the
    // query readable when a teacher holds one live cohort out of five.
    .filter((slice) => slice.studentIds === null || slice.studentIds.length > 0)
    .map((slice) =>
      slice.studentIds === null
        ? { programId: slice.programId }
        : { programId: slice.programId, studentId: { $in: slice.studentIds } },
    );

  return clauses.length === 0 ? null : { $or: clauses };
}

/**
 * How much work is waiting — the number on the teacher's overview.
 *
 * A `countDocuments` rather than `queue().length`: the tile needs a number, and
 * loading every hand-in to count them is the shape that stops working at the
 * exact moment the number gets interesting.
 */
export async function pendingGradingCount(user: CurrentUser): Promise<number> {
  const match = matchFor(await slicesFor(user));
  if (!match) return 0;

  return Submission.countDocuments({ ...match, status: "submitted" });
}

/**
 * The queue itself.
 *
 * Unmarked first and oldest-first within that, because a grading queue is a
 * queue: the hand-in that has been waiting longest is the one that should be
 * looked at next. Marked work stays reachable behind `includeMarked` so a
 * teacher can correct a mark they have just given without hunting for the
 * student — but it sorts after, and by when it was marked.
 */
export async function gradingQueue(
  user: CurrentUser,
  options: { includeMarked?: boolean; limit?: number } = {},
): Promise<GradingRow[]> {
  const slices = await slicesFor(user);
  const match = matchFor(slices);
  if (!match) return [];

  const programById = new Map(
    slices.map((slice) => [String(slice.programId), slice]),
  );

  const rows = await Submission.find({
    ...match,
    ...(options.includeMarked ? {} : { status: "submitted" }),
  })
    .sort({ status: 1, submittedAt: 1 })
    .limit(options.limit ?? 200)
    .lean();

  if (rows.length === 0) return [];

  const [courses, assignments, students] = await Promise.all([
    Course.find({ _id: { $in: rows.map((row) => row.courseId) } }, { title: 1 })
      .lean(),
    Assignment.find(
      { _id: { $in: rows.map((row) => row.assignmentId) } },
      { title: 1 },
    ).lean(),
    User.find({ _id: { $in: rows.map((row) => row.studentId) } })
      .select("name email")
      .lean(),
  ]);

  // The cohort each student sits with, for the label on the row. Read from the
  // enrolment rather than carried on the submission: a student moved between
  // batches should appear under the one they are in now.
  const enrollments = await Enrollment.find(
    {
      programId: { $in: rows.map((row) => row.programId) },
      studentId: { $in: rows.map((row) => row.studentId) },
    },
    { programId: 1, studentId: 1, batch: 1 },
  ).lean();

  const courseTitle = titleIndex(courses);
  const assignmentTitle = titleIndex(assignments);
  const studentById = new Map(students.map((row) => [String(row._id), row]));
  const batchByPair = new Map(
    enrollments.map((row) => [
      `${String(row.programId)}:${String(row.studentId)}`,
      row.batch ?? "",
    ]),
  );

  return rows.flatMap((row) => {
    const student = studentById.get(String(row.studentId));
    const program = programById.get(String(row.programId));
    // A hand-in whose student or program has gone is a broken row, not work.
    // Skipped rather than rendered as a card nobody can act on.
    if (!student || !program) return [];

    return [
      {
        id: String(row._id),
        studentName: student.name,
        studentEmail: student.email,
        batch:
          batchByPair.get(`${String(row.programId)}:${String(row.studentId)}`) ??
          "",
        programSlug: program.slug,
        programTitle: program.title,
        courseTitle: courseTitle.get(String(row.courseId)) ?? "Course",
        assignmentTitle:
          assignmentTitle.get(String(row.assignmentId)) ?? "Assignment",
        maxMarks: row.maxMarks,
        fileUrl: row.fileUrl,
        fileName: row.file?.name ?? row.fileUrl,
        format: row.format as SubmissionFormat,
        note: row.note ?? "",
        submittedAt: row.submittedAt.toISOString(),
        status: row.status as SubmissionStatus,
        version: row.version ?? 1,
        scored: row.scored ?? null,
        feedback: row.feedback ?? "",
        evaluatedAt: row.evaluatedAt ? row.evaluatedAt.toISOString() : null,
        resubmission:
          row.status === "resubmission_requested" && row.resubmission
            ? {
                reason: row.resubmission.reason ?? "",
                requestedAt: row.resubmission.requestedAt.toISOString(),
              }
            : null,
        history: toVersionViews(row.history),
      },
    ];
  });
}

function titleIndex(
  rows: { _id: Types.ObjectId; title: string }[],
): Map<string, string> {
  return new Map(rows.map((row) => [String(row._id), row.title]));
}
