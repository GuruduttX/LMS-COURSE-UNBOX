import { can, type Capability } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/roles";

/**
 * The staff sidebar, derived from capabilities rather than hand-listed per role.
 *
 * Each item names the capability it needs, and `navFor` drops the ones the user
 * doesn't hold — so the nav cannot advertise a page the guard would bounce them
 * from. Adding a screen means adding one row here, not editing three menus.
 *
 * The Students item uses `marks.view` rather than `user.view` or
 * `enrollment.update`: the screen is about seeing how students are doing, which
 * is what a teacher holds and what the page actually does. Enrolling is guarded
 * separately, in the action.
 *
 * Items whose screens don't exist yet carry `soon: true`: they are shown
 * disabled rather than hidden, because a program manager should be able to see
 * that attendance is coming without having to ask. Never link to a 404.
 */
/**
 * Which icon to draw. A name, not the component: these items cross the
 * server→client boundary to StaffNav, and a component reference is not
 * serializable. StaffNav owns the name→component map.
 */
export type IconName =
  | "overview"
  | "people"
  | "programs"
  | "students"
  | "tasks"
  | "batches"
  | "sessions"
  | "enquiries"
  | "audit"
  | "settings"
  | "grading";

export type NavItem = {
  label: string;
  href: string;
  icon: IconName;
  /** Null = everyone in the area sees it (the area's own landing page). */
  capability: Capability | null;
  soon?: boolean;
  /** Show in the mobile tab bar. Max 5 wins, in this order. */
  primary?: boolean;
};

const ADMIN_NAV: NavItem[] = [
  { label: "Overview", href: "/admin", icon: "overview", capability: null, primary: true },
  { label: "People", href: "/admin/people", icon: "people", capability: "user.view", primary: true },
  { label: "Programs", href: "/admin/programs", icon: "programs", capability: "program.view", primary: true },
  { label: "Students", href: "/admin/students", icon: "students", capability: "marks.view", primary: true },
  { label: "Tasks", href: "/admin/tasks", icon: "tasks", capability: "task.assign" },
  { label: "Batches", href: "/manager/batches", icon: "batches", capability: "batch.view" },
  { label: "Sessions", href: "/manager/sessions", icon: "sessions", capability: "session.view", primary: true },
  { label: "Enquiries", href: "/admin/enquiries", icon: "enquiries", capability: "enquiry.view", soon: true, primary: true },
  { label: "Audit log", href: "/admin/audit", icon: "audit", capability: "audit.view" },
  { label: "Settings", href: "/admin/settings", icon: "settings", capability: "settings.manage", soon: true },
];

const MANAGER_NAV: NavItem[] = [
  { label: "Overview", href: "/manager", icon: "overview", capability: null, primary: true },
  { label: "Programs", href: "/manager/programs", icon: "programs", capability: "program.view", primary: true },
  { label: "Sessions", href: "/manager/sessions", icon: "sessions", capability: "session.view", primary: true },
  { label: "Students", href: "/manager/students", icon: "students", capability: "marks.view", primary: true },
  { label: "Batches", href: "/manager/batches", icon: "batches", capability: "batch.view" },
  { label: "Enquiries", href: "/manager/enquiries", icon: "enquiries", capability: "enquiry.view", soon: true, primary: true },
];

const TEACHER_NAV: NavItem[] = [
  { label: "Overview", href: "/teacher", icon: "overview", capability: null, primary: true },
  { label: "My programs", href: "/teacher/programs", icon: "programs", capability: "curriculum.author", primary: true },
  { label: "Students", href: "/teacher/students", icon: "students", capability: "marks.view", primary: true },
  { label: "Tasks", href: "/teacher/tasks", icon: "tasks", capability: "task.assign", primary: true },
  { label: "Grading", href: "/teacher/grading", icon: "grading", capability: "submission.grade", soon: true },
  { label: "Sessions", href: "/teacher/sessions", icon: "sessions", capability: "session.view", primary: true },
];

/**
 * Which area's nav to show — the shell an admin is wearing, not the URL prefix
 * they happen to be under. See lib/staff-view-server.ts: an admin keeps the
 * admin nav across /manager and /teacher screens, because those screens are
 * *their* screens too, and only leaves it via the switcher.
 */
export type Area = "admin" | "manager" | "teacher";

const BY_AREA: Record<Area, NavItem[]> = {
  admin: ADMIN_NAV,
  manager: MANAGER_NAV,
  teacher: TEACHER_NAV,
};

export function navFor(area: Area, user: { role: Role }): NavItem[] {
  return BY_AREA[area].filter(
    (item) => item.capability === null || can(user, item.capability),
  );
}

/**
 * The other views an admin can put on. Empty for everyone else — a program
 * manager has exactly one home, so offering them a switcher would be a lie.
 *
 * These are deliberate, sticky choices now rather than plain links, so the
 * switcher posts the area back (see lib/staff-view-actions.ts) instead of
 * relying on where the click happens to land.
 */
export function areaSwitchesFor(
  user: { role: Role },
  current: Area,
): { label: string; area: Area }[] {
  if (user.role !== "admin") return [];

  return (["admin", "manager", "teacher"] as Area[])
    .filter((area) => area !== current)
    .map((area) => ({ label: AREA_LABEL[area], area }));
}

export const AREA_LABEL: Record<Area, string> = {
  admin: "Admin",
  manager: "Program manager",
  teacher: "Teacher",
};

/** Where each view starts. Mirrors ROLE_HOME, keyed by area rather than role. */
export const AREA_HOME: Record<Area, string> = {
  admin: "/admin",
  manager: "/manager",
  teacher: "/teacher",
};
