/**
 * The create and edit screens, once each, for both staff areas.
 *
 * Ten routes under `/admin/programs/**` are mirrored under `/teacher/programs/**`,
 * and writing twenty screens would mean twenty chances for the two to drift.
 * Instead each route file is a guard plus one of these, and everything that
 * makes the screen — the breadcrumb, the heading, the seeded form, the
 * suggested key — is decided here.
 *
 * They are server components: they load the tree, find the node, and hand the
 * client form plain strings. The forms never receive a document.
 *
 * ## Where a suggested key comes from
 *
 * A new node's key is built from its parent's plus the count of siblings, which
 * is what makes `pm-c4-m3` readable. The count comes from the tree that was
 * loaded anyway, so it costs no query — and it is only a suggestion: the field
 * stays editable and the server enforces uniqueness.
 */
import { notFound } from "next/navigation";

import { PageHeading } from "@/components/staff/StatTile";
import { suggestKey } from "@/lib/curriculum/keys";
import { findSubtopic } from "@/lib/curriculum/find";
import type { SubtopicKind } from "@/lib/curriculum/kinds";
import {
  FINAL_TEST_PASS_PERCENT,
  MIN_TERM_PERCENT,
  TERM_MARK_PER_QUESTION,
  TEST_MARK_PER_QUESTION,
} from "@/lib/curriculum/rules";
import type { QuestionInput } from "@/lib/validation/curriculum";
import { isConfigured as videoUploadsConfigured } from "@/lib/video/bunny";
import {
  loadStaffCourse,
  loadStaffModule,
  loadStaffProgram,
  type StaffArea,
} from "@/lib/data/staff-program";
import {
  loadAssignment,
  loadFinalTest,
  loadModuleTest,
  loadTermTest,
  type AssessmentScope,
} from "@/lib/data/staff-work";

import { Breadcrumb, type Crumb } from "./Breadcrumb";
import { NodeBadge } from "./NodeBadge";
import { DeleteWorkButton } from "./NodeActions";
import { AssessmentForm } from "./forms/AssessmentForm";
import { AssignmentForm } from "./forms/AssignmentForm";
import { CourseForm } from "./forms/CourseForm";
import { NodeForm } from "./forms/NodeForm";
import { SubtopicForm } from "./forms/SubtopicForm";

/* --------------------------------- course -------------------------------- */

export async function CourseEditor({
  area,
  programSlug,
  courseKey,
  checkpoint = false,
}: {
  area: StaffArea;
  programSlug: string;
  /** Omitted when creating. */
  courseKey?: string;
  /** Creating a term exam rather than a numbered course. */
  checkpoint?: boolean;
}) {
  const { curriculum, hrefs } = await loadStaffProgram(area, programSlug);

  const course = courseKey
    ? curriculum.courses.find((row) => row.id === courseKey)
    : undefined;
  if (courseKey && !course) notFound();

  const crumbs: Crumb[] = [
    { label: curriculum.program.title, href: hrefs.program() },
    ...(course ? [{ label: course.title, href: hrefs.course(course.id) }] : []),
    { label: course ? "Edit" : checkpoint ? "New term exam" : "New course" },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb items={crumbs} />
      <PageHeading
        title={
          course
            ? `Edit ${course.title}`
            : checkpoint
              ? "New term exam"
              : "New course"
        }
        description={
          course
            ? "The modules and assignments inside it are edited from the course screen."
            : checkpoint
              ? "A mid-term or end-term. Create it here, then write its paper from the program screen."
              : "A course holds the modules, the assignments and the final test that gates the next one."
        }
      />
      <CourseForm
        mode={course ? "edit" : "create"}
        area={area}
        programSlug={programSlug}
        checkpoint={checkpoint}
        suggestedKey={suggestKey({
          parentKey: programSlug,
          // A checkpoint's key reads better as `pm-t1` than `pm-c6`: it is not
          // the sixth course, and the seeded ones are `pm-mid` / `pm-end`.
          prefix: checkpoint ? "t" : "c",
          index: checkpoint
            ? curriculum.courses.filter((row) => row.number === null).length
            : curriculum.courses.length,
        })}
        initial={
          course
            ? {
                key: course.id,
                number: course.number === null ? "" : String(course.number),
                title: course.title,
                summary: course.summary,
                completeBy: dateInput(course.completeBy),
                startMonth:
                  course.startMonth === null ? "" : String(course.startMonth),
                endMonth: course.endMonth === null ? "" : String(course.endMonth),
                status: course.nodeStatus,
              }
            : undefined
        }
        cancelHref={course ? hrefs.course(course.id) : hrefs.program()}
        context={[{ label: "Program", value: curriculum.program.title }]}
      />
    </div>
  );
}

