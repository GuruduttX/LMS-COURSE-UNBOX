/**
 * AuditLog — who did what, when.
 *
 * Written by every action worth remembering: staff mutations that change
 * someone's access or the curriculum, session and cohort changes, student work
 * being submitted, and every sign-in, sign-out and password change. It is the
 * only way to ever answer "who made this person an admin", "who cancelled that
 * session", "when did this account last get in and from where" — questions that
 * always get asked eventually, and can only be answered if the record was kept
 * from the start.
 *
 * Deliberately *not* written for high-frequency background events (video
 * progress ticks, quiz answer autosaves). A log nobody can read is not a log.
 *
 * Append-only with exactly one exception: an admin may purge a filtered range
 * from /admin/audit, and that purge writes its own `audit.purge` entry saying
 * what it removed — so the trail never has an unexplained gap. Nothing else in
 * the app updates or deletes these.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const auditLogSchema = new Schema(
  {
    /**
     * Null for actors without an account: a failed sign-in with an unknown
     * email, or a machine (webhook, script). `actorName` always says who.
     */
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    /** Actor's name, role and email at the time — they may change or be deleted later. */
    actorName: { type: String, required: true },
    actorRole: { type: String, required: true },
    /** Lowercased. The handle an admin actually searches by. Null for machines. */
    actorEmail: { type: String, default: null, index: true },
    /** Dotted verb, matching the capability that permitted it: "user.create". */
    action: { type: String, required: true, index: true },
    /** Coarse grouping for the filter bar — see ACTIONS in lib/auth/audit.ts. */
    category: { type: String, required: true, index: true },
    targetType: { type: String, required: true },
    targetId: { type: String, default: null },
    /** One human-readable line: "Made Priya Nair a program manager". */
    summary: { type: String, required: true },
    /** Anything worth keeping for later — never credentials. */
    meta: { type: Schema.Types.Mixed, default: null },
    /** Auth events only: where the request came from. */
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Every screen sorts newest-first, so each filter is a compound index with
// createdAt rather than a lone field index that Mongo would then have to sort.
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorRole: 1, createdAt: -1 });
auditLogSchema.index({ actorEmail: 1, createdAt: -1 });
auditLogSchema.index({ category: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema>;

export const AuditLog: Model<AuditLogDocument> =
  (models.AuditLog as Model<AuditLogDocument>) ??
  model<AuditLogDocument>("AuditLog", auditLogSchema);
