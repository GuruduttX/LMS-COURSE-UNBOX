"use server";

/**
 * Setting and unsetting tasks.
 *
 * The house order in full: **requireRole → can() → assertScope → validate →
 * write → writeAudit → revalidate**.
 *
 * `requireRole("teacher")` admits teachers and admins and never a program
 * manager — the same line that is the whole of "a manager cannot change
 * content". `can(actor, "task.assign")` is the second half of it: were the
 * capability ever granted to another role, this file would not have to change,
 * and were it revoked from teachers, the nav item and the composer would
 * disappear along with the action's willingness to run.
 *
 * A server action is its own front door. Everything the composer decided —
 * which program, which student, what was attached — is re-derived here from the
 * database rather than trusted from the post, because anyone who can reach the
 * action reaches it with or without the form.
 */
import { revalidatePath } from "next/cache";
import { Types } from "mongoose";

import { writeAudit } from "@/lib/auth/audit";
import {
  assertScope,
  batchScopeFor,
  ownsBatch,
  requireRole,
} from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { connectToDatabase } from "@/lib/db";
import { destroyAsset } from "@/lib/uploads/cloudinary";
import { parseUploadedFiles, type UploadedFile } from "@/lib/uploads/kinds";
import {
  cleanLinks,
  parseLinks,
  parseSubmissionKinds,
  validateTask,
  type TaskInput,
} from "@/lib/validation/task";
import { Batch } from "@/models/Batch";
import { Enrollment } from "@/models/Enrollment";
import { Program } from "@/models/Program";
import { Task, type TaskAudience } from "@/models/Task";
import { TaskSubmission } from "@/models/TaskSubmission";
import { User } from "@/models/User";

import type { DeleteTaskState, TaskFormState } from "./task-state";

const DENIED = "You don't have permission to do that.";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Set a task.
 *
 * The two things worth reading twice:
 *
 * - **The document is re-checked, never trusted.** `parseUploadedFiles` verifies
 *   the URL is on Cloudinary's delivery host and the public id is under our own
 *   root in a known scope, so a forged post cannot store any URL on the internet
 *   as though we had hosted it.
 * - **An individual task's recipient must actually be on the program, and in a
 *   cohort the author teaches.** Without those checks the student id is a free
 *   field, and a teacher (or anyone posting the action) could aim a task at a
 *   student on somebody else's program, or at another teacher's cohort on a
 *   program they share — which would then appear on a dashboard the author has
 *   no scope over.
 * - **"Everyone on this program" is refused to a teacher who does not hold the
 *   whole program.** They are assigned to batches, so the widest thing they may
 *   address is one of those; a program-wide task from them would reach a
 *   colleague's students. The composer offers them `batch` instead, and this
 *   refuses the wider one however it was posted.
 */
