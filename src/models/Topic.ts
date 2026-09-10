/**
 * Topic — a heading inside a module, rendered as an accordion in the sidebar.
 *
 * The one level of the tree with no graded work of its own: it exists to group
 * subtopics, and its status is entirely derived from them.
 *
 * `number` is recomputed from `order` on reorder, as on Module.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { NODE_STATUSES } from "@/lib/curriculum/rules";

const topicSchema = new Schema(
  {
    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      required: true,
      index: true,
    },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    moduleId: {
      type: Schema.Types.ObjectId,
      ref: "Module",
      required: true,
      index: true,
    },
    key: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    number: { type: Number, required: true },
    order: { type: Number, required: true },
    status: { type: String, enum: NODE_STATUSES, default: "draft" },
  },
  { timestamps: true },
);

topicSchema.index({ moduleId: 1, order: 1 });

export type TopicDocument = InferSchemaType<typeof topicSchema>;

export const Topic: Model<TopicDocument> =
  (models.Topic as Model<TopicDocument>) ??
  model<TopicDocument>("Topic", topicSchema);
