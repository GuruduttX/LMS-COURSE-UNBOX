/**
 * Submission — one student's hand-in for one assignment.
 *
 * ## An upload, or a link
 *
 * `fileUrl` is where the work is, whichever way it got there, so everything
 * that reads a hand-in reads one field. `file` is set as well when the student
 * uploaded rather than pasted: it carries the `publicId`, which is what makes
 * the asset deletable when they hand in again.
 *
 * Pasting stays because **ZIP archives are not uploaded to Cloudinary** — an
 * assignment that accepts a zip has to accept a link to one. The known failure
 * mode there is a Drive link left on "restricted", which no validation can
 * detect; only the copy on the submit form can warn about it.
 *
 * ## Handing in is what gates; the mark is not
 *
 * A `Submission` row existing at all is what unlocks the next course, because
 * an unresponsive teacher would otherwise freeze a whole cohort at a course
 * boundary. The mark lands on the marksheet whenever it arrives. See
 * `ASSIGNMENT_GATE_REQUIRES_MARK`.
 *
 * ## Handing in is final, unless a teacher asks for it again
 *
 * One row per student per assignment (the unique index). Once a hand-in exists
 * the student cannot replace it: `submitAssignment` only writes over a row whose
 * status is `resubmission_requested`, and only a teacher's action sets that.
 * See `lib/curriculum/submission-status.ts` for the whole cycle.
 *
 * ## The top level is the current version; `history` is every earlier one
 *
 * Every screen that reads a hand-in reads the top-level fields, exactly as it
 * did before versions existed — so a row written before this change is simply
 * version 1 with no history (`version` and `history` are read with `?? 1` and
 * `?? []`, because `lean()` does not apply defaults to old documents).
 *
 * When a teacher requests a resubmission the current version — file, note, and
 * any mark it was given — is copied into `history` along with the request, and
 * the top-level mark is cleared: an old mark against work being redone is worse
 * than no mark. When the student hands in again the top level is overwritten
 * and `version` goes up. Superseded files are **kept**, because history points
 * at them.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { ASSIGNMENT_MAX } from "@/lib/curriculum/rules";
import { SUBMISSION_FORMATS } from "@/lib/curriculum/submission-formats";
import { SUBMISSION_STATUSES } from "@/lib/curriculum/submission-status";

import { uploadedFileSchema } from "./uploaded-file-schema";

/** One superseded version, frozen when a teacher sent it back. */
const submissionVersionSchema = new Schema(
  {
    version: { type: Number, required: true },
    fileUrl: { type: String, required: true, trim: true, maxlength: 500 },
    file: { type: uploadedFileSchema, default: null },
    format: { type: String, enum: SUBMISSION_FORMATS, required: true },
    note: { type: String, default: "", trim: true, maxlength: 600 },
    submittedAt: { type: Date, required: true },
    /** The mark this version had when it was sent back, if it had been marked. */
    scored: { type: Number, default: null },
    maxMarks: { type: Number, default: ASSIGNMENT_MAX },
    feedback: { type: String, default: "", trim: true, maxlength: 2000 },
    evaluatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    evaluatedAt: { type: Date, default: null },
    resubmissionReason: { type: String, default: "", trim: true, maxlength: 1000 },
    resubmissionRequestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    resubmissionRequestedAt: { type: Date, required: true },
  },
  { _id: false },
);

const submissionSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
    },
    /** Denormalised so a marksheet reads a whole program in one query. */
    programId: { type: Schema.Types.ObjectId, ref: "Program", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },

    fileUrl: { type: String, required: true, trim: true, maxlength: 500 },
    /** Set only when the work was uploaded here. Null for a pasted link. */
    file: { type: uploadedFileSchema, default: null },
    format: { type: String, enum: SUBMISSION_FORMATS, required: true },
    note: { type: String, default: "", trim: true, maxlength: 600 },
    submittedAt: { type: Date, required: true },

    status: {
      type: String,
      enum: SUBMISSION_STATUSES,
      default: "submitted",
    },
    /** 1 for the first hand-in, +1 for each resubmission. */
    version: { type: Number, default: 1 },
    /**
     * The open request, while `status` is `resubmission_requested`; null
     * otherwise. A copy also lands on the history entry, so it outlives the
     * resubmission that answers it.
     */
    resubmission: {
      type: new Schema(
        {
          reason: { type: String, default: "", trim: true, maxlength: 1000 },
          requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
          requestedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    history: { type: [submissionVersionSchema], default: [] },
    /** Null until marked. Renders as an em dash, never a zero. */
    scored: { type: Number, default: null },
    /** Copied from the assignment at submission, so a later change to the
     *  assignment can't silently rescale a mark already given. */
    maxMarks: { type: Number, default: ASSIGNMENT_MAX },
    feedback: { type: String, default: "", trim: true, maxlength: 2000 },
    evaluatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    evaluatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One hand-in per student per assignment. This is also what makes the first
// hand-in race-safe: two concurrent inserts cannot both land.
submissionSchema.index({ studentId: 1, assignmentId: 1 }, { unique: true });
// The teacher's grading queue: "unmarked work on my courses".
submissionSchema.index({ courseId: 1, status: 1, submittedAt: 1 });

export type SubmissionDocument = InferSchemaType<typeof submissionSchema>;

export const Submission: Model<SubmissionDocument> =
  (models.Submission as Model<SubmissionDocument>) ??
  model<SubmissionDocument>("Submission", submissionSchema);
