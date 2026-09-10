"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";

import { recordAudit } from "@/lib/auth/audit";
import { requireRole } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { connectToDatabase } from "@/lib/db";
import {
  auditWhere,
  hasAuditFilters,
  parseAuditFilters,
  type AuditFilters,
} from "@/lib/data/audit";
import { AuditLog } from "@/models/AuditLog";

/**
 * Delete the entries currently on screen.
 *
 * The one intentional exception to the log being append-only, and hedged three
 * ways:
 *
 * - **Admin only**, checked here rather than trusted from the page.
 * - **Never the whole log.** An empty filter set is refused: clearing
 *   everything has to be a deliberate dated range, not a stray click on a page
 *   that happened to load unfiltered.
 * - **It logs itself.** The `audit.purge` entry it writes survives the delete
 *   and says what went and on whose say-so, so the trail never has a gap
 *   nobody can account for.
 *
 * The filters arrive as the same query fields the list screen uses and go
 * through the same `parseAuditFilters` / `auditWhere` pair, so what is deleted
 * is what was being looked at — not a second query that has to be kept in step.
 */
export async function purgeAuditLogs(formData: FormData): Promise<void> {
  const actor = await requireRole("admin");
  if (actor.role !== "admin" || !can(actor, "audit.view")) notFound();

  const text = (key: string) => String(formData.get(key) ?? "");
  const filters = parseAuditFilters({
    role: text("role"),
    category: text("category"),
    action: text("action"),
    q: text("q"),
    from: text("from"),
    to: text("to"),
  });

  if (!hasAuditFilters(filters)) return;

  await connectToDatabase();
  const where = auditWhere(filters);
  const { deletedCount } = await AuditLog.deleteMany(where);

  if (deletedCount > 0) {
    await recordAudit(
      {
        kind: "user",
        id: actor.id,
        name: actor.name,
        role: actor.role,
        email: actor.email,
      },
      {
        action: "audit.purge",
        targetType: "AuditLog",
        targetId: null,
        summary: `Deleted ${deletedCount} audit ${
          deletedCount === 1 ? "entry" : "entries"
        } — ${describe(filters)}`,
        meta: { deletedCount, filters },
      },
    );
  }

  revalidatePath("/admin/audit");
}

/** The filter set as a phrase, so the purge entry says what it took. */
function describe(filters: AuditFilters): string {
  const parts: string[] = [];
  if (filters.from && filters.to) parts.push(`${filters.from} to ${filters.to}`);
  else if (filters.from) parts.push(`from ${filters.from}`);
  else if (filters.to) parts.push(`up to ${filters.to}`);
  if (filters.role) parts.push(`role ${filters.role}`);
  if (filters.category) parts.push(`category ${filters.category}`);
  if (filters.action) parts.push(`action ${filters.action}`);
  if (filters.q) parts.push(`matching "${filters.q}"`);
  return parts.join(", ");
}
