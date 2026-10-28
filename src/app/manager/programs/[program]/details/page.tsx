import type { Metadata } from "next";

import { ProgramDetailsEditor } from "@/components/staff/curriculum/ProgramDetailsEditor";
import { getProgramCurriculum } from "@/lib/data/curriculum-db";

/**
 * The manager's mirror of `/admin/programs/[program]/details`.
 *
 * A manager owns how the programs they run are presented; what those programs
 * cost is still admin-only. `ProgramDetailsEditor` enforces both, and
 * `assertScope` inside it is what limits a manager to their own programs.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/manager/programs/[program]/details">): Promise<Metadata> {
  const { program } = await params;
  const curriculum = await getProgramCurriculum(program);

  return {
    title: curriculum ? `Details — ${curriculum.program.title}` : "Details",
  };
}

export default async function ManagerProgramDetailsPage({
  params,
}: PageProps<"/manager/programs/[program]/details">) {
  const { program } = await params;
  return <ProgramDetailsEditor area="manager" programSlug={program} />;
}