/* --------------------------------- module -------------------------------- */

export async function ModuleEditor({
  area,
  programSlug,
  courseKey,
  moduleKey,
}: {
  area: StaffArea;
  programSlug: string;
  courseKey: string;
  moduleKey?: string;
}) {
  const { curriculum, course, hrefs } = await loadStaffCourse(
    area,
    programSlug,
    courseKey,
  );

  const view = moduleKey
    ? course.modules.find((row) => row.id === moduleKey)
    : undefined;
  if (moduleKey && !view) notFound();

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: curriculum.program.title, href: hrefs.program() },
          { label: course.title, href: hrefs.course(course.id) },
          ...(view
            ? [{ label: view.title, href: hrefs.module(course.id, view.id) }]
            : []),
          { label: view ? "Edit" : "New module" },
        ]}
      />
      <PageHeading
        title={view ? `Edit ${view.title}` : "New module"}
        description="A module groups the topics a student works through, and is what a module test is set on."
      />
      <NodeForm
        noun="module"
        mode={view ? "edit" : "create"}
        area={area}
        programSlug={programSlug}
        courseKey={course.id}
        suggestedKey={suggestKey({
          parentKey: course.id,
          prefix: "m",
          index: course.modules.length,
        })}
        initial={
          view
            ? { key: view.id, title: view.title, status: view.nodeStatus }
            : undefined
        }
        cancelHref={
          view ? hrefs.module(course.id, view.id) : hrefs.course(course.id)
        }
        context={[
          { label: "Program", value: curriculum.program.title },
          { label: "Course", value: course.title },
        ]}
      />
    </div>
  );
}

/* --------------------------------- topic --------------------------------- */

export async function TopicEditor({
  area,
  programSlug,
  courseKey,
  moduleKey,
  topicKey,
}: {
  area: StaffArea;
  programSlug: string;
  courseKey: string;
  moduleKey: string;
  topicKey?: string;
}) {
  const {
    curriculum,
    course,
    module: view,
    hrefs,
  } = await loadStaffModule(area, programSlug, courseKey, moduleKey);

  const topic = topicKey
    ? view.topics.find((row) => row.id === topicKey)
    : undefined;
  if (topicKey && !topic) notFound();

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: curriculum.program.title, href: hrefs.program() },
          { label: course.title, href: hrefs.course(course.id) },
          { label: view.title, href: hrefs.module(course.id, view.id) },
          { label: topic ? `Edit ${topic.title}` : "New topic" },
        ]}
      />
      <PageHeading
        title={topic ? `Edit ${topic.title}` : "New topic"}
        description="A topic is a heading inside the module. The videos, reading, PDFs and quizzes go under it."
      />
      <NodeForm
        noun="topic"
        mode={topic ? "edit" : "create"}
        area={area}
        programSlug={programSlug}
        courseKey={course.id}
        moduleKey={view.id}
        suggestedKey={suggestKey({
          parentKey: view.id,
          prefix: "t",
          index: view.topics.length,
        })}
        initial={
          topic
            ? { key: topic.id, title: topic.title, status: topic.nodeStatus }
            : undefined
        }
        cancelHref={hrefs.module(course.id, view.id)}
        context={[
          { label: "Program", value: curriculum.program.title },
          { label: "Course", value: course.title },
          { label: "Module", value: view.title },
        ]}
      />
    </div>
  );
}

