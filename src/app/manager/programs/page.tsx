import { Library } from "lucide-react";
import type { Metadata } from "next";

import { PageHeading } from "@/components/staff/StatTile";
import { TreeList, TreeRow } from "@/components/staff/curriculum/TreeRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireRole } from "@/lib/auth/guards";
import { listProgramsForStaff } from "@/lib/data/curriculum-staff";

/**
 * The programs a manager looks after — read-only, on purpose.
 *
 * A program manager owns the cohort and the timetable, not the content. There
 * is no edit control anywhere under here and no content capability in their
 * grant, so this screen can only ever show them what their students are working
 * through. Draft counts are deliberately omitted: an unpublished subtopic is a
 * teacher's business, and surfacing it here would invite a manager to chase it.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Programs" };

export default async function ManagerProgramsPage() {
  const user = await requireRole("program_manager");

  const all = await listProgramsForStaff();
  const mine =
    user.role === "admin"
      ? all
      : all.filter((program) =>
          user.assignments.some((row) => row.programSlug === program.slug),
        );

  return (
    <div className="space-y-6">
      <PageHeading
        title="Programs"
        description="What your students are working through. Content is the teacher's to change."
      />

      {mine.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No programs assigned"
          description="An admin assigns program managers to programs from the People screen."
        />
      ) : (
        <TreeList>
          {mine.map((program) => (
            <TreeRow
              key={program.slug}
              href={`/manager/programs/${program.slug}`}
              icon={Library}
              title={program.title}
              meta={`${program.courses} courses · ${program.modules} modules · ${program.subtopics} subtopics`}
            />
          ))}
        </TreeList>
      )}
    </div>
  );
}
