/**
 * SUPERSEDED — nothing renders from this file any more.
 *
 * The marksheet is `data/marksheet-db.ts`, built from the database. This file
 * survives for exactly one reason: `scripts/migrate-curriculum.ts` imports
 * `MODULE_TESTS` from it to seed the module tests, and the static tree it reads
 * (`data/curriculum.ts`) is that script's input too. **Do not add a caller.**
 * Two marksheets is how a student ends up with two different totals.
 *
 * What it used to be, kept because the migration still reads the shape:
 *
 * ## Where the numbers come from
 *
 * Percentages already live on the curriculum tree (a course's final test, its
 * project, each assignment). This module turns them into marks out of a
 * maximum, so the marksheet and the curriculum page can never disagree about
 * how a student did — there is one score, displayed two ways.
 *
 * The maxima are the rules of the programme, not per-student data, so they live
 * here as constants:
 *
 * | Component            | Out of                |
 * |----------------------|-----------------------|
 * | Course final test    | questions × 5         |
 * | Course project       | 200                   |
 * | Assignment           | 100 each              |
 * | Mid/end-term         | questions × 20        |
 * | Module test          | questions × 5         |
 *
 * **Module tests are seeded here, not on the tree.** A mark is a submission,
 * not course content: in the real schema it belongs to the student, while
 * `CourseModule` describes the syllabus every student shares. Keeping them
 * apart here means the eventual split into a `Submission` collection doesn't
 * have to move anything.
 */
import {
  courseModules,
  getProgramCurriculum,
  type ProgramCourse,
} from "./curriculum";

type Program = NonNullable<ReturnType<typeof getProgramCurriculum>>["program"];

export type Mark = { scored: number; max: number } | null;

export type Total = { scored: number; max: number; percent: number };

export type CourseRow = {
  id: string;
  number: number;
  title: string;
  test: Mark;
  project: Mark;
  assignment: Mark;
};

export type AssessmentRow = { id: string; title: string; mark: Mark };

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
  program: Program;
  /** Graduation requirements, each evaluated against the marks below. */
  criteria: { items: Criterion[]; deadline: string };
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

/** The graduation bar, as programme rules. */
const MIN_AGGREGATE_PERCENT = 75;
const MIN_TERM_PERCENT = 50;

const PROJECT_MAX = 200;
const ASSIGNMENT_MAX = 100;
const TEST_MARK_PER_QUESTION = 5;
const TERM_MARK_PER_QUESTION = 20;

/** Module test results, by module id. A missing entry reads as "not attempted". */
/** Exported for `scripts/migrate-curriculum.ts`, which ports the shape (not the
 *  scores) into `Assessment` documents. */
export const MODULE_TESTS: Record<
  string,
  { score: number | null; questions: number }
> = {
  "pm-c1-m1": { score: 95, questions: 10 },
  "pm-c1-m2": { score: 88, questions: 10 },
  "pm-c2-m1": { score: 86, questions: 12 },
  "pm-c2-m2": { score: 81, questions: 12 },
  "pm-c3-m1": { score: 78, questions: 10 },
  "pm-c3-m2": { score: 80, questions: 10 },
  "pm-c4-m1": { score: 90, questions: 10 },
  "pm-c4-m2": { score: 84, questions: 10 },
  "pm-c4-m3": { score: null, questions: 12 },
  "pm-c5-m1": { score: null, questions: 10 },
  "pm-c5-m2": { score: null, questions: 10 },
  "ai-c1-m1": { score: 96, questions: 10 },
  "ai-c2-m1": { score: 92, questions: 12 },
};

/** One decimal, like a real marksheet: 87.25 → 87.3, 90 → 90. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** A percentage plus a maximum makes a mark; a null percentage makes none. */
function mark(percent: number | null | undefined, max: number): Mark {
  if (percent === null || percent === undefined) return null;
  return { scored: round((percent / 100) * max), max };
}

function total(marks: Mark[]): Total {
  const scored = round(marks.reduce((sum, item) => sum + (item?.scored ?? 0), 0));
  const max = marks.reduce((sum, item) => sum + (item?.max ?? 0), 0);
  return { scored, max, percent: max === 0 ? 0 : Math.round((scored / max) * 100) };
}

/** The assignments belonging to a course, pooled into one mark. */
function assignmentMark(course: ProgramCourse): Mark {
  const assignments = course.items.filter((item) => item.type === "assignment");
  if (assignments.length === 0) return null;

  const graded = assignments.filter((item) => typeof item.score === "number");
  if (graded.length === 0) return null;

  return {
    scored: round(
      graded.reduce((sum, item) => sum + ((item.score as number) / 100) * ASSIGNMENT_MAX, 0),
    ),
    max: graded.length * ASSIGNMENT_MAX,
  };
}

