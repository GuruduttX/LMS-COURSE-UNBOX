/**
 * What each role may do. The single source of truth for nav, buttons and guards.
 *
 * Two rules this file only half enforces, so they are worth stating plainly:
 *
 * 1. **This map answers "what kind of thing", not "which one".** `can(user,
 *    "session.schedule")` is never sufficient on its own — a mutation that
 *    touches a program also calls `assertScope(user, { program })` in guards.ts.
 * 2. **Nav, buttons and guards read the same map.** A control that renders is a
 *    control that works; if the capability is missing the control is absent,
 *    never present-and-then-refused.
 *
 * Pure and dependency-free, so client components can import it too.
 */
import type { Role } from "./roles";

export const CAPABILITIES = [
  // People
  "user.view",
  "user.create",
  "user.update",
  "user.suspend",
  "user.assign",
  // Programs and curriculum
  "program.view",
  "program.create",
  "program.publish",
  "program.archive",
  "program.assignTeacher",
  "curriculum.author",
  "curriculum.reorder",
  "curriculum.delete",
  // Live sessions
  "session.view",
  "session.schedule",
  "session.update",
  "session.cancel",
  "session.assignTeacher",
  "session.markAttendance",
  // Students and their work
  "batch.view",
  "batch.manage",
  "enrollment.create",
  "enrollment.update",
  // Money. `fee.manage` sets what a program costs; `fee.view` reads who has
  // paid. Split because they are different jobs: a manager chasing a cohort's
  // outstanding fees needs the roster, not the power to reprice the program.
  "fee.view",
  "fee.manage",
  "submission.grade",
  "marks.view",
  "placement.manage",
  // Setting work that isn't graded — see models/Task.ts. Content-side, so it
  // sits with the teacher's grants rather than the manager's cohort ones.
  "task.assign",
  // Everything else
  "enquiry.view",
  "enquiry.update",
  "announcement.publish",
  "audit.view",
  "settings.manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Admin is not listed: `can()` grants it everything. Spelling out the full list
 * for admin would be a second place to forget a new capability.
 */
const SCOPED_CAPABILITIES: Record<Exclude<Role, "admin">, Capability[]> = {
  /** Owns the cohort and the timetable — schedules sessions, assigns teachers. */
  program_manager: [
    "program.view",
    // Staffing their own programs. Deliberately NOT `user.assign`, which is the
    // admin's power to set anyone's role and assignments anywhere; this grants
    // only "put a teacher on / take a teacher off a program I manage", and the
    // action still calls assertScope to decide which programs those are.
    "program.assignTeacher",
    "session.view",
    "session.schedule",
    "session.update",
    "session.cancel",
    "session.assignTeacher",
    "session.markAttendance",
    // The cohort is the manager's to shape, which is the same authority as
    // enrolling into it — a batch is only a group of enrolments with a seat
    // count. A teacher gets neither, not even `batch.view`: they see the batch
    // label on a student row, and how many seats are left is not their call.
    "batch.view",
    "batch.manage",
    "enrollment.create",
    "enrollment.update",
    // Sees who has paid, because chasing outstanding fees is cohort work.
    // **Not** `fee.manage`: what a program costs is a business decision, and
    // an archived-not-edited plan means a wrong price cannot be quietly undone.
    "fee.view",
    "marks.view",
    "placement.manage",
    "enquiry.view",
    "enquiry.update",
    "announcement.publish",
    "user.view",
  ],
  /** Owns content and marks for assigned courses. No scheduling power. */
  teacher: [
    "program.view",
    "curriculum.author",
    "curriculum.reorder",
    // Deleting *some* of the tree. Which parts is not a role question — a
    // teacher may delete a topic or a subtopic, never a course — so the node
    // types live in `curriculum/authoring.ts` and this only says "may delete
    // at all". Program managers hold neither.
    "curriculum.delete",
    "session.view",
    "submission.grade",
    // Telling students what to go and do is teaching, which is why the teacher
    // holds this and the program manager does not — a manager owns the cohort
    // and the timetable, not the work. Admin holds it via `can()`, as always.
    "task.assign",
    "marks.view",
    "announcement.publish",
  ],
  /** Their own learning only — the student screens don't consult this map. */
  student: ["program.view", "session.view", "marks.view"],
};

export function can(
  user: { role: Role } | null | undefined,
  capability: Capability,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return SCOPED_CAPABILITIES[user.role].includes(capability);
}

/** True when the role holds every listed capability. */
export function canAll(
  user: { role: Role } | null | undefined,
  capabilities: Capability[],
): boolean {
  return capabilities.every((capability) => can(user, capability));
}