/* -------------------------------- subtopic ------------------------------- */

export async function SubtopicEditor({
  area,
  programSlug,
  courseKey,
  moduleKey,
  topicKey,
  subtopicKey,
  defaultKind,
}: {
  area: StaffArea;
  programSlug: string;
  courseKey: string;
  /** Set when creating; on edit it is found from the subtopic. */
  moduleKey?: string;
  topicKey?: string;
  subtopicKey?: string;
  defaultKind?: string;
}) {
  const { curriculum, course, hrefs } = await loadStaffCourse(
    area,
    programSlug,
    courseKey,
  );

  // On edit the parents come from the tree rather than the URL, so a link that
  // names only the subtopic still resolves — and cannot name the wrong topic.
  const found = subtopicKey ? findSubtopic(course, subtopicKey) : null;
  if (subtopicKey && !found) notFound();

  const view = found
    ? found.module
    : course.modules.find((row) => row.id === moduleKey);
  const topic = found
    ? found.topic
    : view?.topics.find((row) => row.id === topicKey);
  if (!view || !topic) notFound();

  const subtopic = found?.subtopic;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: curriculum.program.title, href: hrefs.program() },
          { label: course.title, href: hrefs.course(course.id) },
          { label: view.title, href: hrefs.module(course.id, view.id) },
          ...(subtopic
            ? [
                {
                  label: subtopic.title,
                  href: hrefs.subtopic(course.id, subtopic.id),
                },
              ]
            : []),
          { label: subtopic ? "Edit" : "New subtopic" },
        ]}
      />
      <PageHeading
        title={subtopic ? `Edit ${subtopic.title}` : "New subtopic"}
        description={`In ${view.title} · ${topic.number}. ${topic.title}`}
      />
      <SubtopicForm
        mode={subtopic ? "edit" : "create"}
        area={area}
        programSlug={programSlug}
        courseKey={course.id}
        moduleKey={view.id}
        topicKey={topic.id}
        suggestedKey={suggestKey({
          parentKey: topic.id,
          prefix: "s",
          index: topic.subtopics.length,
        })}
        initial={
          subtopic
            ? {
                key: subtopic.id,
                title: subtopic.title,
                kind: subtopic.kind,
                status: subtopic.nodeStatus,
                // The form field speaks JSON, so the view's object is
                // serialised on the way in and parsed on the way back out.
                video: subtopic.video ? JSON.stringify(subtopic.video) : "",
                videoUrl: subtopic.videoUrl,
                seconds: subtopic.seconds ? String(subtopic.seconds) : "",
                caption: subtopic.caption,
                body: subtopic.body,
                // The field speaks JSON, exactly like `video` above.
                pdf: subtopic.pdf ? JSON.stringify([subtopic.pdf]) : "",
              }
            : {
                key: "",
                title: "",
                kind: (defaultKind as SubtopicKind) || "video",
                status: "draft",
                video: "",
                videoUrl: "",
                seconds: "",
                caption: "",
                body: "",
                pdf: "",
              }
        }
        uploads={videoUploadsConfigured()}
        initialQuestions={
          (subtopic?.questions ?? []).map((question) => ({
            id: question.id,
            kind: question.kind,
            prompt: question.prompt,
            options: question.options,
            correctOptionId: question.correctOptionId,
            correctOptionIds: question.correctOptionIds,
            pairs: question.pairs,
            explanation: question.explanation,
          })) satisfies QuestionInput[]
        }
        cancelHref={
          subtopic
            ? hrefs.subtopic(course.id, subtopic.id)
            : hrefs.module(course.id, view.id)
        }
        context={[
          { label: "Program", value: curriculum.program.title },
          { label: "Course", value: course.title },
          { label: "Module", value: view.title },
          { label: "Topic", value: `${topic.number}. ${topic.title}` },
        ]}
      />
    </div>
  );
}

/* ------------------------------- assessment ------------------------------ */

