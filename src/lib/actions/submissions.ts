"use server";

/**
 * Handing work in — the first thing a **student** writes to the database.
 *
 * Every other write in the app is staff acting on someone else's record, so the
 * house order is `requireRole → can() → assertScope → validate → write`. Here
 * the actor and the subject are the same person, and the order becomes:
 *
 *   requireUser (who) → the tree (which, and may they) → validate (what) →
 *   write → audit → revalidate
 *
 * **The tree is the scope check.** `getProgramCurriculum` already answers "is
 * this program published, does this course exist, is it locked for this
 * student, and what does this assignment accept" — the exact questions the
 * screen asked to decide what to render. Re-deriving them from the models here
 * would be a second copy of the gate, and the two would drift.
 *
 * A server action is its own front door: none of this trusts the form that
 * posted it.
 */
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { Types } from "mongoose";

import { writeAudit } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/guards";
import {
  formatForKind,
  uploadableKinds,
  type SubmissionFormat,
} from "@/lib/curriculum/submission-formats";
import { getProgramCurriculum } from "@/lib/data/curriculum-db";
import { connectToDatabase } from "@/lib/db";
import { destroyAsset } from "@/lib/uploads/cloudinary";
import { parseUploadedFiles, type UploadedFile } from "@/lib/uploads/kinds";
import {
  hasErrors,
  validateSubmission,
  type SubmissionInput,
} from "@/lib/validation/curriculum";
import { Assignment } from "@/models/Assignment";
import { Submission } from "@/models/Submission";

import type { SubmissionFormState } from "./curriculum-state";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function submitAssignment(
  _previous: SubmissionFormState,
  formData: FormData,
): Promise<SubmissionFormState> {
  const user = await requireUser();

  /**
   * Deliberately **not** `requireRole("student")`, which admits an admin —
   * the superset rule is right for staff screens and wrong here. An admin has
   * no coursework of their own, and letting one post would put a hand-in from
   * a non-student in a teacher's grading queue.
   */
  if (user.role !== "student") {
    return {
      ok: false,
      values: EMPTY_VALUES,
      errors: {},
      file: null,
      error: "Only a student can hand work in.",
    };
  }

  const programSlug = text(formData, "programSlug");
  const courseKey = text(formData, "courseKey");
  const assignmentKey = text(formData, "assignmentKey");

  const curriculum = await getProgramCurriculum(programSlug, {
    studentId: user.id,
  });
  if (!curriculum) notFound();

  const course = curriculum.courses.find((row) => row.id === courseKey);
  if (!course) notFound();

  const assignment = course.assignments.find((row) => row.id === assignmentKey);
  if (!assignment) notFound();

  const accepted = assignment.acceptedFormats;

  // The same gate the screen showed. A locked course is not a hand-in you may
  // get ahead on: it is work you have not reached.
  if (course.locked) {
    return {
      ok: false,
      values: readValues(formData),
      errors: {},
      file: null,
      error: course.lockedReason ?? "This course isn't open yet.",
    };
  }

  /**
   * Two ways in, one field out. An uploaded file wins when both are filled:
   * it is hosted by us and its type is known, where a pasted link is a claim.
   * Uploads are re-checked against our own Cloudinary root here, because the
   * field posts JSON and JSON from a browser is not evidence.
   */
  const uploaded = parseUploadedFiles(
    text(formData, "file"),
    uploadableKinds(accepted),
  );
  const file = uploaded.files[0] ?? null;

  const values: SubmissionInput = file
    ? {
        fileUrl: file.url,
        format: formatForKind(file.kind) ?? "",
        note: text(formData, "note"),
      }
    : readValues(formData);

  const errors = validateSubmission(values, accepted);
  if (uploaded.error) errors.fileUrl = uploaded.error;

  if (hasErrors(errors)) {
    return { ok: false, values, errors, file };
  }

  await connectToDatabase();

  // The tree is keyed by the assignment's `key`; the write needs its id.
  const row = await Assignment.findOne({
    key: assignmentKey,
    status: "published",
  })
    .select("_id programId courseId maxMarks")
    .lean();
  if (!row) notFound();

  const studentId = new Types.ObjectId(user.id);

  const previous = await Submission.findOne({
    studentId,
    assignmentId: row._id,
  })
    .select("file")
    .lean();

  /**
   * Upsert against the unique `(studentId, assignmentId)` index, exactly as
   * the model describes: one row per student per assignment, corrected in
   * place. A resubmission drops back to `submitted` and clears the mark and
   * feedback — an old mark against new work is worse than no mark at all.
   */
  await Submission.updateOne(
    { studentId, assignmentId: row._id },
    {
      $set: {
        programId: row.programId,
        courseId: row.courseId,
        fileUrl: values.fileUrl.trim(),
        file,
        format: values.format as SubmissionFormat,
        note: values.note.trim(),
        submittedAt: new Date(),
        status: "submitted",
        scored: null,
        // Copied at hand-in, so a later change to the assignment cannot
        // silently rescale a mark already given.
        maxMarks: row.maxMarks,
        feedback: "",
        evaluatedBy: null,
        evaluatedAt: null,
      },
    },
    { upsert: true },
  );

  // The row now points somewhere else, so the file it used to point at is an
  // orphan. Best effort: the hand-in is recorded, and a Cloudinary failure must
  // not turn a successful submission into an error on screen.
  await discardReplacedFile(previous?.file ?? null, file);

  await writeAudit(user, {
    action: "submission.create",
    targetType: "Submission",
    targetId: String(row._id),
    summary: `Handed in ${assignment.title}`,
    meta: { programSlug, courseKey, assignmentKey, format: values.format },
  });

  revalidatePath(`/dashboard/${programSlug}/course_details`);
  revalidatePath(`/dashboard/${programSlug}/overview`);

  return { ok: true, values, errors: {}, file };
}

const EMPTY_VALUES: SubmissionInput = { fileUrl: "", format: "", note: "" };

function readValues(formData: FormData): SubmissionInput {
  return {
    fileUrl: text(formData, "fileUrl"),
    format: text(formData, "format"),
    note: text(formData, "note"),
  };
}

async function discardReplacedFile(
  previous: UploadedFile | null,
  next: UploadedFile | null,
): Promise<void> {
  if (!previous?.publicId) return;
  if (previous.publicId === next?.publicId) return;

  try {
    await destroyAsset(previous.publicId, previous.resourceType);
  } catch (error) {
    console.error("[submissions] could not delete a replaced hand-in:", error);
  }
}
