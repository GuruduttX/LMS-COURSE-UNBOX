/** One program's students. Guard and scope check live in the loader. */
import type { Metadata } from "next";

import { ProgramStudentsScreen } from "@/components/staff/students/screens";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Students" };

type Params = PageProps<"/admin/students/[program]">;

export default async function Page({ params }: Params) {
  const { program } = await params;
  return <ProgramStudentsScreen area="admin" programSlug={program} />;
}
