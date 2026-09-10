import { Library, Plus } from "lucide-react";
import type { Metadata } from "next";

import { PageHeading } from "@/components/staff/StatTile";
import { NodeBadge } from "@/components/staff/curriculum/NodeBadge";
import { TreeList, TreeRow } from "@/components/staff/curriculum/TreeRow";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireRole } from "@/lib/auth/guards";
import { listProgramsForStaff } from "@/lib/data/curriculum-staff";

/**
 * Every program in the institution, and how much of each is actually written.
 *
 * The draft count is the number that matters here: a program can look complete
 * by course count and still be invisible to students because nothing in it is
 * published. Naming it on the row saves opening the program to find out.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Programs" };

export default async function AdminProgramsPage() {
  await requireRole("admin");

  const programs = await listProgramsForStaff();

  return (
    <div className="space-y-6">
      <PageHeading
        title="Programs"
        description="The curriculum: programs, their courses, and everything inside them."
        action={
          <ButtonLink href="/admin/programs/new">
            <Plus size={16} aria-hidden />
            New program
          </ButtonLink>
        }
      />

      {programs.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No programs yet"
          description="Create one, or run `npm run seed:curriculum` to bring the existing curriculum into the database."
          action={
            <ButtonLink href="/admin/programs/new">
              <Plus size={16} aria-hidden />
              New program
            </ButtonLink>
          }
        />
      ) : (
        <TreeList>
          {programs.map((program) => (
            <TreeRow
              key={program.slug}
              href={`/admin/programs/${program.slug}`}
              icon={Library}
              title={program.title}
              badges={<NodeBadge status={program.status} />}
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
