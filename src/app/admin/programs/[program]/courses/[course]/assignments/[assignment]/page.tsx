/**
 * One assignment — the guard and one shared screen.
 *
 * The builder is the screen: an assignment is a brief and a set of rules about
 * handing in, so a separate read-only view would be this with the fields greyed
 * out.
 */
import type { Metadata } from "next";

import { AssignmentEditor } from "@/components/staff/curriculum/editors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Assignment" };

type Params = PageProps<"/admin/programs/[program]/courses/[course]/assignments/[assignment]">;

export default async function Page({ params }: Params) {
  const { program, course, assignment } = await params;

  return (
    <AssignmentEditor
      area="admin"
      programSlug={program}
      courseKey={course}
      assignmentKey={assignment}
    />
  );
}
