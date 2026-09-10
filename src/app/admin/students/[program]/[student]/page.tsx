/** One student on one program: progress, marks and their hand-ins. */
import type { Metadata } from "next";

import { StudentDetailScreen } from "@/components/staff/students/screens";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Student" };

type Params = PageProps<"/admin/students/[program]/[student]">;

export default async function Page({ params }: Params) {
  const { program, student } = await params;
  return (
    <StudentDetailScreen area="admin" programSlug={program} studentId={student} />
  );
}
