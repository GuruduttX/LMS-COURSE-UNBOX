import { requireRole } from "@/lib/auth/guards";
import type { Role } from "@/lib/auth/roles";
import { resolveArea } from "@/lib/staff-view-server";

import { StaffShell } from "./StaffShell";
import type { Area } from "./nav";

/**
 * What every staff area's layout is: guard, then shell.
 *
 * The guard lives here rather than in each page so a screen added later cannot
 * forget it — an unguarded page under /admin would still be wrapped by this
 * layout, and this layout refuses first.
 *
 * `area` is where the *page* lives; `resolveArea` turns that into the shell the
 * *user* should see, which for an admin is the admin shell no matter which
 * area's screen they opened.
 */
export async function StaffLayout({
  area,
  roles,
  children,
}: {
  area: Area;
  /** Who may enter, besides admin — `requireRole` always admits admin. */
  roles: Role[];
  children: React.ReactNode;
}) {
  const user = await requireRole(...roles);
  const shellArea = await resolveArea(user, area);

  return (
    <StaffShell user={user} area={shellArea}>
      {children}
    </StaffShell>
  );
}
