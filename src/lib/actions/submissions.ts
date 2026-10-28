"use server";

/**
 * Handing work in — the first thing a **student** writes to the database.
 *
 * Every other write in the app is staff acting on someone else's record, so the
 * house order is `requireRole → can() → assertScope → validate → write`. Here
 * the actor and the subject are the same person, and the order becomes:
 *
 *   requireUser (who) → the tree (which, and may they) → the lock (may they
 *   *again*) → validate (what) → write → audit → revalidate
 *
 * **The tree is the scope check.** `getProgramCurriculum` already answers "is
 * this program published, does this course exist, is it locked for this
 * student, and what does this assignment accept" — the exact questions the
 * screen asked to decide what to render. Re-deriving them from the models here
 * would be a second copy of the gate, and the two would drift.
 *
 * ## Handing in is final
 *
 * A student hands in once. The only thing that reopens the form is a teacher's
 * resubmission request (`requestResubmission` in `actions/grading.ts`), and
 * nothing a student can post writes that status. The lock is enforced by the
 * **writes themselves**, not by a read followed by a write, so a double click,
 * two tabs, or a script calling this action directly all meet the same wall:
 *
 * - a first hand-in is an insert against the unique `(studentId, assignmentId)`
 *   index — two concurrent inserts cannot both land;
 * - a resubmission is an update that only matches a row whose status is
 *   `resubmission_requested`, and it moves the row out of that status in the
 *   same operation — so it can be used exactly once.
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
import {
  HAND_IN_LOCKED,
  canHandIn,
} from "@/lib/curriculum/submission-status";
import { getProgramCurriculum } from "@/lib/data/curriculum-db";
import { connectToDatabase } from "@/lib/db";
import { parseUploadedFiles } from "@/lib/uploads/kinds";
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

  // The cheap refusal, before any validation: the tree already knows whether
  // this student has handed in. It is a courtesy — the writes below are the
  // lock, and they hold even if this read is a moment stale.
  if (!canHandIn(assignment.submission)) {
    return locked(formData);
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

  /** The current version, whichever write it lands through. */
  const current = {
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
    resubmission: null,
  };

  /**
   * First hand-in: insert only. `$setOnInsert` writes nothing to a row that
   * already exists, so an upsert here can never replace work — it either
   * creates the row or matches one and leaves it alone. Two racing first
   * hand-ins collide on the unique index; the loser is told it is locked.
   */
  let inserted: boolean;
  try {
    const result = await Submission.updateOne(
      { studentId, assignmentId: row._id },
      { $setOnInsert: { ...current, version: 1, history: [] } },
      { upsert: true },
    );
    inserted = result.upsertedCount === 1;
  } catch (error) {
    if (isDuplicateKey(error)) return locked(formData);
    throw error;
  }

  /**
   * A row existed, so this can only be a resubmission — and it only lands if
   * the teacher asked for one. The filter and the status change are the same
   * operation, which is what makes a request good for exactly one hand-in.
   *
   * The version being replaced was copied into `history` when the teacher sent
   * it back (see `requestResubmission`), so nothing is lost by overwriting the
   * top level, and its file is deliberately **not** deleted from Cloudinary:
   * the history still points at it.
   */
  if (!inserted) {
    const result = await Submission.updateOne(
      {
        studentId,
        assignmentId: row._id,
        status: "resubmission_requested",
      },
      { $set: current, $inc: { version: 1 } },
    );

    if (result.modifiedCount === 0) return locked(formData);
  }

  const version = inserted ? 1 : (assignment.submission?.version ?? 1) + 1;

  await writeAudit(user, {
    action: inserted ? "submission.create" : "submission.resubmit",
    targetType: "Submission",
    targetId: String(row._id),
    summary: inserted
      ? `Handed in ${assignment.title}`
      : `Resubmitted ${assignment.title} (version ${version})`,
    meta: {
      programSlug,
      courseKey,
      assignmentKey,
      format: values.format,
      version,
    },
  });

  revalidatePath(`/dashboard/${programSlug}/course_details`);
  revalidatePath(`/dashboard/${programSlug}/overview`);
  revalidatePath("/teacher/grading");
  revalidatePath("/teacher");

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

/**
 * The refusal for a hand-in that already exists.
 *
 * The file a refused post uploaded is **not** deleted here. It is unreferenced,
 * but the posted JSON is the client's claim about which asset it is — deleting
 * on that claim would let a crafted post name the asset a real hand-in points
 * at. An orphan in the submissions folder is the cheaper failure.
 */
function locked(formData: FormData): SubmissionFormState {
  return {
    ok: false,
    values: readValues(formData),
    errors: {},
    file: null,
    error: HAND_IN_LOCKED,
  };
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}