/** What a course is worth in total, whether or not the student attempted it. */
function courseMaximum(course: ProgramCourse): number {
  const test = course.finalTest
    ? course.finalTest.questions * TEST_MARK_PER_QUESTION
    : 0;
  const project = course.project ? PROJECT_MAX : 0;
  const assignments =
    course.items.filter((item) => item.type === "assignment").length * ASSIGNMENT_MAX;

  return test + project + assignments;
}

/** Returns null when the program doesn't exist or the student isn't enrolled. */
export function getMarksheet(slug: string): Marksheet | null {
  const curriculum = getProgramCurriculum(slug);
  if (!curriculum) return null;

  const courses: CourseRow[] = [];
  const assessments: AssessmentRow[] = [];
  const modules: CourseModuleMarks[] = [];

  for (const course of curriculum.courses) {
    // Courses without a number are the standalone checkpoints — they are a
    // single test, so they belong in the assessment table, not the course one.
    if (course.number === null) {
      const item = course.items[0];
      assessments.push({
        id: course.id,
        title: course.title,
        mark: mark(
          item?.score,
          (item?.questions ?? 0) * TERM_MARK_PER_QUESTION,
        ),
      });
      continue;
    }

    courses.push({
      id: course.id,
      number: course.number,
      title: course.title,
      test: mark(
        course.finalTest?.score,
        (course.finalTest?.questions ?? 0) * TEST_MARK_PER_QUESTION,
      ),
      project: course.project ? mark(course.project.score, PROJECT_MAX) : null,
      assignment: assignmentMark(course),
    });

    const rows: ModuleRow[] = courseModules(course).map((item) => {
      const test = MODULE_TESTS[item.id];
      return {
        id: item.id,
        title: `Module ${item.number}: ${item.title}`,
        // Assignments sit on the course, not the module, so a module row's
        // assignment column is always empty until that changes.
        assignment: null,
        test: test
          ? mark(test.score, test.questions * TEST_MARK_PER_QUESTION)
          : null,
      };
    });

    // The course's own assignments, listed under it so nothing is orphaned.
    for (const item of course.items) {
      if (item.type !== "assignment") continue;
      rows.push({
        id: item.id,
        title: item.title,
        assignment: mark(item.score, ASSIGNMENT_MAX),
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

  const courseMarks = courses.flatMap((row) => [row.test, row.project, row.assignment]);
  const assessmentMarks = assessments.map((row) => row.mark);
  const attempted = [...courseMarks, ...assessmentMarks];

  const current = total(attempted);
  const aggregateMax = curriculum.courses.reduce(
    (sum, course) =>
      sum +
      (course.number === null
        ? (course.items[0]?.questions ?? 0) * TERM_MARK_PER_QUESTION
        : courseMaximum(course)),
    0,
  );

  // Criterion 3 is scored against both term papers in full, not just the
  // attempted one — half of a paper you have not sat is not half a pass.
  const termMax = curriculum.courses
    .filter((course) => course.number === null)
    .reduce(
      (sum, course) => sum + (course.items[0]?.questions ?? 0) * TERM_MARK_PER_QUESTION,
      0,
    );
  const termPercent =
    termMax === 0 ? 0 : Math.round((assessmentScored(assessments) / termMax) * 100);

  // "Mandatory work submitted" means every assignment and project that exists
  // has a mark — an unmarked or unattempted one leaves the box unticked.
  const submittedAll = curriculum.courses.every((course) => {
    const assignments = course.items.filter((item) => item.type === "assignment");
    const assignmentsDone = assignments.every(
      (item) => typeof item.score === "number",
    );
    const projectDone =
      !course.project || typeof course.project.score === "number";
    return assignmentsDone && projectDone;
  });

  return {
    program: curriculum.program,
    criteria: {
      deadline: curriculum.deadline,
      items: [
        {
          id: "aggregate",
          label: `Min. ${MIN_AGGREGATE_PERCENT}% aggregate marks`,
          met: aggregatePercent(current.scored, aggregateMax) >= MIN_AGGREGATE_PERCENT,
        },
        {
          id: "submissions",
          label: "Submission of the mandatory projects and assignments",
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
      percent: aggregatePercent(current.scored, aggregateMax),
    },
    courses,
    courseTotal: total(courseMarks),
    assessments,
    assessmentTotal: total(assessmentMarks),
    modules,
  };
}

function aggregatePercent(scored: number, max: number): number {
  return max === 0 ? 0 : Math.round((scored / max) * 100);
}

function assessmentScored(rows: AssessmentRow[]): number {
  return round(rows.reduce((sum, row) => sum + (row.mark?.scored ?? 0), 0));
}

/** "18 / 20", or an em dash when there is nothing to show. */
export function formatMark(value: Mark): string {
  return value === null ? "—" : `${value.scored} / ${value.max}`;
}
