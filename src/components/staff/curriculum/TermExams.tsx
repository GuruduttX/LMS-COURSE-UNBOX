import { FileCheck2, Plus } from "lucide-react";

import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { CourseView, ProgramCurriculum } from "@/lib/curriculum/types";

import { NodeBadge } from "./NodeBadge";
import { TreeList, TreeRow, TreeSection } from "./TreeRow";
import type { CurriculumHrefs } from "./hrefs";

/**
 * The mid-term and end-term, on the program screen.
 *
 * They live on checkpoint courses, which is right in the data and was wrong in
 * the UI: the only route to one was "Add a course" and knowing to leave the
 * number blank. Nothing said so, so the feature may as well not have existed
 * for anyone who had not read `Course.number`. This section is that missing
 * signpost — the two exams a program has, where they are, and the one button
 * that makes the next one.
 *
 * It is deliberately a **separate section from the courses list** even though a
 * checkpoint is a course. A programme has courses you teach and two exams you
 * sit; showing the exams as rows 4 and 8 of the course list is technically
 * accurate and hides them exactly where someone looking for them will not look.
 * The checkpoints still appear in the course list too — that is where their
 * order lives, and reordering is done there.
 *
 * Shared by the admin and teacher screens through `CurriculumHrefs`, like every
 * other piece of the tree.
 */
export function TermExams({
  curriculum,
  hrefs,
  /** Omitted for a read-only viewer — a manager sees the papers, not the buttons. */
  authoring,
}: {
  curriculum: ProgramCurriculum;
  hrefs: CurriculumHrefs;
  authoring?: boolean;
}) {
  const checkpoints = curriculum.courses.filter(
    (course) => course.number === null,
  );

  return (
    <TreeSection
      title="Term exams"
      description="The mid-term and end-term. Each one is a checkpoint between courses: proctored, one attempt, 20 marks a question, and it counts toward the aggregate."
      action={
        // A program holds one mid-term and one end-term — the unique index on
        // (programId, term) says so — so once there are two checkpoints the
        // button would only lead to a save the database refuses.
        authoring && checkpoints.length < 2 ? (
          <ButtonLink href={`${hrefs.newCourse()}?checkpoint=1`} size="sm">
            <Plus size={16} aria-hidden />
            Add a term exam
          </ButtonLink>
        ) : undefined
      }
    >
      {checkpoints.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="No term exams yet"
          description="A term exam sits between courses and opens once everything before it is finished. Add one, then write its paper."
          action={
            authoring ? (
              <ButtonLink href={`${hrefs.newCourse()}?checkpoint=1`}>
                <Plus size={16} aria-hidden />
                Add the mid-term
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <TreeList>
          {checkpoints.map((checkpoint) => (
            <CheckpointRow
              key={checkpoint.id}
              checkpoint={checkpoint}
              hrefs={hrefs}
              authoring={authoring}
            />
          ))}
        </TreeList>
      )}
    </TreeSection>
  );
}

function CheckpointRow({
  checkpoint,
  hrefs,
  authoring,
}: {
  checkpoint: CourseView;
  hrefs: CurriculumHrefs;
  authoring?: boolean;
}) {
  const paper = checkpoint.termTest;

  // The row leads to the paper when there is one and to the checkpoint itself
  // when there is not — in both cases, the thing the person clicking wants next.
  const href = paper
    ? hrefs.termTest(checkpoint.id)
    : authoring
      ? hrefs.termTest(checkpoint.id)
      : hrefs.course(checkpoint.id);

  return (
    <TreeRow
      href={href}
      icon={FileCheck2}
      eyebrow={
        paper?.term === "mid"
          ? "Mid-term"
          : paper?.term === "end"
            ? "End-term"
            : "Term unset"
      }
      title={paper ? paper.title : checkpoint.title}
      badges={
        paper ? (
          <NodeBadge status={paper.nodeStatus} />
        ) : (
          <span className="inline-flex items-center rounded-full border border-warning-500 bg-warning-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-warning-700">
            No paper
          </span>
        )
      }
      meta={
        paper ? (
          <>
            {paper.questionCount}{" "}
            {paper.questionCount === 1 ? "question" : "questions"} ·{" "}
            {paper.questionCount * paper.marksPerQuestion} marks ·{" "}
            {paper.durationMinutes} minutes
          </>
        ) : (
          // Not a neutral "nothing here": a checkpoint with no paper is a page
          // a student can reach and find empty, so it reads as the job it is.
          <>Students reach this and find nothing to sit. Write the paper.</>
        )
      }
    />
  );
}
