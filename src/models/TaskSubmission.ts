/**
 * TaskSubmission — one student's hand-in for one task.
 *
 * ## Why not `Submission`
 *
 * `Submission` is the graded artefact: it carries a mark out of `maxMarks`,
 * feedback, an evaluator, an assignment id and a course id, and its existence
 * is what unlocks the next course. A task hand-in has none of that — nothing is
 * marked, nothing unlocks. Reusing that collection would have meant a row with
 * a null assignment, a null course and a permanently null score, and every
 * marksheet query would have had to learn to exclude it. So: its own
 * collection, exactly as `Task` is its own collection next to `Assignment`.
 *
 * ## One row per student per task, updated in place
 *
 * The unique index is the rule. Handing in again replaces the row rather than
 * appending, and the action deletes the file it replaced from Cloudinary — a
 * history of superseded attempts is something nobody on this side reads, and
 * keeping the assets would grow the account forever.
 *
 * A program task's hand-ins are found by `taskId` alone; there is no fan-out
 * row waiting for a student who has not submitted, because "has not submitted"
 * is the absence of a row. That is what lets the staff screen count hand-ins
 * against the *live* enrolment rather than against a roster frozen at write
 * time — the same reasoning that keeps `Task` one row per cohort.
 *
 * ## `url` is where the work is, whichever way it arrived
 *
 * Uploaded or pasted, one field, so everything that renders a hand-in renders
 * one thing. `file` is set only for an upload and carries the `publicId` — the
 * handle without which the asset could never be deleted.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { TASK_SUBMISSION_KINDS } from "@/lib/tasks/submission-kinds";

import { uploadedFileSchema } from "./uploaded-file-schema";

const taskSubmissionSchema = new Schema(
  {
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true, index: true },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /**
     * Denormalised from the task, so "everything this student handed in on this
     * program" is one query and the scope check on a read has something to
     * check without loading the task first.
     */
    programId: { type: Schema.Types.ObjectId, ref: "Program", required: true },

    kind: { type: String, enum: TASK_SUBMISSION_KINDS, required: true },
    url: { type: String, required: true, trim: true, maxlength: 2000 },
    /** Set only when the work was uploaded here. Null for a pasted link. */
    file: { type: uploadedFileSchema, default: null },
    /** The student's own note back. Not the teacher's — that is on the task. */
    note: { type: String, default: "", trim: true, maxlength: 600 },
    submittedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// One hand-in per student per task; resubmitting upserts against this.
taskSubmissionSchema.index({ taskId: 1, studentId: 1 }, { unique: true });

export type TaskSubmissionDocument = InferSchemaType<typeof taskSubmissionSchema>;

export const TaskSubmission: Model<TaskSubmissionDocument> =
  (models.TaskSubmission as Model<TaskSubmissionDocument>) ??
  model<TaskSubmissionDocument>("TaskSubmission", taskSubmissionSchema);
