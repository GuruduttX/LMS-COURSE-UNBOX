/**
 * Edit course — the guard and one shared screen.
 *
 * Everything that makes this page is in `curriculum/editors.tsx`, so the
 * admin's copy and the teacher's copy cannot drift apart. The role check lives
 * inside the editor, in `loadStaffProgram`, where every screen in this area
 * gets it whether or not the author of a new route remembered.
 */
import type { Metadata } from "next";

import { CourseEditor } from "@/components/staff/curriculum/editors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit course" };

type Params = PageProps<"/admin/programs/[program]/courses/[course]/edit">;

export default async function Page({ params }: Params) {
  const { program, course } = await params;

  return (
    <CourseEditor
      area="admin"
      programSlug={program}
      courseKey={course}
    />
  );
}
