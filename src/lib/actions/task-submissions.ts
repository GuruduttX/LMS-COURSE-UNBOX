"use server";

/**
 * Handing in a task — the student's side of `actions/tasks.ts`.
 *
 * Its own module rather than a fifth export from that file, because the guard
 * is inverted. Everything in `actions/tasks.ts` starts `requireRole("teacher")`
 * and asks whether the actor may act on somebody else's program; here the actor
 * and the subject are the same person, and the order becomes the one
 * `submitAssignment` uses:
 *
 *   requireUser (who) → the loader (which task, and may they see it) →
 *   validate (what) → write → audit → revalidate
 *
 * **The loader is the scope check.** `getStudentTask` already answers "does
 * this program exist, is this student enrolled on it, and is this task one of
 * theirs" — the same questions the page asked to decide what to render, and the
 * `$or` on audience is what keeps a task set for another student from being
 * handed in against. Re-deriving any of it here would be a second copy of the
 * gate, and the two would drift.
 */
import { revalidatePath } from "next/cache";
import { Types } from "mongoose";

import { writeAudit } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/guards";
import { getStudentTask } from "@/lib/data/tasks";
import { connectToDatabase } from "@/lib/db";
import {
  kindForFileKind,
  uploadableFileKinds,
  type TaskSubmissionKind,
} from "@/lib/tasks/submission-kinds";
import { destroyAsset } from "@/lib/uploads/cloudinary";
import { parseUploadedFiles, type UploadedFile } from "@/lib/uploads/kinds";
import {
  hasTaskErrors,
  validateTaskSubmission,
  type TaskSubmissionInput,
} from "@/lib/validation/task";
import { Program } from "@/models/Program";
import { TaskSubmission } from "@/models/TaskSubmission";

import type { TaskSubmissionFormState } from "./task-state";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function submitTask(
  _previous: TaskSubmissionFormState,
  formData: FormData,
): Promise<TaskSubmissionFormState> {
  const user = await requireUser();

  /**
   * Deliberately **not** `requireRole("student")`, which admits an admin — the
   * superset rule is right for staff screens and wrong here. An admin has no
   * tasks of their own, and letting one post would put a hand-in from a
   * non-student in front of a teacher as though a student had done the work.
   */
  if (user.role !== "student") {
    return {
      ok: false,
      values: { url: "", note: "" },
      errors: {},
      error: "Only a student can hand a task in.",
    };
  }

  const programSlug = text(formData, "programSlug");
  const taskId = text(formData, "taskId");

  const found = await getStudentTask(programSlug, user.id, taskId);
  if (!found) {
    return {
      ok: false,
      values: { url: text(formData, "url"), note: text(formData, "note") },
      errors: {},
      error: "That task isn't one of yours.",
    };
  }

  const { task } = found;
  const accepts = task.submission.kinds;

  /**
   * Two ways in, one field out. An uploaded file wins when both are filled: it
   * is hosted by us and its type is known, where a pasted link is a claim.
   * Uploads are re-checked against our own Cloudinary root here, because the
   * field posts JSON and JSON from a browser is not evidence.
   */
  const uploaded = parseUploadedFiles(
    text(formData, "file"),
    uploadableFileKinds(accepts),
  );
  const file = uploaded.files[0] ?? null;

  const values: TaskSubmissionInput = {
    url: file ? file.url : text(formData, "url"),
    note: text(formData, "note"),
  };

  const errors = validateTaskSubmission(values, {
    uploaded: Boolean(file),
    accepts,
  });
  if (uploaded.error) errors.url = uploaded.error;

  if (hasTaskErrors(errors)) return { ok: false, values, errors };

  /**
   * The kind is derived from what actually arrived, never from what the form
   * said it was: an uploaded WebP is an `image` hand-in whatever a posted field
   * claims, and anything not uploaded is a `link`. `validateTaskSubmission` has
   * already refused a link the task does not accept, and `uploadableFileKinds`
   * refused an upload of a kind it does not — so a null here would be a bug in
   * one of those, not a case to handle quietly.
   */
  const kind: TaskSubmissionKind | null = file ? kindForFileKind(file.kind) : "link";
  if (!kind || !accepts.includes(kind)) {
    return {
      ok: false,
      values,
      errors: { url: "That isn't something this task accepts." },
    };
  }

  await connectToDatabase();

  const program = await Program.findOne({ slug: programSlug }).select("_id").lean();
  if (!program) {
    return { ok: false, values, errors: {}, error: "That task isn't one of yours." };
  }

  /**
   * One row per student per task, replaced in place — the unique index is the
   * rule and this upsert is how it is kept. The file the hand-in replaces is
   * read first and deleted **after** the write: deleting it first and then
   * failing to write would leave the student's previous work gone and nothing
   * in its place.
   */
  const previous = await TaskSubmission.findOne({
    taskId: task.id,
    studentId: user.id,
  })
    .select("file")
    .lean();

  await TaskSubmission.updateOne(
    { taskId: new Types.ObjectId(task.id), studentId: new Types.ObjectId(user.id) },
    {
      $set: {
        programId: program._id,
        kind,
        url: values.url.trim(),
        file,
        note: values.note.trim(),
        submittedAt: new Date(),
      },
    },
    { upsert: true },
  );

  await writeAudit(user, {
    action: "task.submit",
    targetType: "Task",
    targetId: task.id,
    summary: `${previous ? "Replaced their hand-in for" : "Handed in"} "${task.title}"`,
    meta: { programSlug, kind },
  });

  const replaced = (previous?.file as UploadedFile | null) ?? null;
  // Not the file just written — an upload that replaces itself byte for byte
  // still gets a fresh public id, but comparing is cheap and deleting the live
  // asset would leave the row pointing at nothing.
  if (replaced && replaced.publicId !== file?.publicId) {
    try {
      await destroyAsset(replaced.publicId, replaced.resourceType);
    } catch (error) {
      console.error("[tasks] could not delete a replaced hand-in:", error);
    }
  }

  revalidatePath(`/dashboard/${programSlug}/tasks`);
  revalidatePath(`/dashboard/${programSlug}/tasks/${task.id}`);
  revalidatePath(`/admin/tasks/${task.id}`);
  revalidatePath(`/teacher/tasks/${task.id}`);
  revalidatePath("/admin/tasks");
  revalidatePath("/teacher/tasks");

  return {
    ok: true,
    values: { url: "", note: values.note },
    errors: {},
    message: previous ? "Replaced — your teacher sees the new one." : "Handed in.",
  };
}
