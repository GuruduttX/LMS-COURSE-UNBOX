import "server-only";

import {
  ACTIONS,
  isAuditAction,
  isAuditCategory,
  type AuditAction,
  type AuditCategory,
} from "@/lib/auth/audit";
import { isRole, type Role } from "@/lib/auth/roles";
import { connectToDatabase } from "@/lib/db";
import { AuditLog } from "@/models/AuditLog";

/**
 * Reads behind /admin/audit.
 *
 * The single seam: the page never builds a Mongo query itself, and the purge
 * action reuses `auditWhere` — so "what I am looking at" and "what I am about
 * to delete" are the same query by construction, not by two people remembering
 * to keep them in step.
 *
 * Unlike the other list screens, this one paginates for real. The log grows
 * without bound, and a `.limit(200)` on it would quietly stop being the truth
 * about a week in.
 */

export const PAGE_SIZE = 50;

export type AuditRow = {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  actorEmail: string | null;
  action: string;
  actionLabel: string;
  category: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  meta: Record<string, unknown> | null;
  ip: string | null;
};

export type AuditFilters = {
  role: Role | "anonymous" | "system" | null;
  category: AuditCategory | null;
  action: AuditAction | null;
  /** Matches actor email, actor name, or the summary line. */
  q: string;
  /** yyyy-mm-dd, as the date inputs post them. */
  from: string | null;
  to: string | null;
  page: number;
};

/** Roles as the filter offers them — the two non-human actors included. */
export function isActorRole(
  value: unknown,
): value is Role | "anonymous" | "system" {
  return isRole(value) || value === "anonymous" || value === "system";
}

/** Unknown filter values read as "no filter" rather than 404ing. */
export function parseAuditFilters(query: {
  role?: string;
  category?: string;
  action?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: string;
}): AuditFilters {
  const page = Number.parseInt(query.page ?? "1", 10);

  return {
    role: isActorRole(query.role) ? query.role : null,
    category: isAuditCategory(query.category) ? query.category : null,
    action: isAuditAction(query.action) ? query.action : null,
    q: (query.q ?? "").trim(),
    from: isDate(query.from) ? query.from : null,
    to: isDate(query.to) ? query.to : null,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function hasAuditFilters(filters: AuditFilters): boolean {
  return Boolean(
    filters.role ||
      filters.category ||
      filters.action ||
      filters.q ||
      filters.from ||
      filters.to,
  );
}

/**
 * The Mongo query for a set of filters. Exported because the purge action needs
 * to delete exactly what the screen was showing.
 */
export function auditWhere(filters: AuditFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (filters.role) where.actorRole = filters.role;
  if (filters.category) where.category = filters.category;
  if (filters.action) where.action = filters.action;

  if (filters.q) {
    // Escaped: an email with "+" in it is a search term, not a broken regex.
    const safe = filters.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    where.$or = [
      { actorEmail: { $regex: safe, $options: "i" } },
      { actorName: { $regex: safe, $options: "i" } },
      { summary: { $regex: safe, $options: "i" } },
    ];
  }

  // `to` is inclusive: someone filtering "1 Jan to 1 Jan" means that whole day,
  // not the single instant at midnight.
  const range: Record<string, Date> = {};
  if (filters.from) range.$gte = new Date(`${filters.from}T00:00:00.000`);
  if (filters.to) range.$lte = new Date(`${filters.to}T23:59:59.999`);
  if (Object.keys(range).length > 0) where.createdAt = range;

  return where;
}

export type AuditPage = {
  rows: AuditRow[];
  total: number;
  page: number;
  pageCount: number;
};

export async function listAuditLogs(
  filters: AuditFilters,
): Promise<AuditPage> {
  await connectToDatabase();

  const where = auditWhere(filters);
  const total = await AuditLog.countDocuments(where);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // A filter change can leave you on page 9 of a 2-page result. Clamp rather
  // than show an empty page that looks like "no matches".
  const page = Math.min(filters.page, pageCount);

  const docs = await AuditLog.find(where)
    .sort({ createdAt: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  return { rows: docs.map(toRow), total, page, pageCount };
}

/** How many entries a filter matches — the count the purge dialog shows. */
export async function countAuditLogs(filters: AuditFilters): Promise<number> {
  await connectToDatabase();
  return AuditLog.countDocuments(auditWhere(filters));
}

/**
 * Emails seen in the log, for the search box's datalist. Capped: this is a
 * convenience, and an admin who types the address gets the same result.
 */
export async function auditActorSuggestions(): Promise<string[]> {
  await connectToDatabase();
  const emails = await AuditLog.distinct("actorEmail", {
    actorEmail: { $ne: null },
  });
  return (emails as string[]).sort().slice(0, 200);
}

type Lean = {
  _id: unknown;
  actorId?: unknown;
  actorName: string;
  actorRole: string;
  actorEmail?: string | null;
  action: string;
  category?: string;
  targetType: string;
  targetId?: string | null;
  summary: string;
  meta?: unknown;
  ip?: string | null;
  createdAt?: Date;
};

function toRow(doc: Lean): AuditRow {
  return {
    id: String(doc._id),
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    actorId: doc.actorId ? String(doc.actorId) : null,
    actorName: doc.actorName,
    actorRole: doc.actorRole,
    actorEmail: doc.actorEmail ?? null,
    action: doc.action,
    // Rows written before an action was renamed still render as something.
    actionLabel: isAuditAction(doc.action)
      ? ACTIONS[doc.action].label
      : doc.action,
    category: doc.category ?? "system",
    targetType: doc.targetType,
    targetId: doc.targetId ?? null,
    summary: doc.summary,
    meta:
      doc.meta && typeof doc.meta === "object"
        ? (JSON.parse(JSON.stringify(doc.meta)) as Record<string, unknown>)
        : null,
    ip: doc.ip ?? null,
  };
}

function isDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
