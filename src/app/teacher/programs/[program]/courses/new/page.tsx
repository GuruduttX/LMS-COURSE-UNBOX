/**
 * New course — the guard and one shared screen.
 *
 * Everything that makes this page is in `curriculum/editors.tsx`, so the
 * admin's copy and the teacher's copy cannot drift apart. The role check lives
 * inside the editor, in `loadStaffProgram`, where every screen in this area
 * gets it whether or not the author of a new route remembered.
 */
import type { Metadata } from "next";

import { CourseEditor } from "@/components/staff/curriculum/editors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New course" };

type Params = PageProps<"/teacher/programs/[program]/courses/new">;

export default async function Page({ params, searchParams }: Params) {
  const { program } = await params;
  const query = await searchParams;

  return (
    <CourseEditor
      area="teacher"
      programSlug={program}
      // `?checkpoint=1` comes from "Add a term exam" on the program screen. It
      // only changes the copy and hides the number field — the thing that makes
      // a checkpoint is still an empty `number`, decided in the action.
      checkpoint={query.checkpoint === "1"}
    />
  );
}