export async function createTask(
  _previous: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const actor = await requireRole("teacher");

  const posted = text(formData, "audience");
  const audience: TaskAudience =
    posted === "student" ? "student" : posted === "batch" ? "batch" : "program";
  const links = parseLinks(text(formData, "links"));

  // The upload field posts JSON, and JSON from a browser is a claim.
  const uploaded = parseUploadedFiles(text(formData, "document"), [
    "pdf",
    "document",
    "image",
  ]);
  const document = uploaded.files[0] ?? null;

  const submissionKinds = parseSubmissionKinds(text(formData, "submissionKinds"));

  const values: TaskInput = {
    programSlug: text(formData, "programSlug"),
    audience,
    batch: audience === "batch" ? text(formData, "batch") : "",
    studentId: audience === "student" ? text(formData, "studentId") : "",
    title: text(formData, "title"),
    description: text(formData, "description"),
    hasDocument: Boolean(document),
    links,
    submissionKinds,
    submissionNote: text(formData, "submissionNote"),
  };

  if (!can(actor, "task.assign")) {
    return { ok: false, values, errors: { title: DENIED } };
  }

  const errors = validateTask(values);
  if (uploaded.error) errors.description = uploaded.error;
  if (Object.keys(errors).length > 0) return { ok: false, values, errors };

  assertScope(actor, { program: values.programSlug });

  await connectToDatabase();

  const program = await Program.findOne({ slug: values.programSlug })
    .select("_id title")
    .lean();
  if (!program) {
    return { ok: false, values, errors: { programSlug: "No such program." } };
  }

  // What this author may address. `null` is the whole program — an admin, or a
  // teacher assigned to every cohort of it.
  const scope = batchScopeFor(actor, values.programSlug);

  if (audience === "program" && scope !== null) {
    return {
      ok: false,
      values,
      errors: {
        audience:
          "You teach some of this program's batches, not all of them. Set this for one of your batches instead.",
      },
    };
  }

  let batch = "";
  let studentId: string | null = null;

  if (audience === "batch") {
    // The batch has to exist, because the name is the join key: a task on a
    // cohort that does not exist reaches nobody and says nothing about why.
    const row = await Batch.findOne({
      programSlug: values.programSlug,
      name: values.batch.trim(),
    })
      .select("name")
      .lean();
    if (!row) {
      return { ok: false, values, errors: { batch: "No such batch on this program." } };
    }

    // And it has to be one of theirs. The picker only offers those; this is the
    // half that holds when the post did not come from the picker.
    if (!ownsBatch(actor, values.programSlug, row.name)) {
      return { ok: false, values, errors: { batch: "You don't teach that batch." } };
    }

    batch = row.name;
  }

  if (audience === "student") {
    if (!Types.ObjectId.isValid(values.studentId)) {
      return { ok: false, values, errors: { studentId: "Pick the student this is for." } };
    }

    const enrollment = await Enrollment.findOne({
      studentId: values.studentId,
      programId: program._id,
      status: { $ne: "withdrawn" },
    })
      .select("batch")
      .lean();
    if (!enrollment) {
      return {
        ok: false,
        values,
        errors: { studentId: "That student isn't enrolled on this program." },
      };
    }

    // Enrolled is not enough once teachers are staffed per cohort: a program a
    // teacher shares with a colleague would otherwise let either of them set
    // work for the other's students.
    if (!ownsBatch(actor, values.programSlug, enrollment.batch ?? "")) {
      return {
        ok: false,
        values,
        errors: { studentId: "That student isn't in a batch you teach." },
      };
    }

    studentId = values.studentId;
  }

  const created = await Task.create({
    programId: program._id,
    audience,
    batch,
    studentId,
    title: values.title.trim(),
    description: values.description.trim(),
    document,
    links: cleanLinks(links),
    submission: {
      kinds: submissionKinds,
      // The note has nowhere to appear when nothing is asked for, and
      // `validateTask` has already refused that combination — dropping it here
      // as well means a row can never carry advice no screen will show.
      note: submissionKinds.length > 0 ? values.submissionNote.trim() : "",
    },
    createdBy: actor.id,
  });

  const recipient = studentId ? await nameOf(studentId) : null;

  await writeAudit(actor, {
    action: "task.create",
    targetType: "Task",
    targetId: String(created._id),
    summary:
      audience === "program"
        ? `Set task "${values.title.trim()}" for everyone on ${program.title}`
        : audience === "batch"
          ? `Set task "${values.title.trim()}" for ${batch} on ${program.title}`
          : `Set task "${values.title.trim()}" for ${recipient ?? "a student"} on ${program.title}`,
    meta: { programSlug: values.programSlug, audience, batch: batch || null, studentId },
  });

  revalidateTaskScreens(values.programSlug);

  return {
    ok: true,
    errors: {},
    // Program and audience survive the reset: setting several tasks on one
    // program in a row is the normal thing, and retyping the picker each time
    // would be the form fighting the person using it.
    values: {
      ...values,
      title: "",
      description: "",
      hasDocument: false,
      links: [],
      submissionKinds: [],
      submissionNote: "",
    },
    message:
      audience === "program"
        ? "Task set for everyone on this program."
        : audience === "batch"
          ? `Task set for ${batch}.`
          : `Task set for ${recipient ?? "the student"}.`,
  };
}

