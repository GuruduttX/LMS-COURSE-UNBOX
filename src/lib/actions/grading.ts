"use server";

/**
 * Marking a hand-in, or sending it back — the writes that close the assignment
 * loop.
 *
 * Everything around `markSubmission` existed and nothing wrote it: the
 * `Submission` model's `scored` / `feedback` / `evaluatedBy` / `evaluatedAt`,
 * the `{ courseId, status, submittedAt }` index labelled "the teacher's grading
 * queue", the `submission.grade` capability the teacher role already holds,
 * `validateGrade` in `validation/curriculum.ts`, and the note on the assignment
 * builder promising that "hand-ins are marked from the course's submissions
 * screen". This is that write.
 *
 * `requestResubmission` is the teacher's other answer to a hand-in, and the
 * **only** thing in the app that lets a student hand in again. See
 * `lib/curriculum/submission-status.ts`.
 *
 * The house order, in full, for both:
 *
 *   requireRole (who) → can (what kind) → assertScope + ownsBatch (which one)
 *   → validate (what) → write → audit → revalidate
 *
 * **`assertScope` alone is not enough here.** It narrows to a program, and a
 * teacher's real scope is a cohort inside one — so a teacher holding the
 * evening batch must not be able to mark the morning batch's work by posting
 * its submission id. `ownsBatch` is the check that says so, and it is done
 * against the student's *enrolment*, which is where the cohort actually lives.
 *
 * A server action is its own front door: the submission id in the form is a
 * claim, and everything above is re-derived from the database rather than
 * trusted from the post.
 */
import { revalidatePath } from "next/cache";
import { Types } from "mongoose";

