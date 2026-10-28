/**
 * Every URL into the curriculum, built in one place.
 *
 * No component assembles one of these by hand — a route shape should be
 * changeable here and nowhere else.
 *
 * ## A note on the ones that pick a destination
 *
 * `entryHref` and `resumeHref` have to know how far a student has got, which the
 * plan expected to make them async database reads. They aren't: they take an
 * already-loaded `ProgramCurriculum` instead. Every caller is a page that has
 * just loaded the tree anyway, so this costs nothing, keeps the whole module
 * pure and client-safe, and avoids scattering awaits through components whose
 * only job is to render a link.
 */
import type { CourseView, ModuleView, ProgramCurriculum } from "./types";
import { isDone, moduleSubtopics } from "./status";

export function learnHref(
  programSlug: string,
  courseId: string,
  moduleId: string,
  subtopicId?: string,
): string {
  const base = `/learn/${programSlug}/${courseId}/${moduleId}`;
  return subtopicId ? `${base}?s=${subtopicId}` : base;
}

/**
 * The module's study material, open in the learning screen's right pane.
 *
 * A query flag on the module's own URL rather than a route of its own: the
 * material belongs to the module, and the screen around it — the outline, the
 * course header — is the same screen. `?v=material` also means a student who
 * strips it lands on the module rather than on a 404.
 *
 * It carries no `?s=`, so the screen falls back to the module's first subtopic
 * underneath — which is what the outline should be showing while the document
 * is open.
 */
export function materialHref(
  programSlug: string,
  courseId: string,
  moduleId: string,
): string {
  return `/learn/${programSlug}/${courseId}/${moduleId}?v=material`;
}

export function courseDetailsHref(
  programSlug: string,
  courseId?: string,
): string {
  const base = `/dashboard/${programSlug}/course_details`;
  return courseId ? `${base}?c=${courseId}` : base;
}

/**
 * The module test, which sits at the end of a module's subtopics.
 *
 * The same screen as the final test with `?m=` naming the module — there is one
 * runner and one cover page, and which paper they show is data. This used to
 * point at `/learn/…/test`, a route that was never built; nothing called it, so
 * nothing broke, and the one caller that did want it (`ItemRow`) had assembled
 * the URL by hand.
 */
export function moduleTestHref(
  programSlug: string,
  courseId: string,
  moduleId: string,
): string {
  return `${finalTestHref(programSlug, courseId)}?m=${encodeURIComponent(moduleId)}`;
}

/** The course final test — its own chrome-free area, outside the learn shell. */
export function finalTestHref(programSlug: string, courseId: string): string {
  return `/dashboard/${programSlug}/tests/${courseId}`;
}

export function assignmentHref(
  programSlug: string,
  assignmentId: string,
): string {
  return `/dashboard/${programSlug}/assignments/${assignmentId}`;
}

/** First subtopic of a module the student hasn't finished, else its first. */
export function moduleEntryHref(
  programSlug: string,
  courseId: string,
  module: ModuleView,
): string {
  const subtopics = moduleSubtopics(module.topics);
  const next =
    subtopics.find((sub) => !isDone(sub.status) && sub.status !== "locked") ??
    subtopics[0];
  return learnHref(programSlug, courseId, module.id, next?.id);
}

/** Where "Go to course" lands: the first unfinished subtopic in that course. */
export function entryHref(
  curriculum: ProgramCurriculum,
  courseId: string,
): string {
  const slug = curriculum.program.slug;
  const course = curriculum.courses.find((item) => item.id === courseId);
  if (!course) return courseDetailsHref(slug);

  // A locked course has no way in; send them to the panel that explains why.
  if (course.locked) return courseDetailsHref(slug, courseId);

  const active = course.modules.find((view) =>
    moduleSubtopics(view.topics).some(
      (sub) => !isDone(sub.status) && sub.status !== "locked",
    ),
  );

  const target = active ?? course.modules[0];
  return target
    ? moduleEntryHref(slug, courseId, target)
    : courseDetailsHref(slug, courseId);
}

/** First in-progress subtopic anywhere in the program — the "Resume" target. */
export function resumeHref(curriculum: ProgramCurriculum): string {
  const slug = curriculum.program.slug;

  for (const course of curriculum.courses) {
    if (course.locked) continue;
    for (const view of course.modules) {
      const next = moduleSubtopics(view.topics).find(
        (sub) => sub.status === "in-progress",
      );
      if (next) return learnHref(slug, course.id, view.id, next.id);
    }
  }

  // Nothing part-done: start the first course that isn't finished.
  const first = curriculum.courses.find(
    (course) => !course.locked && coursePercentOf(course) < 100,
  );
  return first ? entryHref(curriculum, first.id) : courseDetailsHref(slug);
}

/** Local to avoid a circular import back through status.ts's public surface. */
function coursePercentOf(course: CourseView): number {
  if (course.items.length === 0) return 0;
  const done = course.items.filter((item) => isDone(item.status)).length;
  return Math.round((done / course.items.length) * 100);
}
