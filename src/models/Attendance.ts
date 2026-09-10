/**
 * Attendance — one student, one session, present or absent.
 *
 * A row exists only once attendance has actually been marked; "no row" means
 * "not marked yet", which is different from absent and must stay different, or
 * an unmarked session would quietly drag everyone's percentage down.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const attendanceSchema = new Schema(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "LiveSession",
      required: true,
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    state: { type: String, enum: ["present", "absent"], required: true },
    markedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    markedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

// One mark per student per session — enforced by the database, not by the UI
// remembering to check first.
attendanceSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });

export type AttendanceDocument = InferSchemaType<typeof attendanceSchema>;

export const Attendance: Model<AttendanceDocument> =
  (models.Attendance as Model<AttendanceDocument>) ??
  model<AttendanceDocument>("Attendance", attendanceSchema);
