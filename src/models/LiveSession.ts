/**
 * LiveSession — a scheduled call a student attends.
 *
 * Not part of the curriculum tree, which describes recorded material. A program
 * manager creates these and assigns a teacher; students see them on their
 * program's sessions screen.
 *
 * `startsAt` is a real UTC datetime, unlike the static placeholder it replaced
 * (which stored minutes-from-midnight so it could never go stale). Formatting
 * for IST happens at the edge of the UI, never in the database.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { SESSION_KINDS } from "@/lib/data/session-kinds";

const liveSessionSchema = new Schema(
  {
    /** Program slug — matches data/home.ts until programs are a collection. */
    programSlug: { type: String, required: true, trim: true, index: true },
    /**
     * Which cohort it is for, by `Batch.name` — the same key `Enrollment.batch`
     * and `User.assignments[].batches` carry, so a scope check is a string
     * comparison rather than a lookup. A rename cascades; see
     * `renameBatchEverywhere` in app/manager/batches/actions.ts.
     *
     * **Empty means the whole program**, and that is a real case rather than a
     * missing value: the induction, the placement talk, the guest lecture every
     * cohort is invited to. So it is in *every* batch's timetable rather than
     * nobody's — which is the opposite of what an empty batch means on an
     * enrolment, and why `lib/data/session-batches.ts` states the rule once
     * instead of leaving each reader to guess it.
     *
     * Sessions written before batches existed have no `batch` key at all;
     * Mongoose defaults apply on write, never retroactively, so that filter
     * matches a missing field too rather than dropping those rows off every
     * timetable.
     */
    batch: { type: String, trim: true, default: "", maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, trim: true, default: "", maxlength: 600 },
    kind: { type: String, enum: SESSION_KINDS, required: true },
    startsAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 5, max: 600 },
    /** Who takes it. Null while unassigned — a session can be booked first. */
    teacherId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    /** Denormalised so a listing doesn't populate, and so the name survives
     *  a teacher being reassigned or suspended later. */
    teacherName: { type: String, default: "" },
    joinUrl: { type: String, trim: true, default: "" },
    /**
     * Set only when we minted the link ourselves via the Calendar API — a
     * pasted Zoom or Meet URL leaves this empty. It is what lets a reschedule
     * move the real calendar event and a cancellation withdraw the invite,
     * instead of the event drifting away from the row that describes it.
     *
     * A `mock-` prefix means the credentials weren't configured when it was
     * created (see lib/googleCalendar.ts) and there is no real event to patch.
     */
    googleEventId: { type: String, trim: true, default: "" },
    recordingUrl: { type: String, trim: true, default: "" },
    /**
     * Cancelled sessions are kept, never deleted: a student who planned around
     * one must still see what happened to it.
     */
    status: {
      type: String,
      enum: ["scheduled", "cancelled"],
      default: "scheduled",
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

// Every listing is "this program, in date order".
liveSessionSchema.index({ programSlug: 1, startsAt: -1 });

export type LiveSessionDocument = InferSchemaType<typeof liveSessionSchema>;

export const LiveSession: Model<LiveSessionDocument> =
  (models.LiveSession as Model<LiveSessionDocument>) ??
  model<LiveSessionDocument>("LiveSession", liveSessionSchema);
