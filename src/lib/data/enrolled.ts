import "server-only";

import { Types } from "mongoose";

import { entryHref } from "@/lib/curriculum/links";
import { moduleSubtopics } from "@/lib/curriculum/status";
import type { ProgramCurriculum } from "@/lib/curriculum/types";
import { connectToDatabase } from "@/lib/db";
import { Enrollment } from "@/models/Enrollment";
import { Program } from "@/models/Program";

import { formatPaise } from "@/lib/payments/money";

import { batchDeadlines } from "./batches";
import { getProgramCurriculum } from "./curriculum-db";
import { getFeeStatus } from "./fees";

/**
 * What this student is actually enrolled in.
 *
 * Replaces the `ENROLLMENTS` array in `data/dashboard.ts`, which was a
 * hard-coded pair of programs every student saw. Now that staff screens read
 * real enrolment rows, the dashboard has to read the same ones — two
 * definitions of "enrolled" is how a manager ends up looking at a roster the
 * student's own dashboard disagrees with.
 *
 * Its own module rather than a function in `data/dashboard.ts` for the reason
 * that file's header already gives: it is reachable from a client component
 * (through `data/sessions.ts`), and one `server-only` import anywhere in that
 * chain breaks the browser bundle. The pure helpers stay there; anything that
 * reads the database lives here.
 *
 * Every number is **derived from the tree**, exactly as the curriculum page and
 * the marksheet derive theirs — nothing about progress is stored on the
 * enrolment. A row records that somebody is on a program and nothing about how
 * they are doing, so it can never contradict the screens that count.
 */

export type EnrolledProgram = {
  slug: string;
  title: string;
  summary: string;
  /**
   * What the *student* is told. Not the enrolment's own status: "active" is a
   * fact about the record, "in progress" is a fact about them.
   */
  status: "in-progress" | "completed";
  batch: string;
  /**
   * When *this student's batch* ends, ISO. Null when they have no batch or it
   * has no end date — never the program-wide `Program.deadline`, which is a
   * different (and for a given student, usually wrong) date.
   */
  deadline: string | null;
  lessonsDone: number;
  lessonsTotal: number;
  percent: number;
  /** Where "Resume" goes, and what it is. Null once everything is done. */
  nextLesson: {
    title: string;
    moduleNumber: number;
    minutes: number;
    href: string;
  } | null;
  /**
   * Whether this program is paid for, and what is left if not.
   *
   * Read from `data/fees.ts` rather than computed here — the card, the banner
   * above it and the gate behind it must all get the same answer from the same
   * place, or the dashboard invites a student into a course the gate then
   * throws them out of.
   *
   * `paid: true` also covers "no fee plan set", which is deliberate: an
   * enrolment made before fees existed opens as it always did. `data/fees.ts`
   * keeps the two apart for staff; a student has no use for the distinction.
   */
  fee: {
    paid: boolean;
    amountDue: number;
    /** Preformatted — "₹34,999" — so the card renders no money logic. */
    amountDueLabel: string;
  };
};

/**
 * The student's programs, in-progress first.
 *
 * Withdrawn enrolments are left out: a student who has been taken off a program
 * should not keep seeing it on their dashboard. Staff still see the row —
 * that asymmetry is deliberate, and it is why withdrawing is not deleting.
 */
