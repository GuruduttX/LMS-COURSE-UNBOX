/**
 * Task — something a teacher or an admin tells students to go and do.
 *
 * Deliberately **not** an `Assignment`. An assignment is a graded artefact
 * inside the curriculum tree: it hangs off a course, it has a maximum mark, a
 * hand-in and a `Submission` row, and finishing every one of a course's
 * assignments is half of what unlocks the next course. A task is none of that.
 * It is an instruction — "read this brief before Thursday", "set your Meta
 * Business Suite up", "fix the tracking on your landing page" — with a document
 * and some links attached. Nothing is marked, nothing is unlocked, and nothing
 * in the tree moves because of one.
 *
 * Bolting the two together would have meant an assignment with a null mark, a
 * null course and a null hand-in — three nullable fields whose combination has
 * to be checked everywhere the graded path reads. So: its own collection.
 *
 * ## Audience: one row, however many students
 *
 * Three widths, narrowest last. `"program"` is everyone enrolled; `"batch"` is
 * one cohort, and then `batch` names it; `"student"` is one person, and then
 * `studentId` names them. None of them is fanned out — a task is **one row**
 * whatever its audience, and who receives it is derived from the live
 * `Enrollment` rows at read time, exactly as attendance percentages and batch
 * occupancy are. Fanning it out would mean a student enrolled tomorrow silently
 * misses a task their cohort has, and a withdrawn student keeps one.
 *
 * **Why `"batch"` exists at all:** a teacher is assigned to cohorts, not to a
 * program (see models/User.ts), so "everyone on this program" is wider than
 * their own scope — it would reach another teacher's students on a program the
 * two share. The composer therefore offers a teacher their cohorts and defaults
 * to the one they take; `"program"` stays for the admin, and for a teacher who
 * genuinely holds every batch.
 *
 * A task always names a program even when it is for one cohort or one student:
 * that is what `assertScope` checks against, and a task belonging to nothing is
 * a task no scope check can be written for.
 *
 * ## No draft state, unlike the curriculum
 *
 * A subtopic is drafted over several sittings, so it starts unpublished. A task
 * is written in one go and is closer to a `LiveSession` than to a lesson — it
 * exists to be seen. Created is live; the way to unsay one is to delete it.
 *
 * ## Handing work back: `submission`
 *
 * A task may ask for something back — a document, an image, a link — or for
 * nothing at all, which is still the common case ("read this before Thursday").
 * `submission.kinds` empty **is** "nothing to hand in": one field answering
 * both "is anything expected" and "what", rather than a boolean that can
 * disagree with a list. What comes back is a `TaskSubmission` row, one per
 * student, never stored here — a program task has as many hand-ins as it has
 * recipients.
 *
 * `submission.note` is written by whoever set the task and shown to the student
 * **immediately above the field they submit into**, which is why it lives with
 * the kinds rather than being folded into `description`: it is the instruction
 * that has to be read at the moment of handing in ("name the file with your
 * student number"), not the one read when the task is opened.
 *
 * ## Completion is a decision, not a count
 *
 * `completedAt` is set by a teacher or an admin pressing a button, and that is
 * the only thing that makes a task complete. Deriving it from the hand-ins —
 * "complete when everyone has submitted" — would mean a task nobody can ever
 * finish as soon as one student goes quiet, and would leave a task that asks
 * for nothing permanently incomplete. Staff know when a thing is done; the
 * counts on the card inform that judgement rather than replacing it.
 *
 * ## `document` and `links`
 *
 * The whole attachment story, and both optional. `document` is an embedded
 * `UploadedFile` rather than a URL string for the reason every file in this
 * codebase is: without the `publicId` it is an asset nobody can ever delete.
 * `links` are typed by whoever wrote the task and point anywhere on the web —
 * they are stored as given and only ever rendered as an external link.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { TASK_AUDIENCES, type TaskAudience } from "@/lib/tasks/audiences";
import { TASK_SUBMISSION_KINDS } from "@/lib/tasks/submission-kinds";

import { uploadedFileSchema } from "./uploaded-file-schema";

// Defined in lib/tasks/audiences.ts and re-exported here, so the enum this
// schema validates against and the one the composer's validator checks are the
// same list — and so that importing the list does not import Mongoose. Every
// existing `from "@/models/Task"` import keeps working.
export { TASK_AUDIENCES, type TaskAudience };

/** A resource the task points at. The label is what a student reads. */
const taskLinkSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 120 },
    url: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { _id: false },
);

/**
 * What is expected back. Embedded rather than three loose fields on the task,
 * so "does this ask for anything" is one object to read and one to default.
 */
const taskSubmissionSpecSchema = new Schema(
  {
    kinds: {
      type: [{ type: String, enum: TASK_SUBMISSION_KINDS }],
      default: [],
    },
    /** Shown directly above the student's submission field. */
    note: { type: String, default: "", trim: true, maxlength: 600 },
  },
  { _id: false },
);

const taskSchema = new Schema(
  {
    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      required: true,
      index: true,
    },
    audience: { type: String, enum: TASK_AUDIENCES, required: true },
    /**
     * Set only when `audience` is `"batch"`, and then it is a `Batch.name` on
     * this program — the same key `Enrollment.batch` carries, so the recipient
     * query is a string comparison rather than a join. Empty otherwise, which
     * is also what every task written before batches existed reads as: those
     * are `audience: "program"` and their emptiness means nothing.
     *
     * A rename cascades; see `renameBatchEverywhere` in
     * app/manager/batches/actions.ts.
     */
    batch: { type: String, trim: true, default: "", maxlength: 80 },
    /**
     * Set only when `audience` is `"student"`. Null on a wider task rather
     * than absent, so "is this for one person" is one comparison everywhere.
     */
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    /** Plain text, rendered as paragraphs. Empty only when a document carries it. */
    description: { type: String, default: "", maxlength: 20_000 },
    /** The brief as a handed-out file. Null when there isn't one. */
    document: { type: uploadedFileSchema, default: null },
    links: { type: [taskLinkSchema], default: [] },
    /** What the student hands back, if anything. Empty `kinds` means nothing. */
    submission: { type: taskSubmissionSpecSchema, default: () => ({}) },
    /** Null until staff close the task. The only thing that means "done". */
    completedAt: { type: Date, default: null },
    completedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    /** The teacher or admin who set it. Named on the student's card. */
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

// The staff list and the student list are both "this program's tasks, newest
// first"; the student's read narrows the same index by audience.
taskSchema.index({ programId: 1, createdAt: -1 });

export type TaskDocument = InferSchemaType<typeof taskSchema>;

export const Task: Model<TaskDocument> =
  (models.Task as Model<TaskDocument>) ?? model<TaskDocument>("Task", taskSchema);
