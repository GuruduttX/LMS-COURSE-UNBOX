/**
 * Everything countable, derived.
 *
 * The rule that survived the move to a database: a module's percentage, a
 * course's status, whether the next course is open — none of it is stored. It
 * is computed, here, from two things: the published tree, and this student's
 * progress rows. Seed data therefore cannot contradict itself, and there is no
 * cached total to go stale when a teacher adds a subtopic.
 *
 * What changed is the input. These used to read a `status` field sitting on the
 * shared syllabus; now a subtopic's status is resolved from `SubtopicProgress`
 * before it ever reaches here, so by the time these functions run, `status`
 * means "this student's status" and nothing else.
 *
 * Pure and client-safe — no database, no `server-only`.
 */
import {
  ASSIGNMENT_GATE_REQUIRES_MARK,
  FINAL_TEST_PASS_PERCENT,
} from "./rules";
import type {
  AssignmentView,
  AssessmentView,
  CourseItem,
  CourseView,
  ModuleView,
  Status,
  SubtopicView,
  TopicView,
} from "./types";

/**
 * `resubmission-requested` counts as done **for progress and gates**. The work
 * was handed in, and handing in is what opens the next course (see
 * `assignmentSatisfied`). A teacher asking for a revision should not re-lock a
 * course, or a term paper, that the student has already moved into. The row's
 * badge and icon still say plainly that there is work to redo.
 */
const DONE: ReadonlySet<Status> = new Set<Status>([
  "completed",
  "evaluated",
  "submitted",
  "resubmission-requested",
]);

export function isDone(status: Status): boolean {
  return DONE.has(status);
}

/* --------------------------- subtopics and modules ------------------------ */

export function moduleSubtopics(topics: TopicView[]): SubtopicView[] {
  return topics.flatMap((topic) => topic.subtopics);
}

export function moduleSeconds(topics: TopicView[]): number {
  return moduleSubtopics(topics).reduce(
    (sum, item) => sum + (item.kind === "video" ? item.seconds : 0),
    0,
  );
}

/**
 * Everything in a module a student has to get through: its lessons, **and its
 * test if it has one**.
 *
 * The test used to be left out, so a module whose lessons were watched read
 * 100% and "completed" while its paper had never been opened — and then the
 * final test refused to unlock, because `finalTestLockReason` was counting the
 * paper the percentage had quietly dropped. A number that says finished and a
 * gate that says not finished cannot both be right; the gate is the one that
 * decides whether the student can move on, so the number follows it.
 *
 * Sat, not passed — the same bar `finalTestLockReason` uses. A module test is
 * practice with a mark attached and has unlimited attempts (`maxAttemptsFor`);
 * requiring a score here would invent a gate that exists nowhere else.
 */
function moduleUnits(view: ModuleView): Status[] {
  const lessons = moduleSubtopics(view.topics).map((item) => item.status);
  return view.test ? [...lessons, testStatus(view.test)] : lessons;
}

/** A paper counts as one piece of work: done once it has been sat. */
function testStatus(test: AssessmentView): Status {
  return test.best ? "completed" : "not-started";
}

export function modulePercent(view: ModuleView): number {
  const all = moduleUnits(view);
  if (all.length === 0) return 0;
  return Math.round((all.filter(isDone).length / all.length) * 100);
}

/** A module has no stored status — it is whatever is inside it says it is. */
export function moduleStatus(view: ModuleView): Status {
  return rollUp(moduleUnits(view));
}

/** A topic holds lessons and nothing else, so it never counts a paper. */
export function topicStatus(topic: TopicView): Status {
  return rollUp(topic.subtopics.map((item) => item.status));
}

function rollUp(statuses: Status[]): Status {
  if (statuses.length === 0) return "not-started";
  if (statuses.every(isDone)) return "completed";
  if (statuses.every((status) => status === "locked")) return "locked";
  if (statuses.some((status) => status !== "not-started")) return "in-progress";
  return "not-started";
}

/* ---------------------------------- courses ------------------------------- */

export function coursePercent(course: CourseView): number {
  if (course.items.length === 0) return 0;
  const done = course.items.filter((item) => isDone(item.status)).length;
  return Math.round((done / course.items.length) * 100);
}

export function courseCounts(course: CourseView): {
  done: number;
  total: number;
  minutes: number;
} {
  return {
    done: course.items.filter((item) => isDone(item.status)).length,
    total: course.items.length,
    minutes: Math.round(
      course.modules.reduce((sum, view) => sum + moduleSeconds(view.topics), 0) /
        60,
    ),
  };
}

/** The course a student should land on: the first unfinished one. */
export function defaultCourseId(courses: CourseView[]): string {
  const next = courses.find((course) => coursePercent(course) < 100);
  return (next ?? courses[courses.length - 1])?.id ?? "";
}

/* ----------------------------------- gates -------------------------------- */

/** Handed in — which, by default, is all the gate asks of an assignment. */
export function assignmentSatisfied(assignment: AssignmentView): boolean {
  const submission = assignment.submission;
  if (!submission) return false;
  if (!ASSIGNMENT_GATE_REQUIRES_MARK) return true;
  return submission.status === "evaluated" && submission.scored !== null;
}

