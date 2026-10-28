import { Library, Megaphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeading } from "@/components/staff/StatTile";
import { Breadcrumb } from "@/components/staff/curriculum/Breadcrumb";
import { ProgramTeachers } from "@/components/staff/curriculum/ProgramTeachers";
import { TreeList, TreeRow } from "@/components/staff/curriculum/TreeRow";
import { ButtonLink } from "@/components/ui/Button";
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
        action={
          <ButtonLink
            href={`/manager/programs/${slug}/details`}
            variant="secondary"
          >
            <Megaphone size={16} aria-hidden />
            Public details
          </ButtonLink>
        }
      />

      {curriculum.program.hasDetails ? null : (
        <p className="flex items-start gap-2 rounded-lg border border-warning-500/30 bg-warning-50 p-3 text-sm text-warning-800">
          <Megaphone size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">
              This program is live on the site with no public details.
            </span>{" "}
            Visitors see its title, its summary and the curriculum — no pitch, no
            cover and nothing about what it offers.{" "}
            <Link
              href={`/manager/programs/${slug}/details`}
              className="font-semibold underline"
            >
              Write them
            </Link>
            .
          </span>
        </p>
      )}

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
