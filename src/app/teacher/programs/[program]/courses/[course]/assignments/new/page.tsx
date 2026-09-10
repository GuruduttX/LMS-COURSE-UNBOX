/**
 * New assignment — the guard and one shared screen.
 *
 * Static, so it wins over the sibling `[assignment]` segment: "new" is never
 * an assignment key.
 */
import type { Metadata } from "next";

import { AssignmentEditor } from "@/components/staff/curriculum/editors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New assignment" };

type Params = PageProps<"/teacher/programs/[program]/courses/[course]/assignments/new">;

export default async function Page({ params }: Params) {
  const { program, course } = await params;

  return (
    <AssignmentEditor area="teacher" programSlug={program} courseKey={course} />
  );
}