/**
 * Close a task, or reopen it.
 *
 * Completion is a judgement, not a count of hand-ins: a task can be done with
 * three of twelve submissions in (the rest gave up, or handed in on paper), and
 * a task that asks for nothing at all has no count to reach. So this is a
 * button, and the counts on the card inform the person pressing it.
 *
 * Reopening is the same action with the flag flipped rather than a second one —
 * closing by mistake is the likeliest way to use this wrongly, and an undo
 * living in a different code path is an undo that behaves differently.
 *
 * Deliberately **not** hidden from students: a completed task stays on their
 * screen, marked closed. Hiding it would make a task they never did quietly
 * vanish, which reads as forgiveness rather than as a record.
 */
export async function setTaskComplete(
  _previous: DeleteTaskState,
  formData: FormData,
): Promise<DeleteTaskState> {
  const actor = await requireRole("teacher");

  if (!can(actor, "task.assign")) return { ok: false, error: DENIED };

  const id = text(formData, "id");
  if (!Types.ObjectId.isValid(id)) return { ok: false, error: "No such task." };

  const complete = text(formData, "complete") === "true";

  await connectToDatabase();

  const task = await Task.findById(id)
    .select("_id title programId completedAt audience batch studentId")
    .lean();
  if (!task) return { ok: false, error: "No such task." };

  const program = await Program.findById(task.programId).select("slug title").lean();
  if (!program) return { ok: false, error: "No such task." };

  // The program the task is really on, not one the form claims — then the
  // cohort, because a shared program is no longer a shared task list.
  assertScope(actor, { program: program.slug });

  const refusal = await refuseOutsideCohort(actor, program.slug, task);
  if (refusal) return { ok: false, error: refusal };

  await Task.updateOne(
    { _id: task._id },
    complete
      ? { completedAt: new Date(), completedBy: actor.id }
      : { completedAt: null, completedBy: null },
  );

  await writeAudit(actor, {
    action: complete ? "task.complete" : "task.reopen",
    targetType: "Task",
    targetId: String(task._id),
    summary: `${complete ? "Completed" : "Reopened"} task "${task.title}" on ${program.title}`,
    meta: { programSlug: program.slug },
  });

  revalidateTaskScreens(program.slug, String(task._id));

  return { ok: true };
}

/**
 * Take a task back.
 *
 * Deleted, not archived — the codebase's usual "never delete" rule is about
 * records other things point at: an enrolment carries a student's history, a
 * session was planned around, a user owns work. Nothing points at a task and
 * nothing is derived from one, so a task set by mistake has no reason to stay
 * on a student's screen with a line through it.
 *
 * The attached document goes with it, **after** the row is gone: deleting the
 * file first and then failing to delete the row would leave a task pointing at
 * nothing, which is worse than an orphaned asset. Best effort, and logged.
 */
