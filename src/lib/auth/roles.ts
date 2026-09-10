/**
 * The four actors, and where each one lives.
 *
 * Deliberately dependency-free — no `server-only`, no Mongoose, no Next. The
 * model imports it, the proxy (edge runtime) imports it, client components
 * import it. Anything heavier belongs in guards.ts or permissions.ts.
 */

export const ROLES = ["admin", "program_manager", "teacher", "student"] as const;

export type Role = (typeof ROLES)[number];

/** What a role is called in the UI. Never print the raw enum value. */
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  program_manager: "Program manager",
  teacher: "Teacher",
  student: "Student",
};

/**
 * Where each role starts, and the prefix that belongs to them.
 *
 * One map, used by the proxy to bounce the wrong role, by the login action to
 * decide where to land, and by the shell to build the home link — so the three
 * cannot disagree about where a teacher belongs.
 */
export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
  program_manager: "/manager",
  teacher: "/teacher",
  student: "/dashboard",
};

/** Route prefixes that require a signed-in user, and who may enter each. */
export const AREA_ACCESS: { prefix: string; roles: Role[] }[] = [
  { prefix: "/admin", roles: ["admin"] },
  // Admin is a superset, not a fourth silo: they get the manager and teacher
  // screens rather than duplicated admin-only copies of them.
  { prefix: "/manager", roles: ["admin", "program_manager"] },
  { prefix: "/teacher", roles: ["admin", "teacher"] },
  { prefix: "/dashboard", roles: ["student"] },
  { prefix: "/learn", roles: ["student"] },
];

/** The area a path belongs to, or null if it is public. */
export function areaFor(pathname: string) {
  return (
    AREA_ACCESS.find(
      (area) => pathname === area.prefix || pathname.startsWith(`${area.prefix}/`),
    ) ?? null
  );
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
