import "server-only";

import {
  ASSIGNMENT_MAX,
  MIN_AGGREGATE_PERCENT,
  MIN_TERM_PERCENT,
} from "@/lib/curriculum/rules";
import type {
  AssessmentView,
  CourseView,
  ProgramCurriculum,
} from "@/lib/curriculum/types";

import { getProgramCurriculum } from "./curriculum-db";

/**
 * The marksheet, from the database.
 *
 * ## One score, displayed twice
 *
 * This does not query anything itself. It takes the **same
 * `ProgramCurriculum`** the curriculum page renders — which already has this
 * student's best attempt at every paper and their submission for every
 * assignment joined in — and turns it into rows and totals. That is deliberate
 * and it is the whole design: a marksheet built from its own queries would
 * eventually disagree with the curriculum page about the same student's mark,
 * and the student would have no way to tell which screen was lying.
 *
 * The static `data/marksheet.ts` this replaces derived marks from percentages
 * seeded on a static tree. The shape of the output is deliberately close to it,
 * so the screens did not have to be rewritten alongside the data — with one
 * exception, below.
 *
 * ## What changed, and why
 *
 * **The project column is gone.** There is no `Project` model; the old sheet
 * carried a seeded percentage for one. Inventing a mark for work the system
 * cannot see is the fake-metric mistake this codebase avoids, so the column
 * went rather than being filled with an em dash forever. The same call was made
 * on the curriculum page's project card.
 *
 * **A maximum is what the paper is out of, not what was scored.** An unsat
 * final test still contributes `questions × marksPerQuestion` to the aggregate
 * maximum, because the aggregate is measured against the whole programme. The
 * *current* total counts only what has been attempted. Early on the first
 * flatters and the second warns, which is the honest picture — that has not
 * changed.
 *
 * **An unattempted mark is null, never zero.** A zero reads as a failed
 * attempt; `formatMark` prints an em dash instead.
 */

export type Mark = { scored: number; max: number } | null;

export type Total = { scored: number; max: number; percent: number };

export type CourseRow = {
  id: string;
  number: number;
  title: string;
  test: Mark;
  assignment: Mark;
};

export type AssessmentRow = {
  id: string;
  title: string;
  mark: Mark;
  /** Null when the paper exists but has not been sat. */
  sat: boolean;
};

export type ModuleRow = {
  id: string;
  title: string;
  assignment: Mark;
  test: Mark;
};

export type CourseModuleMarks = {
  id: string;
  number: number;
  title: string;
  rows: ModuleRow[];
};

export type Criterion = {
  id: string;
  label: string;
  /** Whether the student has satisfied it *so far*. */
  met: boolean;
};

export type Marksheet = {
  program: ProgramCurriculum["program"];
  criteria: { items: Criterion[]; deadline: string | null };
  /** Scored against what has actually been attempted. */
  current: Total;
  /** Scored against everything in the programme, attempted or not. */
  aggregate: Total;
  courses: CourseRow[];
  courseTotal: Total;
  assessments: AssessmentRow[];
  assessmentTotal: Total;
  modules: CourseModuleMarks[];
};

/** One decimal, like a real marksheet: 87.25 → 87.3, 90 → 90. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** What a paper is out of, whether or not anyone has sat it. */
function maximumOf(paper: AssessmentView | null): number {
  return paper ? paper.questionCount * paper.marksPerQuestion : 0;
}

/**
 * The mark for a paper: the best attempt, or null.
 *
 * `maxScore` comes off the attempt rather than the live paper, because an
 * attempt froze what it was out of. A teacher who has since added a question
 * cannot retroactively change what someone was marked against.
 */
function paperMark(paper: AssessmentView | null): Mark {
  if (!paper?.best) return null;
  return { scored: round(paper.best.scored), max: paper.best.maxScore };
}

function total(marks: Mark[]): Total {
  const scored = round(marks.reduce((sum, item) => sum + (item?.scored ?? 0), 0));
  const max = marks.reduce((sum, item) => sum + (item?.max ?? 0), 0);
  return { scored, max, percent: max === 0 ? 0 : Math.round((scored / max) * 100) };
}

/**
 * A course's assignments, pooled into one mark.
 *
 * Only *marked* hand-ins count. A submitted-but-unmarked assignment is not a
 * zero and not a full mark; it is a mark that does not exist yet, and pooling
 * it either way would move a number the student cannot explain.
 */
function assignmentMark(course: CourseView): Mark {
  const marked = course.assignments.filter(
    (assignment) => typeof assignment.submission?.scored === "number",
  );
  if (marked.length === 0) return null;

  return {
    scored: round(
      marked.reduce((sum, item) => sum + (item.submission?.scored ?? 0), 0),
    ),
    max: marked.reduce(
      (sum, item) => sum + (item.submission?.maxMarks ?? ASSIGNMENT_MAX),
      0,
    ),
  };
}

