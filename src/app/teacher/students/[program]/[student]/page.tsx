/** One student on one program: progress, marks and their hand-ins. */
import type { Metadata } from "next";

import { StudentDetailScreen } from "@/components/staff/students/screens";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Student" };

type Params = PageProps<"/teacher/students/[program]/[student]">;

export default async function Page({ params }: Params) {
  const { program, student } = await params;
  return (
    <StudentDetailScreen area="teacher" programSlug={program} studentId={student} />
  );
}