export async function getEnrolledPrograms(
  studentId: string,
): Promise<EnrolledProgram[]> {
  await connectToDatabase();

  if (!Types.ObjectId.isValid(studentId)) return [];

  const enrollments = await Enrollment.find({
    studentId,
    status: { $ne: "withdrawn" },
  })
    .sort({ enrolledAt: 1 })
    .lean();

  if (enrollments.length === 0) return [];

  const programs = await Program.find({
    _id: { $in: enrollments.map((row) => row.programId) },
  })
    .select("_id slug title summary")
    .lean();

  const byId = new Map(programs.map((row) => [String(row._id), row]));

  /**
   * End dates come from the student's own batch, never from `Program.deadline`.
   *
   * The card used to print the program-wide deadline while the course's own
   * overview printed the cohort's — the same student was told two different
   * end dates one click apart. Two cohorts of one program finish on different
   * days, so the batch is the only one of the two that is true for *this*
   * student. Same rule as `studentBatchDeadline`, which the overview uses.
   */
  const deadlines = await batchDeadlines(
    enrollments
      .filter((row) => row.batch)
      .map((row) => ({
        programSlug: byId.get(String(row.programId))?.slug ?? "",
        name: row.batch!,
      }))
      .filter((pair) => pair.programSlug !== ""),
  );

  const built = await Promise.all(
    enrollments.map(async (enrollment) => {
      const program = byId.get(String(enrollment.programId));
      // An enrolment pointing at a program that is gone or unpublished is
      // skipped rather than rendered as a card that 404s when clicked.
      if (!program) return null;

      const curriculum = await getProgramCurriculum(program.slug, { studentId });
      if (!curriculum) return null;

      const percent = curriculum.totals.percent;
      const fees = await getFeeStatus(studentId, program.slug);

      return {
        slug: program.slug,
        title: program.title,
        summary: program.summary ?? "",
        // 100% reads as finished even before an admin marks the enrolment
        // completed — the student has done the work, and telling them
        // otherwise while paperwork catches up would be pedantry.
        status:
          enrollment.status === "completed" || percent === 100
            ? ("completed" as const)
            : ("in-progress" as const),
        batch: enrollment.batch ?? "",
        // Null when they have no batch, or it has no end date — the card drops
        // the line rather than inventing one.
        deadline: enrollment.batch
          ? (deadlines.get(`${program.slug}|${enrollment.batch}`) ?? null)
          : null,
        lessonsDone: curriculum.totals.done,
        lessonsTotal: curriculum.totals.total,
        percent,
        nextLesson: nextLessonOf(curriculum),
        // A missing status can only mean the enrolment vanished between the
        // two reads. Treat it as paid rather than locking somebody out over a
        // race — the gate reads the ledger again anyway, and it is the one
        // that decides.
        fee: {
          paid: fees?.isPaid ?? true,
          amountDue: fees?.amountDue ?? 0,
          amountDueLabel: formatPaise(fees?.amountDue ?? 0),
        },
      };
    }),
  );

  const rows = built.filter((row): row is EnrolledProgram => row !== null);

  return rows.sort(
    (a, b) =>
      (a.status === "completed" ? 1 : 0) - (b.status === "completed" ? 1 : 0),
  );
}

/** True when this student is on this program — the gate every student page wants. */
export async function isEnrolled(
  studentId: string,
  programSlug: string,
): Promise<boolean> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(studentId)) return false;

  const program = await Program.findOne({ slug: programSlug })
    .select("_id")
    .lean();
  if (!program) return false;

  return Boolean(
    await Enrollment.exists({
      studentId,
      programId: program._id,
      status: { $ne: "withdrawn" },
    }),
  );
}

/**
 * The first unfinished lesson, and enough about it to name on a card.
 *
 * Walks the tree in teaching order and stops at the first subtopic that is not
 * complete — the same definition `resumeHref` uses, so the card's words and its
 * button cannot point at different lessons.
 */
function nextLessonOf(
  curriculum: ProgramCurriculum,
): EnrolledProgram["nextLesson"] {
  for (const course of curriculum.courses) {
    if (course.locked) continue;

    for (const view of course.modules) {
      for (const subtopic of moduleSubtopics(view.topics)) {
        if (subtopic.status === "completed") continue;

        return {
          title: subtopic.title,
          moduleNumber: view.number,
          minutes: Math.max(1, Math.round(subtopic.seconds / 60)),
          href: entryHref(curriculum, course.id),
        };
      }
    }
  }

  return null;
}