export async function deleteTask(
  _previous: DeleteTaskState,
  formData: FormData,
): Promise<DeleteTaskState> {
  const actor = await requireRole("teacher");

  if (!can(actor, "task.assign")) return { ok: false, error: DENIED };

  const id = text(formData, "id");
  if (!Types.ObjectId.isValid(id)) return { ok: false, error: "No such task." };

  await connectToDatabase();

  const task = await Task.findById(id).lean();
  if (!task) return { ok: false, error: "No such task." };

  const program = await Program.findById(task.programId).select("slug title").lean();
  if (!program) return { ok: false, error: "No such task." };

  // The program the task is really on, not one the form claims — then the
  // cohort, because a shared program is no longer a shared task list.
  assertScope(actor, { program: program.slug });

  const refusal = await refuseOutsideCohort(actor, program.slug, task);
  if (refusal) return { ok: false, error: refusal };

  /**
   * The hand-ins go with it. A `TaskSubmission` whose task is gone is
   * unreachable from every screen — there is nothing left to render it under —
   * so leaving the rows would only leave student uploads sitting in Cloudinary
   * that nothing can ever delete. They are read first, because after the delete
   * the public ids are gone with them.
   */
  const submissions = await TaskSubmission.find({ taskId: task._id })
    .select("file")
    .lean();

  await Task.deleteOne({ _id: task._id });
  await TaskSubmission.deleteMany({ taskId: task._id });

  await writeAudit(actor, {
    action: "task.delete",
    targetType: "Task",
    targetId: String(task._id),
    summary: `Deleted task "${task.title}" on ${program.title}${
      submissions.length > 0
        ? `, and ${submissions.length} hand-in${submissions.length === 1 ? "" : "s"}`
        : ""
    }`,
    meta: {
      programSlug: program.slug,
      audience: task.audience,
      submissions: submissions.length,
    },
  });

  await discardDocument(task.document as UploadedFile | null);
  for (const row of submissions) {
    await discardDocument((row.file as UploadedFile | null) ?? null);
  }

  revalidateTaskScreens(program.slug);

  return { ok: true };
}

async function discardDocument(file: UploadedFile | null): Promise<void> {
  if (!file?.publicId) return;

  try {
    await destroyAsset(file.publicId, file.resourceType);
  } catch (error) {
    console.error("[tasks] could not delete a task document:", error);
  }
}

/**
 * May this person act on this task — close it, reopen it, delete it?
 *
 * `assertScope` answers "is this program theirs", which was the whole question
 * while teachers were assigned to programs. It isn't any more: two teachers can
 * share a program and hold different cohorts, and neither should be able to
 * delete the other's work from a screen that lists both.
 *
 * Returns a message rather than throwing, because these actions report failure
 * in their state rather than 404ing — the task screen is the caller's own, and
 * the thing being refused is the button, not the page.
 */
async function refuseOutsideCohort(
  actor: Parameters<typeof batchScopeFor>[0],
  programSlug: string,
  task: {
    programId: Types.ObjectId;
    audience: string;
    batch?: string | null;
    studentId?: Types.ObjectId | null;
  },
): Promise<string | null> {
  const scope = batchScopeFor(actor, programSlug);
  // The whole program is theirs, so every task on it is.
  if (scope === null) return null;

  if (task.audience === "program") {
    return "This task was set for the whole program, which is wider than the batches you teach.";
  }

  if (task.audience === "batch") {
    return ownsBatch(actor, programSlug, task.batch ?? "")
      ? null
      : "This task was set for a batch you don't teach.";
  }

  // Scoped by program as well as student: somebody on three programs has three
  // enrolments, and only the one on *this* program says which cohort they sit
  // in here.
  const enrollment = task.studentId
    ? await Enrollment.findOne({
        studentId: task.studentId,
        programId: task.programId,
      })
        .select("batch")
        .lean()
    : null;

  return ownsBatch(actor, programSlug, enrollment?.batch ?? "")
    ? null
    : "This task was set for a student you don't teach.";
}

async function nameOf(studentId: string): Promise<string | null> {
  const person = await User.findById(studentId).select("name").lean();
  return person?.name ?? null;
}

/** Every screen a task shows on — both staff areas and the student's. */
function revalidateTaskScreens(programSlug: string, taskId?: string): void {
  revalidatePath("/admin/tasks");
  revalidatePath("/teacher/tasks");

  // The individual screens too, when the write was about one task: a hand-in
  // that does not appear on the page the teacher is already looking at reads as
  // a hand-in that did not arrive.
  if (taskId) {
    revalidatePath(`/admin/tasks/${taskId}`);
    revalidatePath(`/teacher/tasks/${taskId}`);
    revalidatePath(`/dashboard/${programSlug}/tasks/${taskId}`);
  }
  revalidatePath(`/dashboard/${programSlug}/tasks`);
  revalidatePath(`/dashboard/${programSlug}/overview`);
}
