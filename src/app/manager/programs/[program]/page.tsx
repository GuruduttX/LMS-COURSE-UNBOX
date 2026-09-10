import { Library } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeading } from "@/components/staff/StatTile";
import { Breadcrumb } from "@/components/staff/curriculum/Breadcrumb";
import { ProgramTeachers } from "@/components/staff/curriculum/ProgramTeachers";
import { TreeList, TreeRow } from "@/components/staff/curriculum/TreeRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { assertScope, requireRole } from "@/lib/auth/guards";
import { formatDate } from "@/lib/curriculum/format";
import { moduleSubtopics } from "@/lib/curriculum/status";
import { getProgramCurriculum } from "@/lib/data/curriculum-db";
import { teachersOnProgram } from "@/lib/data/teacher-assignments";

/**
 * One program's shape, as a manager sees it.
 *
 * Read **without** `includeDrafts` — a manager sees exactly what a student
 * sees, which is the useful view when a student asks them a question about the
 * course. Rows don't link anywhere: there is no manager-side subtopic screen,
 * and a link into the teacher's area would 404 them at the guard.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/manager/programs/[program]">): Promise<Metadata> {
  const { program } = await params;
  const curriculum = await getProgramCurriculum(program);
  return { title: curriculum?.program.title ?? "Program" };
}

export default async function ManagerProgramPage({
  params,
}: PageProps<"/manager/programs/[program]">) {
  const user = await requireRole("program_manager");

  const { program: slug } = await params;
  assertScope(user, { program: slug });

  const curriculum = await getProgramCurriculum(slug);
  if (!curriculum) notFound();

  const teachers = await teachersOnProgram(slug);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Programs", href: "/manager/programs" },
          { label: curriculum.program.title },
        ]}
      />

      <PageHeading
        title={curriculum.program.title}
        description={
          curriculum.deadline
            ? `Programme deadline ${formatDate(curriculum.deadline)}`
            : curriculum.program.summary || undefined
        }
      />

      <ProgramTeachers programSlug={slug} teachers={teachers} />

      {curriculum.courses.length === 0 ? (
        <EmptyState
          icon={Library}
          title="Nothing published yet"
          description="The teachers on this program haven't published any courses."
        />
      ) : (
        <TreeList>
          {curriculum.courses.map((course) => {
            const subtopics = course.modules.flatMap((module) =>
              moduleSubtopics(module.topics),
            );
            return (
              <TreeRow
                key={course.id}
                icon={Library}
                eyebrow={course.number ? `Course ${course.number}` : "Checkpoint"}
                title={course.title}
                meta={`${course.modules.length} modules · ${subtopics.length} subtopics · ${course.assignments.length} assignments${
                  course.finalTest ? " · final test" : ""
                }`}
              />
            );
          })}
        </TreeList>
      )}
    </div>
  );
}
