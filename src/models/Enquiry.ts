/**
 * Enquiry — a lead from the public site's "Apply now" / "Talk to a counsellor" form.
 *
 * Model files are guarded with `models.X ?? model(...)`: Next hot-reloads this
 * module and Mongoose throws OverwriteModelError if the same name is compiled twice.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const enquirySchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    program: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["new", "contacted", "enrolled", "closed"],
      default: "new",
      index: true,
    },
    /** Where the form was opened from — header CTA, hero, contact band. */
    source: { type: String, trim: true, default: "unknown" },
  },
  { timestamps: true },
);

// Counsellors work the newest leads first.
enquirySchema.index({ createdAt: -1 });

export type EnquiryDocument = InferSchemaType<typeof enquirySchema>;

export const Enquiry: Model<EnquiryDocument> =
  (models.Enquiry as Model<EnquiryDocument>) ??
  model<EnquiryDocument>("Enquiry", enquirySchema);
