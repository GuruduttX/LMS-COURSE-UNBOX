import "server-only";
import { notFound } from "next/navigation";

/**
 * Loading a test or an assignment for its builder.
 *
 * Deliberately **not** read off the `ProgramCurriculum` the browse screens use,
 * for two reasons the authoring side cares about and the student side does not:
 *
 * - That tree hides archived content, and an archived test is still the
 *   module's test. A builder that couldn't see it would offer to create a
 *   second one, and the unique index on `moduleId` would reject the save with a
 *   driver error instead of a screen.
 * - A builder needs the questions in full, with their correct answers, plus how
 *   many students have already sat or handed in — none of which belongs in a
 *   view type shared with the student screens.
 *
 * The guard is still `loadStaffCourse` / `loadStaffModule`, so these screens get
 * requireRole → assertScope in the house order like every other one.
 */
import { connectToDatabase } from "@/lib/db";
import type { SubmissionFormat } from "@/lib/curriculum/submission-formats";
import type { NodeStatus } from "@/lib/curriculum/rules";
import { TEST_MARK_PER_QUESTION } from "@/lib/curriculum/rules";
import { toAuthoredQuestion } from "@/lib/curriculum/question-kinds";
import type { UploadedFile } from "@/lib/uploads/kinds";
import type { QuestionInput } from "@/lib/validation/curriculum";
import { Assessment } from "@/models/Assessment";
import { Assignment } from "@/models/Assignment";
import { Attempt } from "@/models/Attempt";
import { Course } from "@/models/Course";
import { Module } from "@/models/Module";
import { Program } from "@/models/Program";
import { Submission } from "@/models/Submission";

import {
  loadStaffCourse,
  loadStaffModule,
  type LoadedCourse,
  type LoadedModule,
  type StaffArea,
} from "./staff-program";

/** Where a builder's Save lands, and how the paper is graded and policed. */
export type AssessmentScope = "module_test" | "final_test" | "term_test";

export type LoadedAssessment = {
  /** Null when the course or module hasn't got one yet — a create, not a 404. */
  test: {
    id: string;
    title: string;
    durationMinutes: number;
    marksPerQuestion: number;
    /** "mid" or "end" for a term paper, null for everything else. */
    term: "mid" | "end" | null;
    status: NodeStatus;
    version: number;
    questions: QuestionInput[];
  } | null;
  /** Attempts already sat. Non-zero puts delete out of a teacher's reach. */
  attempts: number;
};

/** The course's final test, whatever state it is in. */
export async function loadFinalTest(
  area: StaffArea,
  programSlug: string,
  courseKey: string,
): Promise<LoadedCourse & LoadedAssessment> {
  const loaded = await loadStaffCourse(area, programSlug, courseKey);
  const found = await readAssessment(
    loaded.curriculum.program.slug,
    courseKey,
    "final_test",
    null,
  );
  return { ...loaded, ...found };
}

/**
 * A checkpoint course's term paper, whatever state it is in.
 *
 * Looked up by course rather than by `term`, because the URL names the
 * checkpoint and the author picks the term inside — so arriving at a checkpoint
 * that has no paper is a create, exactly like the final test.
 */
export async function loadTermTest(
  area: StaffArea,
  programSlug: string,
  courseKey: string,
): Promise<LoadedCourse & LoadedAssessment> {
  const loaded = await loadStaffCourse(area, programSlug, courseKey);
  const found = await readAssessment(
    loaded.curriculum.program.slug,
    courseKey,
    "term_test",
    null,
  );
  return { ...loaded, ...found };
}

/** The module's test, whatever state it is in. */
export async function loadModuleTest(
  area: StaffArea,
  programSlug: string,
  courseKey: string,
  moduleKey: string,
): Promise<LoadedModule & LoadedAssessment> {
  const loaded = await loadStaffModule(area, programSlug, courseKey, moduleKey);
  const found = await readAssessment(
    loaded.curriculum.program.slug,
    courseKey,
    "module_test",
    moduleKey,
  );
  return { ...loaded, ...found };
}

