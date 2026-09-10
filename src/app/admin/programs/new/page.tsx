/**
 * New program — admin only.
 *
 * Not because of the content but because of the slug: it is the join key for
 * live sessions, enrolments and staff assignments, so minting one is a decision
 * about the institution rather than about teaching.
 */
import type { Metadata } from "next";

import { PageHeading } from "@/components/staff/StatTile";
import { Breadcrumb } from "@/components/staff/curriculum/Breadcrumb";
import { ProgramForm } from "@/components/staff/curriculum/forms/ProgramForm";
import { requireRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New program" };

export default async function NewProgramPage() {
  await requireRole("admin");

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Programs", href: "/admin/programs" },
          { label: "New program" },
        ]}
      />
      <PageHeading
        title="New program"
        description="The root of a curriculum tree. Courses, modules, topics and subtopics go inside it."
      />
      <ProgramForm mode="create" cancelHref="/admin/programs" />
    </div>
  );
}
