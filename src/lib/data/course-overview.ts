import "server-only";

import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { isDone, modulePercent, moduleSubtopics } from "@/lib/curriculum/status";
import type { ProgramCurriculum } from "@/lib/curriculum/types";
import { Enrollment } from "@/models/Enrollment";
import { Program } from "@/models/Program";

import { getProgramCurriculum } from "./curriculum-db";
import { getMarksheet, type Mark } from "./marksheet-db";
import { getCourseSessions } from "./sessions";

/**
 * Per-course overview data for /dashboard/[course]/overview.
 *
 * This was a static placeholder keyed off `COURSES` in `data/home.ts` with two
 * hand-written seeds. That meant the student's main screen only resolved for
 * the two demo slugs and 404'd for every program anyone actually created —
 * while their dashboard, curriculum, marksheet, tasks and lessons all worked,
 * because those had already moved to the database.
 *
 * It is now four reads and no stored numbers, which is the same rule the rest
 * of the curriculum follows (`lib/curriculum/status.ts`): a percentage is
 * computed from the published tree and this student's own rows, so nothing can
 * go stale and nothing can contradict the screen next to it. The marksheet and
 * this module quote the same score because they call the same function.
 */

export type Metric = {
  /** 0–100. */
  value: number;
  /** One line of encouragement or instruction under the label. */
  note: string;
  link?: { label: string; href: string };
};

export type CurrentPosition = {
  moduleNumber: number;
  moduleTitle: string;
  lessonTitle: string;
  /** Percent of this module completed. */
  modulePercent: number;
};

/**
 * The two figures the Continue card prints.
 *
 * `assignments`, not `project`: the static version showed a project mark, but
 * nothing in the schema produces one — `marksheet-db` builds `test` and
 * `assignment` per course and no project row exists. A cell labelled "Project"
 * that is permanently blank reads as a broken screen rather than as an honest
 * "not yet", so the card shows what the marksheet actually holds.
 * (`PROJECT_MAX` survives in `curriculum/rules.ts` for when projects are built.)
 */
export type Assessment = {
  finalTest: number | null;
  assignments: number | null;
};

/**
 * Placement sessions and aptitude training.
 *
 * There is no placement model, no collection and no `/placement` route: the
 * card is rendered disabled, the way the staff nav marks Enquiries and
 * Settings. Kept as a type so the shape is already here when it is built.
 */
export type PlacementSummary = {
  active: number;
  completed: number;
  locked: number;
};

export type CourseOverview = {
  /**
   * Only what the screen prints. The marketing record in `data/home.ts` carries
   * a tagline, a cover and a fee; the overview never read any of them, and
   * depending on it is what made this page unreachable for a real program.
   */
  course: { slug: string; title: string };
  isComplete: boolean;
  metrics: {
    progress: Metric;
    score: Metric;
    attendance: Metric;
  };
  current: CurrentPosition | null;
  assessment: Assessment;
};

function progressNote(percent: number): string {
  if (percent >= 100) return "Course complete. Well done.";
  if (percent >= 60) return "You're past the halfway mark. Keep going.";
  if (percent >= 20) return "Good pace — stay with it.";
  return "Just getting started.";
}

function attendanceNote(percent: number | null): string {
  if (percent === null) return "No sessions have been marked yet.";
  if (percent >= 90) return "Excellent attendance. Keep it up.";
  if (percent >= 75) return "Solid. Try not to miss the live clinics.";
  return "Attendance is low — recordings don't count towards it.";
}

/**
 * Where this student is, as a sentence the Continue card can print.
 *
 * The first module holding unfinished published material, and the first
 * unfinished lesson in it — the same "first thing not done" the resume link
 * uses, so the card and the button it sits above never disagree.
 *
 * Null once everything is finished, which is what makes the card switch from
 * "carry on" to "you are done".
 */
function positionIn(curriculum: ProgramCurriculum): CurrentPosition | null {
  for (const course of curriculum.courses) {
    if (course.locked) continue;

    for (const view of course.modules) {
      const subtopics = moduleSubtopics(view.topics);
      const next = subtopics.find((item) => !isDone(item.status));
      if (!next) continue;

      return {
        moduleNumber: view.number ?? 1,
        moduleTitle: view.title,
        lessonTitle: next.title,
        modulePercent: modulePercent(view.topics),
      };
    }
  }

  return null;
}

/** A percentage across every mark of one kind, or null if none was attempted. */
function percentOf(marks: Mark[]): number | null {
  const attempted = marks.filter((mark): mark is NonNullable<Mark> => mark !== null);
  if (attempted.length === 0) return null;

  const max = attempted.reduce((sum, mark) => sum + mark.max, 0);
  if (max === 0) return null;

  const scored = attempted.reduce((sum, mark) => sum + mark.scored, 0);
  return Math.round((scored / max) * 100);
}

/**
 * Returns null when there is no such program, or this student is not on it.
 * Both are one answer to the caller, which renders a 404 either way — "you may
 * not see this" would still confirm the program exists.
 */
export async function getCourseOverview(
  slug: string,
  studentId: string,
): Promise<CourseOverview | null> {
  if (!Types.ObjectId.isValid(studentId)) return null;

  const curriculum = await getProgramCurriculum(slug, { studentId });
  if (!curriculum) return null;

  await connectToDatabase();

  // The curriculum view carries the program's slug, not its id.
  const program = await Program.findOne({ slug }).select("_id").lean();
  if (!program) return null;

  const enrollment = await Enrollment.findOne({
    studentId,
    programId: program._id,
    status: { $ne: "withdrawn" },
  })
    .select("status")
    .lean();
  if (!enrollment) return null;

  // Read together: each is the same source its own screen uses, so the numbers
  // here cannot drift from the marksheet or the timetable.
  const [marksheet, sessions] = await Promise.all([
    getMarksheet(slug, studentId),
    getCourseSessions(slug, studentId),
  ]);

  const progress = curriculum.totals.percent;
  const score = marksheet?.current.percent ?? 0;

  // Null, not zero: nothing marked yet is a different fact from nobody present,
  // and `summarise` already keeps unmarked sessions out of the denominator.
  const attendance =
    sessions && sessions.attendance.byKind.length > 0
      ? sessions.attendance.percent
      : null;

  return {
    course: { slug: curriculum.program.slug, title: curriculum.program.title },
    isComplete: enrollment.status === "completed" || progress === 100,
    metrics: {
      progress: {
        value: progress,
        note: progressNote(progress),
        link: { label: "View details", href: `/dashboard/${slug}/course_details` },
      },
      score: {
        value: Math.round(score),
        note: "Attempt projects and assignments to improve your score.",
        link: { label: "View marksheet", href: `/dashboard/${slug}/marksheet` },
      },
      attendance: {
        value: attendance ?? 0,
        note: attendanceNote(attendance),
      },
    },
    current: positionIn(curriculum),
    assessment: {
      finalTest: percentOf((marksheet?.courses ?? []).map((row) => row.test)),
      assignments: percentOf(
        (marksheet?.courses ?? []).map((row) => row.assignment),
      ),
    },
  };
}
