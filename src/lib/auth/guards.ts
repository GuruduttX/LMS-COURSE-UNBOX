import "server-only";

import { notFound, redirect } from "next/navigation";

import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";

import { readSession } from "./session";
import { ROLE_HOME, type Role } from "./roles";

/**
 * The authorization boundary. The proxy redirects for UX; **this** decides.
 *
 * Every page, layout and server action in a signed-in area starts with one of
 * these. They read the database rather than trusting the cookie, because a
 * token minted five minutes ago still says "teacher" after an admin changed the
 * role — or suspended the account entirely.
 *
 * Call order in a mutation is always: requireRole (who) → assertScope (which) →
 * validate (what) → write.
 */

export type Assignment = {
  programSlug: string;
  courseIds: string[];
  /** Cohorts of that program. Empty means every batch — see models/User.ts. */
  batches: string[];
};

/** What the app passes around. Never carries the password hash. */
export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "suspended";
  /** Profile picture, or null — the shells render initials without one. */
  avatarUrl: string | null;
  assignments: Assignment[];
  mustChangePassword: boolean;
};

/** The signed-in user, or null. Suspended accounts read as signed out. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await readSession();
  if (!session) return null;

  await connectToDatabase();
  const doc = await User.findById(session.sub)
    .select("name email role status avatar assignments mustChangePassword")
    .lean();

  if (!doc || doc.status !== "active") return null;

  /**
   * The token's `role` is a **copy**, and a copy goes stale the moment an admin
   * changes the record. Treat a stale one as no session at all — the same
   * answer a suspended account gets two lines above, and for the same reason.
   *
   * This is not belt-and-braces; without it the app deadlocks. The proxy routes
   * on the cookie's role because on the edge it has nothing else, so it sends a
   * demoted teacher's `/dashboard` request to `/teacher`; this file reads the
   * database, so it sends `/teacher` back to `/dashboard`. Neither is wrong
   * alone and nothing breaks the tie: the browser gives up with
   * ERR_TOO_MANY_REDIRECTS, on every protected page, until the cookie expires a
   * week later.
   *
   * Returning null ends it, because `/login` is not a protected prefix: the
   * guard sends them there, and the login page — which calls this same function
   * — agrees they are signed out and renders the form instead of bouncing them
   * home again. Signing in mints a token that matches, and the cookie is
   * replaced rather than left to rot.
   */
  if (doc.role !== session.role) return null;

  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    role: doc.role as Role,
    status: doc.status as "active" | "suspended",
    avatarUrl: doc.avatar?.url ?? null,
    assignments: (doc.assignments ?? []).map((item) => ({
      programSlug: item.programSlug,
      courseIds: item.courseIds ?? [],
      batches: item.batches ?? [],
    })),
    mustChangePassword: Boolean(doc.mustChangePassword),
  };
}

/** Where someone with a temporary password is held until they replace it. */
export const CHANGE_PASSWORD_PATH = "/account/password";

/**
 * Signed in, or sent to log in.
 *
 * An account flagged `mustChangePassword` is diverted to the change-password
 * screen and cannot reach anything else — that flag exists because somebody
 * else typed the password and therefore knows it. `skipPasswordGate` is for the
 * change-password screen itself, which would otherwise redirect to itself
 * forever.
 */
export async function requireUser(
  options: { skipPasswordGate?: boolean } = {},
): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  if (user.mustChangePassword && !options.skipPasswordGate) {
    redirect(CHANGE_PASSWORD_PATH);
  }

  return user;
}

/**
 * Signed in **and** holding one of these roles. Admin is always admitted —
 * that is the whole of "admin can do everything a teacher or manager can".
 *
 * A wrong role is sent to their own home rather than shown a 403: they are not
 * lost, they are simply somewhere that isn't theirs.
 */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();

  if (user.role !== "admin" && !roles.includes(user.role)) {
    redirect(ROLE_HOME[user.role]);
  }

  return user;
}

/** True when the user's assignments cover this program. */
export function ownsProgram(user: CurrentUser, programSlug: string): boolean {
  if (user.role === "admin") return true;
  return user.assignments.some((item) => item.programSlug === programSlug);
}

/**
 * True when the user may work on this course. A program manager owns every
 * course in their programs; a teacher owns only the courses listed against
 * theirs (an empty `courseIds` means the whole program).
 */
export function ownsCourse(
  user: CurrentUser,
  programSlug: string,
  courseId: string,
): boolean {
  if (user.role === "admin") return true;

  const assignment = user.assignments.find(
    (item) => item.programSlug === programSlug,
  );
  if (!assignment) return false;
  if (user.role === "program_manager") return true;

  return assignment.courseIds.length === 0
    ? true
    : assignment.courseIds.includes(courseId);
}

/**
 * Which cohorts of this program the user works with, or `null` for all of them.
 *
 * `null` is the answer for an admin, for a program manager (the whole program's
 * cohorts are theirs), and for a teacher whose assignment names no batches —
 * the "empty means every batch" convention from models/User.ts. Anything else
 * is the list to narrow a query by.
 *
 * Returning `null` rather than an empty array for "everything" is deliberate:
 * an empty array is the natural shape of "nothing", and a caller that confused
 * the two would either leak every cohort or hide them all. Callers read as
 * `const scope = batchScopeFor(...); scope === null ? {} : { batch: { $in: scope } }`.
 */
export function batchScopeFor(
  user: CurrentUser,
  programSlug: string,
): string[] | null {
  if (user.role === "admin") return null;

  const assignment = user.assignments.find(
    (item) => item.programSlug === programSlug,
  );
  if (!assignment) return [];

  // A manager owns every cohort of a program they run — batches are a thing
  // they create, not a thing they are given.
  if (user.role === "program_manager") return null;

  return assignment.batches.length === 0 ? null : assignment.batches;
}

/**
 * True when the user may work with this cohort of this program.
 *
 * A student with no batch on their enrolment (`""`) is visible only to someone
 * who holds the whole program. They belong to no cohort, so no cohort's teacher
 * can claim them, and showing them to *every* batch teacher would be the leak
 * this feature exists to close. They stay visible to the admin and the manager,
 * which is where an unbatched enrolment gets noticed and fixed.
 */
export function ownsBatch(
  user: CurrentUser,
  programSlug: string,
  batch: string,
): boolean {
  const scope = batchScopeFor(user, programSlug);
  if (scope === null) return ownsProgram(user, programSlug);

  return batch !== "" && scope.includes(batch);
}

/**
 * Refuse anything outside the user's scope.
 *
 * `notFound()`, not a 403: a program a manager doesn't run should be
 * indistinguishable from one that doesn't exist. "You may not see this" still
 * confirms it exists.
 *
 * `batch` narrows the same way `course` does, and for the same reason: the
 * program is the container, and holding the container is not holding everything
 * in it. Pass it wherever the thing being touched belongs to one cohort — a
 * student's row, a batch's session, a task aimed at a cohort.
 */
export function assertScope(
  user: CurrentUser,
  scope: { program: string; course?: string; batch?: string },
): void {
  if (!ownsProgram(user, scope.program)) notFound();

  if (scope.course && !ownsCourse(user, scope.program, scope.course)) {
    notFound();
  }

  // An empty batch here means "not tied to a cohort" — a session scheduled for
  // the whole program — which every teacher on it may see, so there is nothing
  // to narrow. Note that the *opposite* default is right for a student with no
  // batch on their enrolment: they belong to no cohort, so no cohort's teacher
  // holds them. Those readers call `ownsBatch` directly rather than this.
  if (scope.batch && !ownsBatch(user, scope.program, scope.batch)) {
    notFound();
  }
}
