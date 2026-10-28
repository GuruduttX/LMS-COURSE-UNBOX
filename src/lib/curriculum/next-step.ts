/**
 * What "Next" means once the lessons run out.
 *
 * The learning screen's Prev/Next walk the subtopics of one course, and at the
 * last one Next simply went dead. That is wrong in the one place it matters
 * most: a course is not finished when its videos are, it is finished when the
 * assignment is handed in and the paper is sat, and a grey button says none of
 * that. A student who has watched everything sees a control that refuses to
 * move and no reason for it — the assignment is two screens away behind a ⋮
 * menu they have no reason to open.
 *
 * So the tail of a course is a chain of its own, in the order the work is
 * actually done:
 *
 *   module tests still to be sat → assignments still to hand in →
 *   the final test, until it is passed → the first lesson of the next course
 *
 * The order is not invented here. It is the same list `finalTestLockReason` and
 * `nextCourseLockReason` walk when they decide what is closed — this module
 * turns those refusals into a destination instead. Anything the gate would
 * block is returned with `href: null` and the gate's own sentence as the note,
 * so a step that cannot open still says what would open it.
 *
 * Pure and client-safe, like `status.ts` and `links.ts` either side of it.
 */
import {
  courseDetailsHref,
  entryHref,
  finalTestHref,
  moduleTestHref,
} from "./links";
import { FINAL_TEST_PASS_PERCENT } from "./rules";
import {
  assignmentSatisfied,
  finalTestPassed,
  moduleTestLockReason,
} from "./status";
import type { CourseView, LearnStep, ProgramCurriculum } from "./types";

/**
 * The step after the last lesson of `course`, or null at the very end of the
 * programme with nothing outstanding — where an inert Next is the honest answer.
 */
export function nextAfterLessons(
  curriculum: ProgramCurriculum,
  course: CourseView,
): LearnStep | null {
  const slug = curriculum.program.slug;

  /* A module test that has never been sat. Preferring one that is actually
     open matters: module 1's test can be locked behind lessons the student
     skipped while module 2's is sittable, and offering the locked one would
     stall them on the very screen this function exists to unstall. */
  const unsat = course.modules.filter((view) => view.test && !view.test.best);
  const view = unsat.find((item) => !moduleTestLockReason(item)) ?? unsat[0];

  if (view?.test) {
    const reason = moduleTestLockReason(view);
    return {
      href: reason ? null : moduleTestHref(slug, course.id, view.id),
      label: "Module test",
      title: view.test.title,
      note: reason ?? `${view.test.title} is still to be sat.`,
    };
  }

  /* An assignment still to hand in — the reported case. There is no assignment
     screen yet (see `AssignmentActions`), so this lands on the course details
     page, where the row and its Submit button are. When that screen exists
     this becomes `assignmentHref` and nothing else here changes. */
  const pending = course.assignments.find((item) => !assignmentSatisfied(item));
  if (pending) {
    return {
      href: courseDetailsHref(slug, course.id),
      label: "Assignment",
      title: pending.title,
      note: `Hand in ${pending.title} to finish this course.`,
    };
  }

  // A course with no final test authored gates nothing — same call as
  // `nextCourseLockReason`, and for the same reason: demanding a pass in a
  // paper that does not exist makes the programme impassable.
  if (course.finalTest && !finalTestPassed(course.finalTest)) {
    const reason = course.finalTestLocked ? course.finalTestLockedReason : null;
    const best = course.finalTest.best;

    // Naming the score they got is the difference between "sit the paper" and
    // "sit it again" — a student who has already been told to pass it once
    // needs to know the last attempt is what they are beating.
    const invite = best
      ? `You scored ${best.percent}% in ${course.finalTest.title} — ${FINAL_TEST_PASS_PERCENT}% finishes this course.`
      : `Pass ${course.finalTest.title} (${FINAL_TEST_PASS_PERCENT}%) to finish this course.`;

    return {
      href: reason ? null : finalTestHref(slug, course.id),
      label: "Final test",
      title: course.finalTest.title,
      note: reason ?? invite,
    };
  }

  const at = curriculum.courses.findIndex((item) => item.id === course.id);
  const following = at === -1 ? undefined : curriculum.courses[at + 1];
  if (!following) return null;

  const name =
    following.number !== null
      ? `Course ${following.number}: ${following.title}`
      : following.title;

  return {
    href: following.locked ? null : entryHref(curriculum, following.id),
    label: "Next course",
    title: name,
    note: following.locked ? following.lockedReason : name,
  };
}
