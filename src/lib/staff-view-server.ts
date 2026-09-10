import "server-only";

import { cookies } from "next/headers";

import type { Area } from "@/components/staff/nav";
import type { Role } from "@/lib/auth/roles";

import { STAFF_VIEW_COOKIE, isArea } from "./staff-view";

/** The view an admin last chose, or null if they have never chosen one. */
async function getStaffView(): Promise<Area | null> {
  const value = (await cookies()).get(STAFF_VIEW_COOKIE)?.value;
  return isArea(value) ? value : null;
}

/**
 * Which nav to draw for this request.
 *
 * The URL used to decide this outright, which meant an admin who opened
 * Batches — a screen that lives under /manager, because admin gets the
 * manager's screens rather than duplicated copies — was silently demoted to the
 * program-manager sidebar and had to switch back to reach People or Audit log.
 *
 * So the area now follows the *person*, not the path: an admin stays in the
 * admin shell wherever they are, until they deliberately pick another view from
 * the switcher at the foot of the rail. Everyone else has one home, and the
 * path they are on is always it.
 */
export async function resolveArea(
  user: { role: Role },
  pathArea: Area,
): Promise<Area> {
  if (user.role !== "admin") return pathArea;
  return (await getStaffView()) ?? "admin";
}
