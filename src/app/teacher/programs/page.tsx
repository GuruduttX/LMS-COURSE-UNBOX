import { Library } from "lucide-react";
import type { Metadata } from "next";

import { PageHeading } from "@/components/staff/StatTile";
import { TreeList, TreeRow } from "@/components/staff/curriculum/TreeRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireRole } from "@/lib/auth/guards";
import { programsForTeacher } from "@/lib/data/curriculum-staff";

/**
 * The programs this teacher authors.
 *
 * A teacher is assigned to a **program**, not to individual courses — the
 * courses are inside it. So this is the top of their tree, and it mirrors the
 * admin's program list rather than being a flat course list of its own.
 *
 * The unpublished count is the number that matters to an author: it is the work
 * students cannot see yet.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "My programs" };

export default async function TeacherProgramsPage() {
  const user = await requireRole("teacher");

  const programs = await programsForTeacher(user);

  return (
    <div className="space-y-6">
      <PageHeading
        title="My programs"
        description="The content you author. Students see only what is published."
      />

      {programs.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No programs assigned"
          description="An admin assigns teachers to programs from the People screen."
        />
      ) : (
        <TreeList>
          {programs.map((program) => (
            <TreeRow
              key={program.slug}
              href={`/teacher/programs/${program.slug}`}
              icon={Library}
              title={program.title}
              meta={
                <>
                  {count(program.courses, "course")} ·{" "}
                  {count(program.modules, "module")} ·{" "}
                  {count(program.subtopics, "subtopic")}
                  {program.drafts > 0 ? (
                    <span className="text-amber-700">
                      {" "}
                      · {program.drafts} unpublished
                    </span>
                  ) : null}
                </>
              }
            />
          ))}
        </TreeList>
      )}
    </div>
  );
}

function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}
