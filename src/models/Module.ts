/**
 * Module — a chapter of a course, and what a module test is set on.
 *
 * `number` is the number a student sees ("Module 2"). It is recomputed from
 * `order` on every reorder rather than typed by the teacher, so the label can
 * never disagree with the position.
 *
 * Denormalises `programId` as well as `courseId`: a whole-program read fetches
 * every module in one query rather than one query per course.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { NODE_STATUSES } from "@/lib/curriculum/rules";
import { uploadedFileSchema } from "./uploaded-file-schema";

const moduleSchema = new Schema(
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
    /** Derived from `order`, stored so a listing doesn't have to recompute it. */
    number: { type: Number, required: true },
    order: { type: Number, required: true },
    status: { type: String, enum: NODE_STATUSES, default: "draft" },
    /**
     * The handout for the module as a whole — a reading, a deck, or a Word
     * document. Optional, and one file rather than a list: a module has *its*
     * material, and anything more granular belongs on the subtopic it explains.
     *
     * Held here rather than on Topic or Subtopic because it is what a student
     * takes away from the module, not from one lesson inside it.
     */
    material: { type: uploadedFileSchema, default: null },
    /**
     * What the material is called on screen. The uploaded filename is never
     * shown to a student — `Q3 notes FINAL v2 (1).pdf` is what it was called on
     * the teacher's laptop, not what the reading is. Required whenever a file
     * is attached; see `validateModule`.
     */
    materialTitle: { type: String, default: "", trim: true, maxlength: 140 },
  },
  { timestamps: true },
);

// The sidebar and the course panel both read "this course's modules, in order".
moduleSchema.index({ courseId: 1, order: 1 });

export type ModuleDocument = InferSchemaType<typeof moduleSchema>;

export const Module: Model<ModuleDocument> =
  (models.Module as Model<ModuleDocument>) ??
  model<ModuleDocument>("Module", moduleSchema);
