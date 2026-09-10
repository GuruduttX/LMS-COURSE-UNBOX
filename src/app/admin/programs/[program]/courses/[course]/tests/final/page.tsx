/**
 * The course's final test — the guard and one shared screen.
 *
 * The route exists whether or not the test does: arriving here for a course
 * with no final test is a create, not a 404, which is what makes the link on
 * the course screen honest. The role check lives inside the editor, in
 * `loadStaffCourse`, where every screen in this area gets it.
 */
import type { Metadata } from "next";

import { AssessmentEditor } from "@/components/staff/curriculum/editors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Final test" };

type Params = PageProps<"/admin/programs/[program]/courses/[course]/tests/final">;

export default async function Page({ params }: Params) {
  const { program, course } = await params;

  return (
    <AssessmentEditor
      area="admin"
      scope="final_test"
      programSlug={program}
      courseKey={course}
    />
  );
}