export function assignmentStatus(assignment: AssignmentView): Status {
  const submission = assignment.submission;
  if (!submission) return "not-started";
  if (submission.status === "resubmission_requested") {
    return "resubmission-requested";
  }
  return submission.status === "evaluated" ? "evaluated" : "submitted";
}

export function finalTestPassed(test: AssessmentView | null): boolean {
  return (test?.best?.percent ?? -1) >= FINAL_TEST_PASS_PERCENT;
}

/**
 * Why a student cannot yet sit this module's test, or null if they can.
 *
 * The module's own lessons, and nothing else. A module test is a check on the
 * material immediately behind it, so it asks the narrow version of what
 * `finalTestLockReason` asks of a whole course — and deliberately not the wide
 * one: waiting on another module's work would make the order modules are taken
 * in load-bearing, which the tree does not otherwise care about.
 *
 * Unlimited attempts (see `maxAttemptsFor`), because this is practice with a
 * mark attached rather than a gate: what it gates is the *final*, and the final
 * only asks that the test has been sat, not passed.
 */
export function moduleTestLockReason(view: ModuleView): string | null {
  const remaining = moduleSubtopics(view.topics).filter(
    (item) => !isDone(item.status),
  ).length;

  return remaining > 0
    ? `Finish the remaining ${plural(remaining, "lesson")} in this module first.`
    : null;
}

/**
 * Why a student cannot yet sit this course's final test, or null if they can.
 *
 * The final test is the *last* thing in a course, not a shortcut past it —
 * otherwise a student could skip every lecture and gamble on the paper.
 */
export function finalTestLockReason(
  modules: ModuleView[],
  assignments: AssignmentView[],
): string | null {
  const subtopics = modules.flatMap((view) => moduleSubtopics(view.topics));
  const remaining = subtopics.filter((sub) => !isDone(sub.status)).length;
  if (remaining > 0) {
    return `Finish the remaining ${plural(remaining, "lesson")} in this course first.`;
  }

  const unsat = modules.filter((view) => view.test && !view.test.best);
  if (unsat.length > 0) {
    return `Take the ${plural(unsat.length, "module test")} in this course first.`;
  }

  const pending = assignments.filter(
    (assignment) => !assignment.submission,
  ).length;
  if (pending > 0) {
    return `Hand in ${plural(pending, "assignment")} first.`;
  }

  return null;
}

/**
 * Why the *next* course is closed, given how this one went.
 *
 * Two conditions, and the message names whichever failed — "Locked" on its own
 * tells a student nothing they can act on.
 */
export function nextCourseLockReason(previous: CourseView): string | null {
  const pending = previous.assignments.filter(
    (assignment) => !assignmentSatisfied(assignment),
  ).length;

  if (pending > 0) {
    const label = ASSIGNMENT_GATE_REQUIRES_MARK ? "marked" : "handed in";
    const noun = plural(pending, "assignment");
    const where = previous.number ? `Course ${previous.number}` : previous.title;
    return `${noun} in ${where} still to be ${label}.`;
  }

  // A course whose final test hasn't been published yet cannot gate anything.
  // The alternative — demanding a pass in a paper that does not exist — makes
  // the whole program impassable, which is exactly what happens to a freshly
  // migrated database where no final test has been authored. A teacher who
  // forgets to publish one leaves that half of the gate open; a teacher who
  // cannot publish one leaves the program unfinishable. The first is recoverable.
  if (!previous.finalTest) return null;

  if (!finalTestPassed(previous.finalTest)) {
    const best = previous.finalTest.best;
    const where = previous.number ? `Course ${previous.number}` : previous.title;
    return best
      ? `Score ${FINAL_TEST_PASS_PERCENT}% in the ${where} final test to unlock — you scored ${best.percent}%.`
      : `Pass the ${where} final test (${FINAL_TEST_PASS_PERCENT}%) to unlock.`;
  }

  return null;
}

/**
 * Whether a checkpoint (a course with no number — mid-term, end-term) is open.
 * These sit between courses and need everything before them finished, rather
 * than one specific test passed.
 *
 * The message **names the courses**, rather than counting them. "Finish 1 course
 * before this checkpoint" told a student there was work outstanding but not
 * where, which on a locked card is the only question worth answering — and
 * `applyGates` reuses the first reason for every course after it, so that one
 * vague sentence was the explanation on every remaining card in the program.
 */
export function checkpointLockReason(preceding: CourseView[]): string | null {
  const unfinished = preceding.filter((course) => coursePercent(course) < 100);
  if (unfinished.length === 0) return null;

  return `Complete ${listOf(unfinished.map(courseName))} to unlock.`;
}

/** How a course is referred to in a sentence: by number, or by name if it has none. */
function courseName(course: CourseView): string {
  return course.number !== null ? `Course ${course.number}` : course.title;
}

/** "A", "A and B", "A, B and C" — never a trailing comma before "and". */
function listOf(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/* ---------------------------------- items --------------------------------- */

/** The status of one row of a course, whatever kind of row it is. */
export function itemStatus(item: CourseItem): Status {
  if (item.module) return moduleStatus(item.module);
  if (item.assignment) return assignmentStatus(item.assignment);
  return item.status;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
