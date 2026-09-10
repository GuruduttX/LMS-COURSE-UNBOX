import "server-only";

/**
 * The teacher area's loaders.
 *
 * Both are now one line each: `lib/data/staff-program.ts` does the work for
 * whichever area asked, because `/admin/programs/**` and `/teacher/programs/**`
 * render the same screens over the same tree and only differ in which role is
 * admitted and which links are built. Two loaders would be two places for the
 * guard order — **requireRole, then assertScope** — to drift.
 *
 * These stay as named exports so the teacher pages read in their own terms.
 */
import {
  loadStaffCourse,
  loadStaffProgram,
  type LoadedCourse,
  type LoadedProgram,
} from "@/lib/data/staff-program";

export type { LoadedCourse, LoadedProgram };

export function loadTeacherProgram(
  programSlug: string,
): Promise<LoadedProgram> {
  return loadStaffProgram("teacher", programSlug);
}

export function loadTeacherCourse(
  programSlug: string,
  courseKey: string,
): Promise<LoadedCourse> {
  return loadStaffCourse("teacher", programSlug, courseKey);
}
