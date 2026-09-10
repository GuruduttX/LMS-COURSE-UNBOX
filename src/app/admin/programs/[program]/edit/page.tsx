/**
 * Edit a program's details. The tree inside it is edited from its own screen.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeading } from "@/components/staff/StatTile";
import { Breadcrumb } from "@/components/staff/curriculum/Breadcrumb";
import { ProgramForm } from "@/components/staff/curriculum/forms/ProgramForm";
import { requireRole } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db";
import { Program } from "@/models/Program";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit program" };

export default async function EditProgramPage({
  params,
}: PageProps<"/admin/programs/[program]/edit">) {
  await requireRole("admin");

  const { program: slug } = await params;

  // Read straight from the model rather than through `getProgramCurriculum`:
  // this form edits the program's own fields and has no use for its tree.
  await connectToDatabase();
  const program = await Program.findOne({ slug }).lean();
  if (!program) notFound();

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Programs", href: "/admin/programs" },
          { label: program.title, href: `/admin/programs/${slug}` },
          { label: "Edit" },
        ]}
      />
      <PageHeading
        title={`Edit ${program.title}`}
        description="Its courses are edited from the program screen."
      />
      <ProgramForm
        mode="edit"
        cancelHref={`/admin/programs/${slug}`}
        initial={{
          slug: program.slug,
          title: program.title,
          summary: program.summary ?? "",
          deadline: program.deadline
            ? program.deadline.toISOString().slice(0, 10)
            : "",
          status: program.status,
        }}
      />
    </div>
  );
}
