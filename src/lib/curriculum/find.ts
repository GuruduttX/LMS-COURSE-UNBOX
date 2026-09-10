/**
 * Locating a node inside an already-loaded tree.
 *
 * The staff screens load a whole program in one go, so walking it in memory is
 * cheaper than a second query — and it guarantees the node they render is the
 * same one, in the same state, as the tree they came from. Pure.
 */
import type {
  AssignmentView,
  CourseView,
  ModuleView,
  ProgramCurriculum,
  SubtopicView,
  TopicView,
} from "./types";

export function findCourse(
  curriculum: ProgramCurriculum,
  courseKey: string,
): CourseView | null {
  return curriculum.courses.find((course) => course.id === courseKey) ?? null;
}

export function findModule(
  course: CourseView,
  moduleKey: string,
): ModuleView | null {
  return course.modules.find((module) => module.id === moduleKey) ?? null;
}

export function findAssignment(
  course: CourseView,
  assignmentKey: string,
): AssignmentView | null {
  return (
    course.assignments.find((assignment) => assignment.id === assignmentKey) ??
    null
  );
}

/** A subtopic anywhere in a course, with the module and topic holding it. */
export function findSubtopic(
  course: CourseView,
  subtopicKey: string,
): {
  subtopic: SubtopicView;
  topic: TopicView;
  module: ModuleView;
} | null {
  for (const view of course.modules) {
    for (const topic of view.topics) {
      const subtopic = topic.subtopics.find((item) => item.id === subtopicKey);
      if (subtopic) return { subtopic, topic, module: view };
    }
  }
  return null;
}
