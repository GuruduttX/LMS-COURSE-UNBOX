/**
 * One course, as a staff member sees it: its modules, its assignments and its
 * final test, each a way further down the tree.
 *
 * Server component. Shared by the admin's program browser and the teacher's
 * course list — the two differ only in the `hrefs` they pass, which is why the
 * screens themselves aren't duplicated.
 *
 * `authoring` is what turns a browser into an editor. A manager passes nothing
 * and gets exactly the same tree without a control on it, which is the whole of
 * "a program manager may look at content but not change it" on this screen.
 */
import { ClipboardList, FileCheck2, Layers, Plus } from "lucide-react";

import { ButtonLink } from "@/components/ui/Button";
import { formatDate } from "@/lib/curriculum/format";
import { formatList } from "@/lib/curriculum/submission-formats";
import { moduleSubtopics } from "@/lib/curriculum/status";
import type { CourseView } from "@/lib/curriculum/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { EmptyTestBadge, NodeBadge } from "./NodeBadge";
import { MoveButtons } from "./NodeActions";
import { TreeList, TreeRow, TreeSection } from "./TreeRow";
import { areaFor, type CurriculumHrefs } from "./hrefs";

export type Authoring = { programSlug: string };

export function CourseDetail({
  course,
  hrefs,
  authoring,
}: {
  course: CourseView;
  hrefs: CurriculumHrefs;
  /** Omitted for a read-only viewer. */
  authoring?: Authoring;
}) {
  const area = areaFor(hrefs);
  // A course with no number is a standalone checkpoint — the mid-term or the
  // end-term. See Course.number.
  const checkpoint = course.number === null;

  return (
    <div className="space-y-8">
      <TreeSection
        title="Modules"
        description="The teaching content, in the order students meet it."
        action={
          authoring ? (
            <ButtonLink href={hrefs.newModule(course.id)} size="sm">
              <Plus size={16} aria-hidden />
              Add a module
            </ButtonLink>
          ) : undefined
        }
      >
        {course.modules.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No modules yet"
            description="A module holds the topics, and a topic holds the videos, reading and quizzes."
            action={
              authoring ? (
                <ButtonLink href={hrefs.newModule(course.id)}>
                  <Plus size={16} aria-hidden />
                  Add the first module
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <TreeList>
            {course.modules.map((view, index) => {
              const subtopics = moduleSubtopics(view.topics);
              return (
                <TreeRow
                  key={view.id}
                  href={hrefs.module(course.id, view.id)}
                  icon={Layers}
                  eyebrow={`Module ${view.number}`}
                  title={view.title}
                  badges={
                    <>
                      <NodeBadge status={view.nodeStatus} />
                      {view.test && view.test.questionCount === 0 ? (
                        <EmptyTestBadge />
                      ) : null}
                    </>
                  }
                  meta={`${count(view.topics.length, "topic")} · ${count(subtopics.length, "subtopic")}${
                    view.test
                      ? ` · module test (${count(view.test.questionCount, "question")})`
                      : " · no module test"
                  }`}
                  aside={
                    authoring ? (
                      <MoveButtons
                        node={{
                          area,
                          programSlug: authoring.programSlug,
                          type: "module",
                          nodeKey: view.id,
                          title: view.title,
                        }}
                        first={index === 0}
                        last={index === course.modules.length - 1}
                      />
                    ) : undefined
                  }
                />
              );
            })}
          </TreeList>
        )}
      </TreeSection>

      <TreeSection
        title="Assignments"
        description="Work students hand in and a teacher marks — the only thing here a human grades."
        action={
          authoring ? (
            <ButtonLink href={hrefs.newAssignment(course.id)} size="sm">
              <Plus size={16} aria-hidden />
              Add an assignment
            </ButtonLink>
          ) : undefined
        }
      >
        {course.assignments.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No assignments yet"
            description="Every assignment in this course must be handed in before the next course opens."
            action={
              authoring ? (
                <ButtonLink href={hrefs.newAssignment(course.id)}>
                  <Plus size={16} aria-hidden />
                  Add the first assignment
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <TreeList>
            {course.assignments.map((assignment) => (
              <TreeRow
                key={assignment.id}
                href={hrefs.assignment(course.id, assignment.id)}
                icon={ClipboardList}
                title={assignment.title}
                badges={<NodeBadge status={assignment.nodeStatus} />}
                meta={
                  <>
                    Accepts{" "}
                    {formatList(assignment.acceptedFormats) || "nothing yet"} ·
                    out of {assignment.maxMarks}
                    {assignment.dueDate
                      ? ` · due ${formatDate(assignment.dueDate)}`
                      : ""}
                    {assignment.briefFile ? " · brief attached" : ""}
                  </>
                }
              />
            ))}
          </TreeList>
        )}
      </TreeSection>

      {/*
        A checkpoint has a term paper where a numbered course has a final test.
        One section, chosen by which kind of course this is — never both, because
        a checkpoint *is* the graded work and a course is what leads to it.
      */}
      {checkpoint ? (
        <TreeSection
          title="Term paper"
          description="Proctored, one attempt. Counts toward the aggregate and the combined mid/end-term rule."
        >
          {course.termTest ? (
            <TreeRow
              href={hrefs.termTest(course.id)}
              icon={FileCheck2}
              title={course.termTest.title}
              badges={
                <>
                  <NodeBadge status={course.termTest.nodeStatus} />
                  {course.termTest.questionCount === 0 ? (
                    <EmptyTestBadge />
                  ) : null}
                </>
              }
              meta={`${course.termTest.term === "mid" ? "Mid-term" : course.termTest.term === "end" ? "End-term" : "Term unset"} · ${count(course.termTest.questionCount, "question")} · ${course.termTest.durationMinutes} minutes · ${course.termTest.marksPerQuestion} marks each`}
            />
          ) : (
            <EmptyState
              icon={FileCheck2}
              title="No term paper yet"
              description="This checkpoint has nothing to sit. Students reach it and find an empty page until a paper is published here."
              action={
                authoring ? (
                  <ButtonLink href={hrefs.termTest(course.id)}>
                    <Plus size={16} aria-hidden />
                    Write the term paper
                  </ButtonLink>
                ) : undefined
              }
            />
          )}
        </TreeSection>
      ) : (
        <TreeSection
          title="Final test"
          description="Proctored. Students need 50% to reach the next course."
        >
          {course.finalTest ? (
            <TreeRow
              href={hrefs.finalTest(course.id)}
              icon={FileCheck2}
              title={course.finalTest.title}
              badges={
                <>
                  <NodeBadge status={course.finalTest.nodeStatus} />
                  {course.finalTest.questionCount === 0 ? (
                    <EmptyTestBadge />
                  ) : null}
                </>
              }
              meta={`${count(course.finalTest.questionCount, "question")} · ${course.finalTest.durationMinutes} minutes · ${course.finalTest.marksPerQuestion} marks each`}
            />
          ) : (
            <EmptyState
              icon={FileCheck2}
              title="No final test"
              description="Until one is published, this course doesn't gate the next — students pass straight through."
              action={
                authoring ? (
                  <ButtonLink href={hrefs.finalTest(course.id)}>
                    <Plus size={16} aria-hidden />
                    Write the final test
                  </ButtonLink>
                ) : undefined
              }
            />
          )}
        </TreeSection>
      )}
    </div>
  );
}

function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}
