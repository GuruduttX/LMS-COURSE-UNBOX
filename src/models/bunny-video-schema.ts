/**
 * One uploaded lesson video, embedded on the subtopic that owns it.
 *
 * Its own file for the same reason as `uploaded-file-schema.ts`: it is a value
 * with a shape, and a second copy of that shape is a second place for it to
 * drift. `_id: false` because it is never addressed apart from its subtopic.
 *
 * `videoId` is the field that matters most — it is Bunny's handle, and a record
 * carrying anything less is a video nobody can ever delete or play.
 *
 * `status` is a **cache**, not the truth. Bunny owns the encoding state; this
 * is the last thing it told us, written by the webhook or by the authoring
 * form's poll. It exists so a student's page can say "still encoding" without
 * an API call on every render, and it is allowed to be briefly stale.
 *
 * The shape matches `StoredVideo` in `lib/video/shared.ts`, which is what the
 * upload field produces and what the validator re-checks.
 */
import { Schema } from "mongoose";

import { VIDEO_STATUSES } from "@/lib/video/shared";

export const bunnyVideoSchema = new Schema(
  {
    /** Bunny's GUID for the video. */
    videoId: { type: String, required: true, trim: true },
    /**
     * Which library it lives in. Stored rather than read from the environment
     * at play time, so an old video keeps pointing at the library it was
     * actually uploaded to if the app is ever re-pointed at a new one.
     */
    libraryId: { type: String, required: true, trim: true },
    status: { type: String, enum: VIDEO_STATUSES, default: "processing" },
    /** Runtime as Bunny measured it. 0 until encoding finishes. */
    seconds: { type: Number, default: 0, min: 0 },
    /** The teacher's filename — shown in the staff panel, never to students. */
    name: { type: String, required: true, trim: true, maxlength: 260 },
    bytes: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);