/**
 * The module test and the final test, on one screen each.
 *
 * A test has no separate "view" page: the whole of a test *is* its questions,
 * so a detail screen would be the builder with the fields greyed out. The route
 * is therefore the builder, and it exists whether or not the paper does —
 * arriving at `…/tests/final` for a course that has none is a create, not a
 * 404, which is what makes the link on the course screen honest.
 *
 * The heading carries the two facts an author cannot change and should not have
 * to remember: what the paper is worth, and whether it is proctored.
 */
export async function AssessmentEditor({
  area,
  scope,
  programSlug,
  courseKey,
  moduleKey,
}: {
  area: StaffArea;
  scope: AssessmentScope;
  programSlug: string;
  courseKey: string;
  /** Required for a module test; a final test or term paper hangs off the course. */
  moduleKey?: string;
}) {
  // Loaded in branches rather than one ternary: only the module test has a
  // module, and a union of the results would hide it behind a narrowing every
  // caller below would have to repeat.
  const moduleLoad =
    scope === "module_test"
      ? await loadModuleTest(area, programSlug, courseKey, moduleKey ?? "")
      : null;
  const loaded =
    moduleLoad ??
    (scope === "term_test"
      ? await loadTermTest(area, programSlug, courseKey)
      : await loadFinalTest(area, programSlug, courseKey));

  const { curriculum, course, hrefs, test, attempts, user } = loaded;
  const view = moduleLoad ? moduleLoad.module : null;

  const parentHref = view
    ? hrefs.module(course.id, view.id)
    : hrefs.course(course.id);

  // Prefilled rather than blank: we know what this paper is called, and rule 19
  // says never make someone type what we already know.
  const suggestedTitle = view
    ? `Module ${view.number} test: ${view.title}`
    : scope === "term_test"
      ? course.title
      : `${course.title} — final test`;

  const questions = test?.questions ?? [];
  const marks = test ? questions.length * test.marksPerQuestion : 0;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: curriculum.program.title, href: hrefs.program() },
          { label: course.title, href: hrefs.course(course.id) },
          ...(view
            ? [{ label: view.title, href: hrefs.module(course.id, view.id) }]
            : []),
          { label: SCOPE_HEADING[scope] },
        ]}
      />

      <PageHeading
        title={test ? test.title : suggestedTitle}
        description={`${SCOPE_BLURB[scope]} ${describeTest(questions.length, marks, attempts)}`}
        action={test ? <NodeBadge status={test.status} /> : undefined}
      />

      {test ? (
        <div className="flex flex-wrap items-center justify-end gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm">
          <DeleteWorkButton
            work={{
              type: "assessment",
              area,
              programSlug,
              courseKey: course.id,
              scope,
              moduleKey: view?.id,
            }}
            role={user.role}
            title={test.title}
            count={attempts}
            returnTo={parentHref}
          />
        </div>
      ) : null}

      <AssessmentForm
        scope={scope}
        area={area}
        programSlug={programSlug}
        courseKey={course.id}
        moduleKey={view?.id}
        exists={Boolean(test)}
        initial={{
          title: test?.title ?? suggestedTitle,
          durationMinutes: String(test?.durationMinutes ?? 30),
          // A term paper is worth four times a course test per question — the
          // programme rule, seeded so nobody has to know it. See rules.ts.
          marksPerQuestion: String(
            test?.marksPerQuestion ??
              (scope === "term_test"
                ? TERM_MARK_PER_QUESTION
                : TEST_MARK_PER_QUESTION),
          ),
          status: test?.status ?? "draft",
        }}
        initialTerm={test?.term ?? null}
        initialQuestions={questions}
        cancelHref={parentHref}
        context={[
          { label: "Program", value: curriculum.program.title },
          { label: "Course", value: course.title },
          ...(view ? [{ label: "Module", value: view.title }] : []),
        ]}
      />
    </div>
  );
}

const SCOPE_HEADING: Record<AssessmentScope, string> = {
  module_test: "Module test",
  final_test: "Final test",
  term_test: "Term paper",
};

