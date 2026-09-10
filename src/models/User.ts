/**
 * User — every human in the system: admin, program manager, teacher, student.
 *
 * One collection rather than four, because they share everything that matters
 * (credentials, status, contact) and differ only in `role` and `assignments`.
 * Roles are checked in code, never inferred from which collection a document
 * came from.
 *
 * Model files are guarded with `models.X ?? model(...)`: Next hot-reloads this
 * module and Mongoose throws OverwriteModelError if the same name is compiled twice.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { ROLES } from "@/lib/auth/roles";

import { uploadedFileSchema } from "./uploaded-file-schema";

/**
 * What a staff member is responsible for. Embedded rather than a join
 * collection: assignments are few, are always read with the user, and are only
 * ever written by an admin or a program manager.
 *
 * ## A teacher is assigned to batches, not to a whole program
 *
 * A program runs several cohorts at once and one teacher rarely takes all of
 * them — the Tuesday-evening batch is somebody else's. So `batches` names the
 * cohorts of `programSlug` this person actually teaches, by the same name
 * `Enrollment.batch` and `Batch.name` carry. A rename cascades here too; see
 * `renameBatchEverywhere` in app/manager/batches/actions.ts.
 *
 * **Empty means every batch**, the same convention `courseIds` already uses,
 * which is what keeps program managers (who own all of a program's cohorts) and
 * every assignment written before batches existed working untouched. It also
 * means removing somebody's *last* batch must remove the whole assignment
 * rather than leaving an empty list — an empty list would silently widen their
 * scope to the entire program. `removeTeacherFromBatch` does exactly that.
 *
 * What batch scope does **not** narrow is the curriculum: courses, modules and
 * subtopics belong to the program and every cohort studies the same ones, so a
 * teacher on any batch authors the program's content. Batches narrow *people* —
 * which students they see, whose work they mark, who their tasks reach, which
 * sessions are theirs.
 */
const assignmentSchema = new Schema(
  {
    /** Slug from data/home.ts — the program. */
    programSlug: { type: String, required: true, trim: true },
    /** Course ids within that program. Empty means the whole program. */
    courseIds: { type: [String], default: [] },
    /** Batch names within that program. Empty means every batch. */
    batches: { type: [String], default: [] },
  },
  { _id: false },
);

/**
 * The last thing someone studied. One qualification, not a list: the enrolment
 * form asks "what have you finished", and a second row has never been needed —
 * when it is, this becomes an array and nothing else here changes.
 *
 * `marks` is free text rather than a number because India grades in three
 * incompatible ways (percentage, CGPA out of 10, and letter grades) and
 * flattening them to one number loses which was meant.
 */
const qualificationSchema = new Schema(
  {
    /** "B.Tech Computer Science", "Class 12 (CBSE)". */
    title: { type: String, trim: true, default: "", maxlength: 120 },
    institution: { type: String, trim: true, default: "", maxlength: 120 },
    /** Four digits, kept as a number so a range check is possible. */
    completedYear: { type: Number, default: null },
    /** "78%", "8.4 CGPA", "A". */
    marks: { type: String, trim: true, default: "", maxlength: 40 },
  },
  { _id: false },
);

/**
 * Working experience, if any.
 *
 * `hasExperience` is stored rather than inferred from the fields being filled:
 * "I have never worked" and "I have not told you yet" are different answers,
 * and only the flag can tell them apart.
 */
const experienceSchema = new Schema(
  {
    hasExperience: { type: Boolean, default: false },
    role: { type: String, trim: true, default: "", maxlength: 100 },
    company: { type: String, trim: true, default: "", maxlength: 100 },
    /** As the person says it — "2 years", "6 months". */
    duration: { type: String, trim: true, default: "", maxlength: 40 },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    /**
     * `select: false` so a forgotten projection cannot leak the hash. Every read
     * that needs it must ask for it explicitly (`.select("+passwordHash")`) —
     * which is only ever the login path.
     */
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, index: true },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
      index: true,
    },
    phone: { type: String, trim: true, default: "" },
    /**
     * Profile picture. The shared uploaded-file shape, so it carries the
     * `publicId` a delete needs — `null` when nobody has set one and the
     * initials monogram stands in.
     */
    avatar: { type: uploadedFileSchema, default: null },
    address: { type: String, trim: true, default: "", maxlength: 300 },
    qualification: { type: qualificationSchema, default: () => ({}) },
    experience: { type: experienceSchema, default: () => ({}) },
    assignments: { type: [assignmentSchema], default: [] },
    /** Set on admin-created accounts; forces a password change at first login. */
    mustChangePassword: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
    /** Failed sign-in attempts since the last success — see lib/auth/lockout. */
    failedAttempts: { type: Number, default: 0 },
    /** Set once the attempt limit is hit; refuses sign-in until it passes. */
    lockedUntil: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// Staff lists are filtered by role and status, newest first.
userSchema.index({ role: 1, status: 1, createdAt: -1 });

export type UserDocument = InferSchemaType<typeof userSchema>;

export const User: Model<UserDocument> =
  (models.User as Model<UserDocument>) ?? model<UserDocument>("User", userSchema);