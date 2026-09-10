/**
 * One uploaded asset, embedded wherever a document is attached to a record.
 *
 * Shared rather than repeated — an assignment's brief and a student's hand-in
 * are the same shape, and two copies of it would be two places for the field
 * list to drift. (Same reasoning as `question-schema.ts`.)
 *
 * `_id: false` because it is a value, not a row: there is never a reason to
 * address the file separately from the document holding it.
 *
 * `publicId` is the field that matters most. It is Cloudinary's handle, and
 * without it the asset can never be deleted — a record carrying only a URL is a
 * file nobody can ever clean up. The shape matches `UploadedFile` in
 * `lib/uploads/kinds.ts`, which is what the upload field produces.
 */
import { Schema } from "mongoose";

import { FILE_KINDS } from "@/lib/uploads/kinds";

export const uploadedFileSchema = new Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, required: true, trim: true },
    resourceType: { type: String, enum: ["image", "raw"], required: true },
    kind: { type: String, enum: FILE_KINDS, required: true },
    /** The name the uploader chose — what a reader sees and downloads as. */
    name: { type: String, required: true, trim: true, maxlength: 260 },
    bytes: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);
