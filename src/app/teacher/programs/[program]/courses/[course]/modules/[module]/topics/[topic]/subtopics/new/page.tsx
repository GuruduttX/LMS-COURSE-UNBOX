/**
 * New subtopic — the guard and one shared screen.
 *
 * Everything that makes this page is in `curriculum/editors.tsx`, so the
 * admin's copy and the teacher's copy cannot drift apart. The role check lives
 * inside the editor, in `loadStaffProgram`, where every screen in this area
 * gets it whether or not the author of a new route remembered.
 */
import type { Metadata } from "next";

import { SubtopicEditor } from "@/components/staff/curriculum/editors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New subtopic" };

type Params = PageProps<"/teacher/programs/[program]/courses/[course]/modules/[module]/topics/[topic]/subtopics/new">;

export default async function Page({ params }: Params) {
  const { program, course, module: moduleKey, topic } = await params;

  return (
    <SubtopicEditor
      area="teacher"
      programSlug={program}
      courseKey={course}
      moduleKey={moduleKey}
      topicKey={topic}
    />
  );
}
