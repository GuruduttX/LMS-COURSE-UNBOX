import type { Metadata } from "next";

import { ProgramDetailsEditor } from "@/components/staff/curriculum/ProgramDetailsEditor";
import { getProgramCurriculum } from "@/lib/data/curriculum-db";

/**
 * A program's public pitch. The screen itself is `ProgramDetailsEditor`, shared
 * with the manager's mirror of this route — see the note there about why this
 * one is not part of `editors.tsx`.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/admin/programs/[program]/details">): Promise<Metadata> {
  const { program } = await params;
  const curriculum = await getProgramCurriculum(program, { includeDrafts: true });

  return {
    title: curriculum ? `Details — ${curriculum.program.title}` : "Details",
  };
}

export default async function AdminProgramDetailsPage({
  params,
}: PageProps<"/admin/programs/[program]/details">) {
  const { program } = await params;
  return <ProgramDetailsEditor area="admin" programSlug={program} />;
}
