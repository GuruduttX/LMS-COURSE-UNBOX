import "server-only";
import { notFound } from "next/navigation";

/**
 * Loading a program for whichever staff area asked for it.
 *
 * `/admin/programs/**` and `/teacher/programs/**` render the same screens over
 * the same tree and differ in exactly two ways: which role is admitted, and
 * which set of links is built. Both are decided here, once, so a screen added
 * later cannot accidentally admit the wrong role or link out of its own area.
 *
 * The order is the house rule — **requireRole, then assertScope**. `requireRole`
 * establishes "an admin" or "a teacher"; `assertScope` establishes *this*
 * teacher's program, which a role alone cannot say. It calls `notFound()`
 * rather than refusing, because "you may not see this" still confirms the thing
 * exists.
 *
 * Drafts are always included: this is the authoring side, and unpublished work
 * has to be visible or it can never be finished.
 */
import { assertScope, requireRole, type CurrentUser } from "@/lib/auth/guards";
import {
  adminHrefs,
  teacherHrefs,
  type CurriculumHrefs,
} from "@/components/staff/curriculum/hrefs";
import { findCourse, findModule } from "@/lib/curriculum/find";
import type {
  CourseView,
  ModuleView,
  ProgramCurriculum,
} from "@/lib/curriculum/types";
import { getProgramCurriculum } from "@/lib/data/curriculum-db";

export type StaffArea = "admin" | "teacher";

export type LoadedProgram = {
  user: CurrentUser;
  area: StaffArea;
  programSlug: string;
  curriculum: ProgramCurriculum;
  hrefs: CurriculumHrefs;
};

export async function loadStaffProgram(
  area: StaffArea,
  programSlug: string,
): Promise<LoadedProgram> {
  const user =
    area === "admin"
      ? await requireRole("admin")
      : await requireRole("teacher");

  // An admin is in scope everywhere; `assertScope` already knows that, so this
  // is one call rather than a branch.
  assertScope(user, { program: programSlug });

  const curriculum = await getProgramCurriculum(programSlug, {
    includeDrafts: true,
  });
  if (!curriculum) notFound();

  return {
    user,
    area,
    programSlug,
    curriculum,
    hrefs: area === "admin" ? adminHrefs(programSlug) : teacherHrefs(programSlug),
  };
}

export type LoadedCourse = LoadedProgram & { course: CourseView };

export async function loadStaffCourse(
  area: StaffArea,
  programSlug: string,
  courseKey: string,
): Promise<LoadedCourse> {
  const loaded = await loadStaffProgram(area, programSlug);

  // Costs nothing today — nothing sets a narrower assignment — and keeps
  // working the day one is granted.
  assertScope(loaded.user, { program: programSlug, course: courseKey });

  const course = findCourse(loaded.curriculum, courseKey);
  if (!course) notFound();

  return { ...loaded, course };
}

export type LoadedModule = LoadedCourse & { module: ModuleView };

export async function loadStaffModule(
  area: StaffArea,
  programSlug: string,
  courseKey: string,
  moduleKey: string,
): Promise<LoadedModule> {
  const loaded = await loadStaffCourse(area, programSlug, courseKey);

  const view = findModule(loaded.course, moduleKey);
  if (!view) notFound();

  return { ...loaded, module: view };
}