import { writeAudit } from "@/lib/auth/audit";
import { ownsBatch, requireRole, type CurrentUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { connectToDatabase } from "@/lib/db";
import {
  hasErrors,
  validateGrade,
  validateResubmissionRequest,
  type GradeInput,
  type ResubmissionInput,
} from "@/lib/validation/curriculum";
import { Assignment } from "@/models/Assignment";
import { Enrollment } from "@/models/Enrollment";
import { Program } from "@/models/Program";
import { Submission } from "@/models/Submission";
import { User } from "@/models/User";

import type {
  GradeFormState,
  ResubmissionFormState,
} from "./curriculum-state";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Every refusal that isn't a field error reads the same, on purpose. */
const NOT_YOURS =
  "That hand-in isn't yours to mark. Reload the page and try again.";

const AWAITING_RESUBMISSION =
  "This hand-in was sent back for a resubmission. It can be marked once the student hands in again.";

const CHANGED =
  "This hand-in changed while you had it open. Reload the page and try again.";

/**
 * The hand-in named by a form post, if this person may act on it.
 *
 * Shared by both writes so that "may this teacher touch this submission" has
 * one answer. `null` for every kind of no — a bad id, a missing row, another
 * cohort — because the form shows one sentence for all of them.
 */
async function loadInScope(actor: CurrentUser, formData: FormData) {
  if (!can(actor, "submission.grade")) return null;

  const id = text(formData, "submissionId");
  if (!Types.ObjectId.isValid(id)) return null;

  await connectToDatabase();

  const submission = await Submission.findById(id).lean();
  if (!submission) return null;

  const program = await Program.findById(submission.programId, {
    slug: 1,
  }).lean();
  if (!program) return null;

  /**
   * The cohort check, read from the enrolment.
   *
   * `ownsBatch` rather than `assertScope({ batch })` for the reason spelled out
   * beside it in guards.ts: a student with no batch (`""`) belongs to no
   * cohort, so no cohort's teacher may claim them — the opposite default from a
   * *session* with no batch, which is program-wide and everybody's. And a plain
   * return rather than `notFound()`, because this is a form post and the answer
   * has to reach the form.
   */
  const enrollment = await Enrollment.findOne(
    { programId: submission.programId, studentId: submission.studentId },
    { batch: 1 },
  ).lean();

  if (!enrollment || !ownsBatch(actor, program.slug, enrollment.batch ?? "")) {
    return null;
  }

  return { submission, program };
}

/**
 * Four surfaces show a hand-in's state, so all four are revalidated.
 *
 * The student's two are the point — the curriculum row and the marksheet both
 * read the same `Submission`, and a mark (or a request to redo the work) the
 * teacher has given but the student cannot see is the bug this exists to fix.
 */
function revalidateHandIn(programSlug: string) {
  revalidatePath("/teacher/grading");
  revalidatePath("/teacher");
  revalidatePath(`/dashboard/${programSlug}/course_details`);
  revalidatePath(`/dashboard/${programSlug}/marksheet`);
}

export async function markSubmission(
  _previous: GradeFormState,
  formData: FormData,
): Promise<GradeFormState> {
  // `requireRole("teacher")` admits an admin by the superset rule, which is
  // right. `loadInScope` says the narrower thing: whoever got in holds *this*
  // power, over *this* student.
  const actor = await requireRole("teacher");

  const values: GradeInput = {
    scored: text(formData, "scored"),
    feedback: text(formData, "feedback"),
  };

  const scoped = await loadInScope(actor, formData);
  if (!scoped) return { ok: false, values, errors: {}, error: NOT_YOURS };
  const { submission, program } = scoped;

  // There is no work to mark: the version it would land on was sent back.
  if (submission.status === "resubmission_requested") {
    return { ok: false, values, errors: {}, error: AWAITING_RESUBMISSION };
  }

  // The maximum frozen onto the hand-in, never the assignment's current one:
  // marking out of a number the student was not shown is how a mark stops
  // meaning what the marksheet prints. Same reason it was copied there.
  const errors = validateGrade(values, submission.maxMarks);
  if (hasErrors(errors)) return { ok: false, values, errors };

  const now = new Date();

  // Re-checked in the write, so a resubmission request landing between the
  // read above and this line cannot have a mark written over it.
  const result = await Submission.updateOne(
    { _id: submission._id, status: { $ne: "resubmission_requested" } },
    {
      $set: {
        scored: Number(values.scored),
        feedback: values.feedback.trim(),
        status: "evaluated",
        evaluatedBy: actor.id,
        evaluatedAt: now,
      },
    },
  );

  if (result.matchedCount === 0) {
    return { ok: false, values, errors: {}, error: AWAITING_RESUBMISSION };
  }

  const [student, assignment] = await Promise.all([
    User.findById(submission.studentId, { name: 1 }).lean(),
    Assignment.findById(submission.assignmentId, { title: 1 }).lean(),
  ]);

  await writeAudit(actor, {
    action: "submission.grade",
    targetType: "submission",
    targetId: String(submission._id),
    summary: `Marked ${assignment?.title ?? "an assignment"} for ${
      student?.name ?? "a student"
    } — ${Number(values.scored)}/${submission.maxMarks}`,
    meta: {
      programSlug: program.slug,
      assignmentId: String(submission.assignmentId),
      studentId: String(submission.studentId),
      scored: Number(values.scored),
      maxMarks: submission.maxMarks,
      version: submission.version ?? 1,
      // The mark this replaced, when there was one. A regrade is the case an
      // audit log exists for, and "it changed" is useless without the before.
      previousScored: submission.scored ?? null,
    },
  });

  revalidateHandIn(program.slug);

  return { ok: true, values, errors: {} };
}

/**
 * Send a hand-in back: the student may hand in once more.
 *
 * The current version — its file, its note, and its mark and feedback if it had
 * been marked — is copied into `history` together with the request, and the
 * top-level mark is cleared. Nothing the student handed in is destroyed, and
 * the history can always say which version was marked, and what for.
 *
 * Allowed from `submitted` or `evaluated`, so a teacher can send back work they
 * have not marked ("wrong file") as well as work they have. Not from
 * `resubmission_requested`: the student has not answered the last one yet.
 *
 * The write is conditional on the row being exactly as it was read
 * (`updatedAt`), so a mark saved in another tab between the read and this
 * write is not silently left out of the snapshot.
 */
export async function requestResubmission(
  _previous: ResubmissionFormState,
  formData: FormData,
): Promise<ResubmissionFormState> {
  const actor = await requireRole("teacher");

  const values: ResubmissionInput = { reason: text(formData, "reason") };

  const scoped = await loadInScope(actor, formData);
  if (!scoped) return { ok: false, values, errors: {}, error: NOT_YOURS };
  const { submission, program } = scoped;

  if (submission.status === "resubmission_requested") {
    return {
      ok: false,
      values,
      errors: {},
      error: "A resubmission has already been requested for this hand-in.",
    };
  }

  const errors = validateResubmissionRequest(values);
  if (hasErrors(errors)) return { ok: false, values, errors };

  const reason = values.reason.trim();
  const version = submission.version ?? 1;
  const now = new Date();
  const actorId = new Types.ObjectId(actor.id);

  const result = await Submission.updateOne(
    {
      _id: submission._id,
      status: submission.status,
      updatedAt: submission.updatedAt,
    },
    {
      $push: {
        history: {
          version,
          fileUrl: submission.fileUrl,
          file: submission.file ?? null,
          format: submission.format,
          note: submission.note ?? "",
          submittedAt: submission.submittedAt,
          scored: submission.scored ?? null,
          maxMarks: submission.maxMarks,
          feedback: submission.feedback ?? "",
          evaluatedBy: submission.evaluatedBy ?? null,
          evaluatedAt: submission.evaluatedAt ?? null,
          resubmissionReason: reason,
          resubmissionRequestedBy: actorId,
          resubmissionRequestedAt: now,
        },
      },
      $set: {
        status: "resubmission_requested",
        // Written out, not left to the default: a row from before versions
        // existed has no `version`, and the resubmission's `$inc` needs one.
        version,
        // Work being redone carries no mark. The one it had is in history.
        scored: null,
        feedback: "",
        evaluatedBy: null,
        evaluatedAt: null,
        resubmission: { reason, requestedBy: actorId, requestedAt: now },
      },
    },
  );

  if (result.matchedCount === 0) {
    return { ok: false, values, errors: {}, error: CHANGED };
  }

  const [student, assignment] = await Promise.all([
    User.findById(submission.studentId, { name: 1 }).lean(),
    Assignment.findById(submission.assignmentId, { title: 1 }).lean(),
  ]);

  await writeAudit(actor, {
    action: "submission.requestResubmission",
    targetType: "submission",
    targetId: String(submission._id),
    summary: `Asked ${student?.name ?? "a student"} to resubmit ${
      assignment?.title ?? "an assignment"
    }`,
    meta: {
      programSlug: program.slug,
      assignmentId: String(submission.assignmentId),
      studentId: String(submission.studentId),
      version,
      reason,
      // Sending back marked work takes the mark off the marksheet; the log
      // should say what was taken.
      previousScored: submission.scored ?? null,
    },
  });

  revalidateHandIn(program.slug);

  return { ok: true, values, errors: {} };
}
