import "server-only";

import { headers } from "next/headers";

import { ACTIONS, type AuditAction } from "./audit-actions";
import type { CurrentUser } from "./guards";
import type { Role } from "./roles";
import { connectToDatabase } from "@/lib/db";
import { AuditLog } from "@/models/AuditLog";

export * from "./audit-actions";

/**
 * The one way anything in this app records that something happened.
 *
 * Two rules, both easy to break by accident:
 *
 * 1. **Never throws.** An audit write failing must not roll back the thing the
 *    user actually asked for. A lost log line is bad; a suspension that
 *    silently didn't happen because logging it failed is worse. Failures go to
 *    the server console, where they are visible without being in the way.
 * 2. **Call it after the write succeeds**, so the log records what happened
 *    rather than what was attempted. The one deliberate exception is
 *    `auth.login.failed`, where the failure *is* the event.
 *
 * ## Writing a summary
 *
 * The summary is the column a human reads. The actor is already its own column,
 * so the subject is implied: **past tense, names not ids, one line, no jargon.**
 *
 *   good  "Suspended Priya Nair"
 *   good  "Scheduled React Fundamentals for Batch A on 4 Sep"
 *   good  "Changed their own password"
 *   bad   "user.suspend on 66f1a2… by 66e0b1…"     (ids, and it repeats columns)
 *   bad   "Updating user record"                    (present tense, says nothing)
 *
 * Ids, slugs and before/after values belong in `meta`, which the screen hides
 * behind a toggle. Never put credentials in it — not a password, not a hash,
 * not a token, not a reset link.
 */

/**
 * Who did it.
 *
 * Three shapes, because not every actor is a signed-in user: a failed sign-in
 * has an email and nothing else, and the Bunny webhook has neither.
 */
export type AuditActor =
  | { kind: "user"; id: string; name: string; role: Role; email: string }
  | { kind: "anonymous"; email: string }
  | { kind: "system"; label: string };

export type AuditEntry = {
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  /** One plain line, past tense — see the note at the top of this file. */
  summary: string;
  meta?: Record<string, unknown> | null;
  /** Auth events only. Use `requestContext()` to fill it. */
  request?: { ip: string | null; userAgent: string | null } | null;
};

export async function recordAudit(
  actor: AuditActor,
  entry: AuditEntry,
): Promise<void> {
  try {
    await connectToDatabase();
    await AuditLog.create({
      actorId: actor.kind === "user" ? actor.id : null,
      actorName:
        actor.kind === "user"
          ? actor.name
          : actor.kind === "anonymous"
            ? actor.email
            : actor.label,
      actorRole: actor.kind === "user" ? actor.role : actor.kind,
      actorEmail:
        actor.kind === "system" ? null : actor.email.trim().toLowerCase(),
      action: entry.action,
      category: ACTIONS[entry.action].category,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      summary: entry.summary,
      meta: entry.meta ?? null,
      ip: entry.request?.ip ?? null,
      userAgent: entry.request?.userAgent ?? null,
    });
  } catch (error) {
    console.error("[audit] failed to record", entry.action, error);
  }
}

/**
 * The common case: a signed-in user did something.
 *
 * Kept as its own name (and its own signature) because every staff mutation
 * already calls it, and because `writeAudit(actor, …)` reads better at a call
 * site than spelling out the actor shape thirty times.
 */
export async function writeAudit(
  actor: CurrentUser,
  entry: Omit<AuditEntry, "request"> & { request?: AuditEntry["request"] },
): Promise<void> {
  await recordAudit(
    {
      kind: "user",
      id: actor.id,
      name: actor.name,
      role: actor.role,
      email: actor.email,
    },
    entry,
  );
}

/**
 * Where the current request came from, for auth events.
 *
 * `x-forwarded-for` is a list when there are proxies in front; the first entry
 * is the client. Never throws — if headers aren't available the event is still
 * worth logging without them.
 */
export async function requestContext(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  try {
    const list = await headers();
    const forwarded = list.get("x-forwarded-for");
    const ip =
      forwarded?.split(",")[0]?.trim() || list.get("x-real-ip") || null;
    return { ip, userAgent: list.get("user-agent") };
  } catch {
    return { ip: null, userAgent: null };
  }
}
