/**
 * A checkpoint's term paper — the guard and one shared screen.
 *
 * The route exists whether or not the paper does: arriving here for a
 * checkpoint that has none is a create, not a 404, which is what makes the link
 * on the course screen honest. The role check lives inside the editor, in
 * `loadStaffCourse`, where every screen in this area gets it.
 *
 * Its own route rather than reusing `tests/final` because it is not a final
 * test: one attempt instead of three, 20 marks a question instead of 5, and an
 * author who has to say whether it is the mid-term or the end-term. A URL
 * saying "final" for a mid-term paper would be the kind of small lie that
 * misleads the next person reading the address bar.
 */
import type { Metadata } from "next";

import { AssessmentEditor } from "@/components/staff/curriculum/editors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Term paper" };

type Params = PageProps<"/teacher/programs/[program]/courses/[course]/tests/term">;

export default async function Page({ params }: Params) {
  const { program, course } = await params;

  return (
    <AssessmentEditor
      area="teacher"
      scope="term_test"
      programSlug={program}
      courseKey={course}
    />
  );
}
