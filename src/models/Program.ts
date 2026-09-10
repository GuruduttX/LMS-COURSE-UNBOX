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
 * ## Why `data/home.ts` still has programs in it
 *
 * That array is **marketing copy for the logged-out home page** — tagline, fee,
 * cover, batch dates — and this collection is the syllabus. They are joined on
 * `slug` and they are not duplicates of each other. Do not "fix" the overlap by
 * deleting one; the public page must render without a database read of content
 * that only signed-in students are entitled to.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { NODE_STATUSES } from "@/lib/curriculum/rules";

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