export type LoadedAssignment = LoadedCourse & {
  /** Null when creating. */
  assignment: {
    key: string;
    title: string;
    brief: string;
    /** The brief handed out as a PDF, or null. */
    briefFile: UploadedFile | null;
    /** yyyy-mm-dd, the shape a date input wants. */
    dueDate: string;
    maxMarks: number;
    acceptedFormats: SubmissionFormat[];
    status: NodeStatus;
  } | null;
  /** Hand-ins already made. Non-zero puts delete out of a teacher's reach. */
  submissions: number;
  /** How many the course already has — the suggested key counts from it. */
  siblings: number;
};

export async function loadAssignment(
  area: StaffArea,
  programSlug: string,
  courseKey: string,
  assignmentKey?: string,
): Promise<LoadedAssignment> {
  const loaded = await loadStaffCourse(area, programSlug, courseKey);

  await connectToDatabase();
  const course = await courseIdFor(programSlug, courseKey);

  const siblings = await Assignment.countDocuments({ courseId: course });

  if (!assignmentKey) {
    return { ...loaded, assignment: null, submissions: 0, siblings };
  }

  const row = await Assignment.findOne({ courseId: course, key: assignmentKey })
    .lean();
  if (!row) notFound();

  const submissions = await Submission.countDocuments({ assignmentId: row._id });

  return {
    ...loaded,
    assignment: {
      key: row.key,
      title: row.title,
      brief: row.brief ?? "",
      briefFile: (row.briefFile as UploadedFile | null) ?? null,
      dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : "",
      maxMarks: row.maxMarks,
      acceptedFormats: (row.acceptedFormats ?? []) as SubmissionFormat[],
      status: row.status as NodeStatus,
    },
    submissions,
    siblings,
  };
}

/* --------------------------------- reads --------------------------------- */

async function readAssessment(
  programSlug: string,
  courseKey: string,
  scope: AssessmentScope,
  moduleKey: string | null,
): Promise<LoadedAssessment> {
  await connectToDatabase();

  const courseId = await courseIdFor(programSlug, courseKey);
  const moduleId = moduleKey
    ? await moduleIdFor(programSlug, moduleKey)
    : null;

  const row = await Assessment.findOne({ courseId, scope, moduleId }).lean();
  if (!row) return { test: null, attempts: 0 };

  const attempts = await Attempt.countDocuments({ targetId: row._id });

  return {
    test: {
      id: String(row._id),
      title: row.title,
      durationMinutes: row.durationMinutes,
      marksPerQuestion: row.marksPerQuestion ?? TEST_MARK_PER_QUESTION,
      term: (row.term as "mid" | "end" | null) ?? null,
      status: row.status as NodeStatus,
      version: row.version ?? 1,
      // The builder is the one screen that legitimately needs the answers.
      // `choiceOrder` is dropped on the way in: it belongs to an attempt's
      // frozen shuffle, never to the paper being written.
      questions: (row.questions ?? []).map((question) => {
        const whole = toAuthoredQuestion(question);
        return {
          id: whole.id,
          kind: whole.kind,
          prompt: whole.prompt,
          options: whole.options,
          correctOptionId: whole.correctOptionId,
          correctOptionIds: whole.correctOptionIds,
          pairs: whole.pairs,
          explanation: whole.explanation,
        };
      }),
    },
    attempts,
  };
}

/**
 * The ObjectIds behind a key.
 *
 * Scoped by `programId` rather than looked up by key alone, so a key belonging
 * to another program cannot answer here — the guard has established which
 * program this person may see, and these stay inside it.
 */
async function programIdFor(programSlug: string) {
  const program = await Program.findOne({ slug: programSlug })
    .select("_id")
    .lean();
  if (!program) notFound();
  return program._id;
}

async function courseIdFor(programSlug: string, courseKey: string) {
  const programId = await programIdFor(programSlug);
  const course = await Course.findOne({ programId, key: courseKey })
    .select("_id")
    .lean();
  if (!course) notFound();
  return course._id;
}

async function moduleIdFor(programSlug: string, moduleKey: string) {
  const programId = await programIdFor(programSlug);
  const row = await Module.findOne({ programId, key: moduleKey })
    .select("_id")
    .lean();
  if (!row) notFound();
  return row._id;
}
