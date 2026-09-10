/**
 * Where a tree row points, per staff area.
 *
 * The same course, module and subtopic screens are reachable from two places —
 * an admin browsing `/admin/programs` and a teacher in `/teacher/programs` —
 * and each has to stay inside its own area so the sidebar, the guard and the
 * back link all keep agreeing. Rather than duplicating the screens, the shared
 * components take one of these and build every link through it.
 *
 * Both are rooted at a **program**, because that is what staff are assigned to;
 * a course is something you reach by opening the program that contains it.
 *
 * A manager gets no builder at all: they may look at a program to see what
 * their cohort is working through, but content is not theirs to touch, so their
 * screen renders the tree without links into it.
 *
 * The two areas differ only in their base path, so there is one builder and two
 * one-line callers — a link added for the admin cannot go missing for teachers.
 */
export type CurriculumHrefs = {
  program: () => string;
  editProgram: () => string;

  newCourse: () => string;
  course: (courseKey: string) => string;
  editCourse: (courseKey: string) => string;

  newModule: (courseKey: string) => string;
  module: (courseKey: string, moduleKey: string) => string;
  editModule: (courseKey: string, moduleKey: string) => string;

  newTopic: (courseKey: string, moduleKey: string) => string;
  editTopic: (courseKey: string, moduleKey: string, topicKey: string) => string;

  newSubtopic: (
    courseKey: string,
    moduleKey: string,
    topicKey: string,
  ) => string;
  subtopic: (courseKey: string, subtopicKey: string) => string;
  editSubtopic: (courseKey: string, subtopicKey: string) => string;

  moduleTest: (courseKey: string, moduleKey: string) => string;
  finalTest: (courseKey: string) => string;
  /** The paper on a checkpoint course — the mid-term or the end-term. */
  termTest: (courseKey: string) => string;
  newAssignment: (courseKey: string) => string;
  assignment: (courseKey: string, assignmentKey: string) => string;
};

function build(base: string): CurriculumHrefs {
  // Not named `module`: that identifier is reserved in this bundler's scope.
  const moduleHref = (course: string, moduleKey: string) =>
    `${base}/courses/${course}/modules/${moduleKey}`;

  return {
    program: () => base,
    editProgram: () => `${base}/edit`,

    newCourse: () => `${base}/courses/new`,
    course: (course) => `${base}/courses/${course}`,
    editCourse: (course) => `${base}/courses/${course}/edit`,

    newModule: (course) => `${base}/courses/${course}/modules/new`,
    module: moduleHref,
    editModule: (course, moduleKey) => `${moduleHref(course, moduleKey)}/edit`,

    newTopic: (course, moduleKey) => `${moduleHref(course, moduleKey)}/topics/new`,
    editTopic: (course, moduleKey, topic) =>
      `${moduleHref(course, moduleKey)}/topics/${topic}/edit`,

    newSubtopic: (course, moduleKey, topic) =>
      `${moduleHref(course, moduleKey)}/topics/${topic}/subtopics/new`,
    subtopic: (course, subtopic) =>
      `${base}/courses/${course}/subtopics/${subtopic}`,
    editSubtopic: (course, subtopic) =>
      `${base}/courses/${course}/subtopics/${subtopic}/edit`,

    moduleTest: (course, moduleKey) => `${moduleHref(course, moduleKey)}/test`,
    finalTest: (course) => `${base}/courses/${course}/tests/final`,
    termTest: (course) => `${base}/courses/${course}/tests/term`,
    newAssignment: (course) => `${base}/courses/${course}/assignments/new`,
    assignment: (course, assignment) =>
      `${base}/courses/${course}/assignments/${assignment}`,
  };
}

export function adminHrefs(programSlug: string): CurriculumHrefs {
  return build(`/admin/programs/${programSlug}`);
}

export function teacherHrefs(programSlug: string): CurriculumHrefs {
  return build(`/teacher/programs/${programSlug}`);
}

/** Which set of links a screen is building. Posted with every write. */
export function areaFor(hrefs: CurriculumHrefs): "admin" | "teacher" {
  return hrefs.program().startsWith("/admin/") ? "admin" : "teacher";
}