/** What a course is worth in total, whether or not the student attempted it. */
function courseMaximum(course: CourseView): number {
  const assignments = course.assignments.reduce(
    (sum, item) => sum + (item.maxMarks ?? ASSIGNMENT_MAX),
    0,
  );
  return maximumOf(course.finalTest) + assignments;
}

/** Returns null when the program doesn't exist or isn't published. */
export async function getMarksheet(
  slug: string,
  studentId: string,
): Promise<Marksheet | null> {
  const curriculum = await getProgramCurriculum(slug, { studentId });
  if (!curriculum) return null;

  const courses: CourseRow[] = [];
  const assessments: AssessmentRow[] = [];
  const modules: CourseModuleMarks[] = [];

  for (const course of curriculum.courses) {
    // A course with no number is a checkpoint — it *is* a paper, so it belongs
    // in the assessment table rather than the course one.
    if (course.number === null) {
      if (!course.termTest) continue;

      assessments.push({
        id: course.id,
        title: course.termTest.title,
        mark: paperMark(course.termTest),
        sat: Boolean(course.termTest.best),
      });
      continue;
    }

    courses.push({
      id: course.id,
      number: course.number,
      title: course.title,
      test: paperMark(course.finalTest),
      assignment: assignmentMark(course),
    });

    const rows: ModuleRow[] = course.modules.map((view) => ({
      id: view.id,
      title: `Module ${view.number}: ${view.title}`,
      // Assignments sit on the course, not the module, so a module row's
      // assignment column is always empty until that changes.
      assignment: null,
      test: paperMark(view.test),
    }));

    // The course's own assignments, listed under it so nothing is orphaned.
    for (const assignment of course.assignments) {
      const submission = assignment.submission;
      rows.push({
        id: assignment.id,
        title: assignment.title,
        assignment:
          typeof submission?.scored === "number"
            ? { scored: round(submission.scored), max: submission.maxMarks }
            : null,
        test: null,
      });
    }

    modules.push({
      id: course.id,
      number: course.number,
      title: course.title,
      rows,
    });
  }

  const courseMarks = courses.flatMap((row) => [row.test, row.assignment]);
  const assessmentMarks = assessments.map((row) => row.mark);

  const current = total([...courseMarks, ...assessmentMarks]);

  const aggregateMax = curriculum.courses.reduce(
    (sum, course) =>
      sum +
      (course.number === null
        ? maximumOf(course.termTest)
        : courseMaximum(course)),
    0,
  );

  /**
   * The combined term rule, scored against **both papers in full** — not just
   * the one that has been sat. Half of a paper you have not turned up to is not
   * half a pass, and a criterion that ticked itself after one good mid-term
   * would be telling a student they had cleared a bar they had not reached.
   */
  const termMax = curriculum.courses.reduce(
    (sum, course) => sum + maximumOf(course.termTest),
    0,
  );
  const termScored = round(
    assessments.reduce((sum, row) => sum + (row.mark?.scored ?? 0), 0),
  );
  const termPercent = termMax === 0 ? 0 : Math.round((termScored / termMax) * 100);

  /**
   * "Mandatory work submitted" means every assignment that exists has been
   * handed in. Deliberately **handed in, not marked**: the same rule the course
   * gate uses (`ASSIGNMENT_GATE_REQUIRES_MARK`), because an unresponsive teacher
   * must not be able to hold a whole cohort short of graduating.
   */
  const submittedAll = curriculum.courses.every((course) =>
    course.assignments.every((assignment) => assignment.submission !== null),
  );

  const aggregatePercent =
    aggregateMax === 0 ? 0 : Math.round((current.scored / aggregateMax) * 100);

  return {
    program: curriculum.program,
    criteria: {
      deadline: curriculum.deadline,
      items: [
        {
          id: "aggregate",
          label: `Min. ${MIN_AGGREGATE_PERCENT}% aggregate marks`,
          met: aggregatePercent >= MIN_AGGREGATE_PERCENT,
        },
        {
          id: "submissions",
          label: "Submission of the mandatory assignments",
          met: submittedAll,
        },
        {
          id: "terms",
          label: `Min. ${MIN_TERM_PERCENT}% marks in the combined total of the mid-term and end-term assessments`,
          met: termPercent >= MIN_TERM_PERCENT,
        },
      ],
    },
    current,
    aggregate: {
      scored: current.scored,
      max: aggregateMax,
      percent: aggregatePercent,
    },
    courses,
    courseTotal: total(courseMarks),
    assessments,
    assessmentTotal: total(assessmentMarks),
    modules,
  };
}

/** "18 / 20", or an em dash when there is nothing to show. */
export function formatMark(value: Mark): string {
  return value === null ? "—" : `${value.scored} / ${value.max}`;
}
