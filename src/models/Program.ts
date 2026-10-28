/**
 * Program — the thing a student enrols in, and the root of the curriculum tree.
 *
 *   Program → Course → Module → Topic → Subtopic
 *
 * Five collections rather than one deeply nested document. A program tree is
 * six parallel `find()` calls assembled in memory, which is cheap, and — more
 * importantly — a single subtopic is directly addressable, which it would not
 * be sixteen levels inside an array. Every node below this one denormalises
 * `programId` so a whole-program read never has to walk down through parents.
 *
 * ## `slug` is the join key
 *
 * It is what `LiveSession.programSlug`, `User.assignments[].programSlug`, the
 * `ENROLLMENTS` seed and every `/dashboard/[course]` URL already speak, so it is
 * unique and never editable after creation.
 *
 * ## Where the marketing copy went
 *
 * It used to live in a `COURSES` array in `data/home.ts`, on the reasoning that
 * the public page must render without a database read of content only signed-in
 * students are entitled to. That reasoning was wrong in its premise: **a
 * published program's pitch and syllabus are not entitled content** — they are
 * the advertisement. What was actually entitled is the lesson material, and
 * `getProgramCurriculum` already filters by `status` at every level.
 *
 * What the array cost was worse than a read: it only ever held the four launch
 * programs, so the home page advertised courses that did not exist in the
 * database and hid every program created since through the admin UI.
 *
 * So the copy is `marketing` below, staff edit it on the Details screen, and
 * `data/home.ts` keeps only what has no database counterpart — the testimonials,
 * the FAQ, the educators.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { NODE_STATUSES, PROGRAM_LEVELS } from "@/lib/curriculum/rules";

import { uploadedFileSchema } from "./uploaded-file-schema";

/**
 * What a prospective student sees, as opposed to what an enrolled one studies.
 *
 * Nested rather than flattened onto the program for three reasons. `saveProgram`
 * writes an explicit field list, so a nested object is untouched by the identity
 * form and the copy cannot be wiped by someone editing a deadline. "Has anyone
 * filled this in?" is `marketing !== null` rather than a nine-way `||`. And the
 * public loader selects one shape instead of nine names.
 *
 * ## What is deliberately not here
 *
 * - **The price.** `feeAmount`/`listAmount` below are the price, in paise, with
 *   an admin screen of their own. A marketing fee would be a second number that
 *   could disagree with what Razorpay actually charges.
 * - **Duration, module and lesson counts.** All derived — duration from the
 *   `startMonth`/`endMonth` span across courses, counts from the published tree.
 *   A stored count is a count that goes stale the next time someone adds a
 *   lesson, and a syllabus that contradicts the number above it is worse than no
 *   number.
 * - **A separate title.** `title` is the title. Two names joined on a slug is
 *   the problem this collection just finished solving.
 * - **Cover gradient classes.** The old array stored Tailwind class strings
 *   (`"from-brand-solid to-…"`). Class names from a database are both an
 *   injection surface and invisible to Tailwind's JIT, which purges what it
 *   cannot see in source. The fallback gradient is a constant in the component.
 */
const programMarketingSchema = new Schema(
  {
    /** The one line under the title, on a card and in the hero. */
    tagline: { type: String, default: "", trim: true, maxlength: 160 },
    /** Long-form prose for /courses/[slug]. Plain text, rendered as paragraphs. */
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    /** WebP under 2 MB (upload kind `image`). Null renders a gradient instead. */
    cover: { type: uploadedFileSchema, default: null },
    /** Null means not stated — the eyebrow is simply absent, never guessed. */
    level: { type: String, enum: PROGRAM_LEVELS, default: null },
    /** "You will be able to…" — what the program teaches. */
    highlights: { type: [String], default: [] },
    /** Named software a student comes out able to use. */
    tools: { type: [String], default: [] },
    /**
     * The one offer that is a promise rather than a bullet, which is why it is
     * a field and gets a card of its own on the public page. An advertising
     * regulator asks about this line specifically, so it is stored as a decision
     * somebody made rather than as text somebody typed.
     */
    placementGuarantee: { type: Boolean, default: false },
    /** Everything else on offer, in the words staff chose. */
    offers: { type: [String], default: [] },
    /**
     * The ribbon on the card. A decision, not date arithmetic.
     *
     * **Not `isNew`.** Mongoose reserves that pathname — every document carries
     * an `isNew` of its own meaning "not yet saved" — and a schema field by that
     * name shadows it, which it warns about at load and which breaks on a
     * subdocument in ways that surface far from here.
     */
    newBadge: { type: Boolean, default: false },
    /** Typed by hand: "Next batch starts 8 Sep", or "Rolling admissions". */
    nextBatch: { type: String, default: "", trim: true, maxlength: 80 },
  },
  { _id: false },
);

const programSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    summary: { type: String, default: "", trim: true, maxlength: 600 },
    /** The programme-wide deadline shown above the curriculum. */
    deadline: { type: Date, default: null },
    /**
     * What the program costs, in paise. **This is the fee** — paying it in one
     * go needs nothing else, which is why it lives here and not in a row of its
     * own.
     *
     * A one-time payment is a Razorpay *Order*, created per payment. Only
     * instalments need a Razorpay *Plan*, so only instalments get a `FeePlan`.
     * Putting the base price here rather than in a `kind: "full"` plan row means
     * paying in full is **structurally always available** — there is no row to
     * archive and therefore no rule to enforce.
     *
     * **Null means this program has no fees**, and its students reach it as they
     * always did. That is what keeps every enrolment made before fees existed
     * working; the admin fees screen flags it so a forgotten price is visible
     * rather than silent.
     */
    feeAmount: { type: Number, default: null, min: 100 },
    /**
     * The undiscounted price, in paise — what the program is "worth" before the
     * offer. Display only: **nobody is ever charged this.** `feeAmount` is what
     * gets charged, always.
     *
     * Null means there is no discount to show, and the student simply sees one
     * price. That is the honest default, and it is why this is a separate
     * nullable field rather than a `discountPercent` on the fee: a discount
     * expressed as a percentage has to be recomputed into money to be checked,
     * and a struck-through price nobody ever paid is the thing an advertising
     * regulator asks about. Two amounts, both explicit, is the version somebody
     * can audit.
     *
     * Must be greater than `feeAmount` when set — a "discount" that costs more
     * is a typo, and `validateProgramFee` refuses it.
     */
    listAmount: { type: Number, default: null, min: 100 },
    /**
     * The public pitch. **Null means nobody has filled in the Details screen**,
     * and the public pages fall back to `title`, `summary` and the real
     * curriculum rather than to invented copy — the same rule the rest of the
     * app follows about numbers nothing produces.
     */
    marketing: { type: programMarketingSchema, default: null },
    status: { type: String, enum: NODE_STATUSES, default: "draft", index: true },
    order: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

export type ProgramDocument = InferSchemaType<typeof programSchema>;

export const Program: Model<ProgramDocument> =
  (models.Program as Model<ProgramDocument>) ??
  model<ProgramDocument>("Program", programSchema);
