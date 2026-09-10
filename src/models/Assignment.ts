/**
 * Assignment — work a student hands in and a teacher marks.
 *
 * The only thing in the app a human grades. Every test is MCQ and grades itself
 * the instant it is submitted; an assignment is a file, and somebody has to
 * look at it.
 *
 * Course level, not module level: it is set against a whole course, and handing
 * in every one of a course's assignments is half of what unlocks the next
 * course (the other half being 50% on the final test).
 *
 * ## `acceptedFormats` is the requirement, in data
 *
 * The program's creator decides what a hand-in looks like — a zip of source
 * files, a PDF report, a screenshot, a Word document — and at least one must be
 * chosen. See `lib/curriculum/submission-formats.ts` for why that can only ever
 * be guidance rather than enforcement while submissions are links.
 *
 * ## `briefFile` — the brief as a document
 *
 * `brief` is the text a teacher types; `briefFile` is the PDF they hand out
 * alongside it (the marking rubric, the dataset description, the printed spec).
 * Either can stand alone: an assignment may be a paragraph, a PDF, or both.
 *
 * It is stored as an embedded document rather than a bare URL because deleting
 * needs the `publicId` — a record holding only a URL is a file nobody can ever
 * clean up out of Cloudinary. The sub-schema is shared with `Submission`, whose
 * hand-in files are the same shape.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { ASSIGNMENT_MAX, NODE_STATUSES } from "@/lib/curriculum/rules";
import { SUBMISSION_FORMATS } from "@/lib/curriculum/submission-formats";

import { uploadedFileSchema } from "./uploaded-file-schema";

const assignmentSchema = new Schema(
  {
    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      required: true,
      index: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    key: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    /** Markdown. What the student actually works from. */
    brief: { type: String, default: "", maxlength: 40_000 },
    /** The brief as a handed-out PDF. Null when there isn't one. */
    briefFile: { type: uploadedFileSchema, default: null },
    dueDate: { type: Date, default: null },
    maxMarks: { type: Number, default: ASSIGNMENT_MAX, min: 1, max: 500 },
    /** At least one — a student must be told what to hand in. */
    acceptedFormats: {
      type: [String],
      enum: SUBMISSION_FORMATS,
      default: ["pdf"],
    },
    order: { type: Number, required: true },
    status: { type: String, enum: NODE_STATUSES, default: "draft" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// The course panel and the gate both read "this course's assignments, in order".
assignmentSchema.index({ courseId: 1, order: 1 });

export type AssignmentDocument = InferSchemaType<typeof assignmentSchema>;

export const Assignment: Model<AssignmentDocument> =
  (models.Assignment as Model<AssignmentDocument>) ??
  model<AssignmentDocument>("Assignment", assignmentSchema);