/**
 * What each paper is for, in the words a student would be told.
 *
 * A term paper's line deliberately does **not** mention reaching the next
 * course: a checkpoint gates on finishing what comes before it, and the 50% is
 * the combined mid-and-end graduation rule, not a per-paper pass mark.
 */
const SCOPE_BLURB: Record<AssessmentScope, string> = {
  module_test:
    "Assessment only — the mark appears on the marksheet and counts toward nothing.",
  final_test: `Proctored, and counts toward the result — students need ${FINAL_TEST_PASS_PERCENT}% to reach the next course.`,
  term_test: `Proctored, one attempt only, and counts toward the aggregate. Students need ${MIN_TERM_PERCENT}% across the mid-term and end-term together to graduate.`,
};

/** "12 questions · 60 marks · 4 attempts sat" — whichever of those is true. */
function describeTest(
  questions: number,
  marks: number,
  attempts: number,
): string {
  if (questions === 0) {
    return "No questions yet, so it cannot be published.";
  }
  const sat =
    attempts === 0
      ? "Nobody has sat it yet"
      : `${attempts} attempt${attempts === 1 ? "" : "s"} sat`;
  return `${questions} question${questions === 1 ? "" : "s"} · ${marks} marks · ${sat}.`;
}

/* ------------------------------- assignment ------------------------------ */

/**
 * Create or edit an assignment.
 *
 * Like a test, the builder *is* the screen — an assignment is a brief and a set
 * of rules about handing in, and there is nothing else to show. Unlike a test,
 * a course holds as many as it likes, so this one has a key and a create/edit
 * mode like every other node.
 */
export async function AssignmentEditor({
  area,
  programSlug,
  courseKey,
  assignmentKey,
}: {
  area: StaffArea;
  programSlug: string;
  courseKey: string;
  /** Omitted when creating. */
  assignmentKey?: string;
}) {
  const { curriculum, course, hrefs, assignment, submissions, siblings, user } =
    await loadAssignment(area, programSlug, courseKey, assignmentKey);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: curriculum.program.title, href: hrefs.program() },
          { label: course.title, href: hrefs.course(course.id) },
          { label: assignment ? assignment.title : "New assignment" },
        ]}
      />

      <PageHeading
        title={assignment ? assignment.title : "New assignment"}
        description={
          assignment
            ? `Out of ${assignment.maxMarks} · ${
                submissions === 0
                  ? "no hand-ins yet"
                  : `${submissions} hand-in${submissions === 1 ? "" : "s"}`
              }. Every assignment in this course must be handed in before the next course opens.`
            : "Work students hand in and you mark — the only thing in the course a human grades."
        }
        action={
          assignment ? <NodeBadge status={assignment.status} /> : undefined
        }
      />

      {assignment ? (
        <div className="flex flex-wrap items-center justify-end gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm">
          <DeleteWorkButton
            work={{
              type: "assignment",
              area,
              programSlug,
              assignmentKey: assignment.key,
            }}
            role={user.role}
            title={assignment.title}
            count={submissions}
            returnTo={hrefs.course(course.id)}
          />
        </div>
      ) : null}

      <AssignmentForm
        mode={assignment ? "edit" : "create"}
        area={area}
        programSlug={programSlug}
        courseKey={course.id}
        suggestedKey={suggestKey({
          parentKey: course.id,
          prefix: "a",
          index: siblings,
        })}
        initial={
          assignment
            ? {
                key: assignment.key,
                title: assignment.title,
                brief: assignment.brief,
                dueDate: assignment.dueDate,
                maxMarks: String(assignment.maxMarks),
                status: assignment.status,
              }
            : undefined
        }
        initialFormats={assignment?.acceptedFormats}
        initialBriefFile={assignment?.briefFile ?? null}
        cancelHref={hrefs.course(course.id)}
        context={[
          { label: "Program", value: curriculum.program.title },
          { label: "Course", value: course.title },
        ]}
      />
    </div>
  );
}

/** An ISO instant back to the `yyyy-mm-dd` a date input expects. */
function dateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}
