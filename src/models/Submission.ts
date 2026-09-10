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
 * ## Resubmitting clears the mark
 *
 * One row per student per assignment (the unique index), updated in place. A
 * resubmission drops `status` back to `submitted` and nulls the score — keeping
 * an old mark against new work would be worse than having no mark at all — and
 * the file it replaces is deleted from Cloudinary by the action that wrote it.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { ASSIGNMENT_MAX } from "@/lib/curriculum/rules";
import { SUBMISSION_FORMATS } from "@/lib/curriculum/submission-formats";

import { uploadedFileSchema } from "./uploaded-file-schema";

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
      enum: ["submitted", "evaluated"],
      default: "submitted",
    },
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

// One hand-in per student per assignment; a resubmission upserts against this.
submissionSchema.index({ studentId: 1, assignmentId: 1 }, { unique: true });
// The teacher's grading queue: "unmarked work on my courses".
submissionSchema.index({ courseId: 1, status: 1, submittedAt: 1 });

export type SubmissionDocument = InferSchemaType<typeof submissionSchema>;

export const Submission: Model<SubmissionDocument> =
  (models.Submission as Model<SubmissionDocument>) ??
  model<SubmissionDocument>("Submission", submissionSchema);
