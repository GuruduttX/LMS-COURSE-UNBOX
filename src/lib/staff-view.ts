import type { Area } from "@/components/staff/nav";

/**
 * Which staff shell an admin is currently wearing.
 *
 * Only an admin has a choice here: they are the one role admitted into all
 * three areas, so "which nav do I see" stops being answerable from the URL
 * alone. Everyone else has exactly one home and this is ignored for them.
 *
 * The cookie is a *view preference*, never an authorization input — the guards
 * in lib/auth/guards.ts and the proxy still decide who may open a page. A
 * tampered value can at worst draw the wrong menu for the person who tampered.
 */
export const STAFF_VIEW_COOKIE = "lms_staff_view";

export const STAFF_VIEW_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const AREAS: Area[] = ["admin", "manager", "teacher"];

export function isArea(value: unknown): value is Area {
  return typeof value === "string" && (AREAS as string[]).includes(value);
}
