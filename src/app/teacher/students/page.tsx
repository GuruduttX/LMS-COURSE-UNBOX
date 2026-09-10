/**
 * Students — the programs this person may see, then their students.
 *
 * A guard plus one shared screen, like every other page in this area: the role
 * check and the scope check both live in `lib/data/students.ts`, so a route
 * added here later cannot forget either.
 */
import type { Metadata } from "next";

import { StudentProgramsScreen } from "@/components/staff/students/screens";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Students" };

export default async function Page() {
  return <StudentProgramsScreen area="teacher" />;
}
