/**
 * Edit module — the guard and one shared screen.
 *
 * Everything that makes this page is in `curriculum/editors.tsx`, so the
 * admin's copy and the teacher's copy cannot drift apart. The role check lives
 * inside the editor, in `loadStaffProgram`, where every screen in this area
 * gets it whether or not the author of a new route remembered.
 */
import type { Metadata } from "next";

import { ModuleEditor } from "@/components/staff/curriculum/editors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit module" };

type Params = PageProps<"/admin/programs/[program]/courses/[course]/modules/[module]/edit">;

export default async function Page({ params }: Params) {
  const { program, course, module: moduleKey } = await params;

  return (
    <ModuleEditor
      area="admin"
      programSlug={program}
      courseKey={course}
      moduleKey={moduleKey}
    />
  );
}
