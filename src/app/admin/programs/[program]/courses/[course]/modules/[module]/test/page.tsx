/**
 * The module's test — the guard and one shared screen.
 *
 * Same screen as the final test; only the scope differs, and with it whether
 * the paper is proctored and whether it counts. See `AssessmentEditor`.
 */
import type { Metadata } from "next";

import { AssessmentEditor } from "@/components/staff/curriculum/editors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Module test" };

type Params = PageProps<"/admin/programs/[program]/courses/[course]/modules/[module]/test">;

export default async function Page({ params }: Params) {
  const { program, course, module: moduleKey } = await params;

  return (
    <AssessmentEditor
      area="admin"
      scope="module_test"
      programSlug={program}
      courseKey={course}
      moduleKey={moduleKey}
    />
  );
}
