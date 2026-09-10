/**
 * Subtopic — the atom of the curriculum, and one learning screen.
 *
 * Four things a student can be doing, three of which live here:
 *
 * | kind    | What it is                | What it stores            |
 * |---------|---------------------------|---------------------------|
 * | `video` | A recorded lecture        | An uploaded Bunny video, or a hosted URL |
 * | `text`  | Written material to read  | Markdown                  |
 * | `pdf`   | A document to read or keep | An uploaded PDF on Cloudinary |
 * | `quiz`  | MCQ practice              | Questions, graded instantly |
 *
 * (The fourth, a module test, is an `Assessment` — it belongs to the module
 * rather than sitting in the topic list.)
 *
 * ## Two ways to hold a video, and why both stay
 *
 * `video` is an uploaded file: a teacher picks it in the authoring form, the
 * browser sends it to Bunny Stream, and Bunny encodes a quality ladder and
 * serves it through its own player. That is the path new lessons take.
 *
 * `videoUrl` is the older one — a link to a video hosted wherever the teacher
 * already kept it (YouTube, Drive, a file on a server). It is kept because
 * lessons already point at such links and because Bunny is optional: with no
 * keys configured the uploader is hidden and pasting a link is still the whole
 * feature. `video` wins when both are set; see `VideoStage`.
 *
 * ## Why the kind-specific fields are all optional
 *
 * Mongoose can't express "required, but only when kind is video" on a single
 * document without discriminators, and splitting one collection three ways to
 * satisfy the schema would be the tail wagging the dog. The rule lives in
 * `validation/curriculum.ts` instead, where the form and the action share it —
 * and where it can say the more useful thing: a draft may be incomplete, and
 * publishing is the moment the content must actually be there.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { SUBTOPIC_KINDS } from "@/lib/curriculum/kinds";
import { NODE_STATUSES } from "@/lib/curriculum/rules";
import { bunnyVideoSchema } from "./bunny-video-schema";
import { questionSchema } from "./question-schema";
import { uploadedFileSchema } from "./uploaded-file-schema";

const subtopicSchema = new Schema(
  {
    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      required: true,
      index: true,
    },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    moduleId: { type: Schema.Types.ObjectId, ref: "Module", required: true },
    topicId: {
      type: Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
      index: true,
    },
    key: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    kind: { type: String, enum: SUBTOPIC_KINDS, required: true },
    order: { type: Number, required: true },
    status: { type: String, enum: NODE_STATUSES, default: "draft" },

    /* kind === "video" */
    /**
     * An uploaded video on Bunny Stream, or null. See the note above: this and
     * `videoUrl` are the two ways a lesson can hold a video, and this one wins.
     */
    video: { type: bunnyVideoSchema, default: null },
    /** A hosted URL — the fallback when nothing was uploaded. */
    videoUrl: { type: String, default: "", trim: true, maxlength: 500 },
    /**
     * Runtime in seconds. Entered by the teacher for a pasted link; overwritten
     * with Bunny's own measurement once an uploaded video finishes encoding,
     * because that number is right and a typed one is a guess.
     */
    seconds: { type: Number, default: 0 },
    /** Kept, still unrendered — for when a real transcript panel lands. */
    caption: { type: String, default: "", trim: true, maxlength: 500 },

    /* kind === "text" */
    body: { type: String, default: "", maxlength: 40_000 },
    /** Derived from the word count on save, so a listing needn't load bodies. */
    readMinutes: { type: Number, default: 0 },

    /* kind === "pdf" */
    /**
     * The lesson document, uploaded to Cloudinary.
     *
     * This used to be `pdfUrl`, a link to a file the teacher had put somewhere
     * else, because there was no file storage. There is now — the same signed
     * upload a module's study material uses — so the field holds an
     * `UploadedFile` and not a URL. The difference that matters is `publicId`:
     * a record carrying only a URL is an asset nobody can ever delete, and a
     * pasted Drive link could always be revoked, moved, or set to "restricted"
     * without anything here noticing.
     *
     * The student screen embeds it and offers the same file as a download,
     * which is all a browser needs to do both.
     */
    pdf: { type: uploadedFileSchema, default: null },

    /* kind === "quiz" */
    questions: { type: [questionSchema], default: [] },

    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// The sidebar reads a topic's subtopics in order; the learning screen's
// prev/next walks a whole module the same way.
subtopicSchema.index({ topicId: 1, order: 1 });
subtopicSchema.index({ moduleId: 1, order: 1 });
// A student's whole-program read wants only what is published.
subtopicSchema.index({ programId: 1, status: 1 });
// The Bunny webhook arrives knowing only a GUID and has to find its subtopic.
// Sparse: only video subtopics that were uploaded have the field at all.
subtopicSchema.index({ "video.videoId": 1 }, { sparse: true });

export type SubtopicDocument = InferSchemaType<typeof subtopicSchema>;

export const Subtopic: Model<SubtopicDocument> =
  (models.Subtopic as Model<SubtopicDocument>) ??
  model<SubtopicDocument>("Subtopic", subtopicSchema);
