import { GraduationCap, Library, Pencil, Plus, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeading, StatTile } from "@/components/staff/StatTile";
import { Breadcrumb } from "@/components/staff/curriculum/Breadcrumb";
import { NodeBadge } from "@/components/staff/curriculum/NodeBadge";
import { TermExams } from "@/components/staff/curriculum/TermExams";
import { TreeList, TreeRow } from "@/components/staff/curriculum/TreeRow";
import { MoveButtons, NodeActions } from "@/components/staff/curriculum/NodeActions";
import { ProgramTeachers } from "@/components/staff/curriculum/ProgramTeachers";
import { adminHrefs } from "@/components/staff/curriculum/hrefs";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireRole } from "@/lib/auth/guards";
import { formatDate } from "@/lib/curriculum/format";
import { getProgramCurriculum } from "@/lib/data/curriculum-db";
import { authoredCounts } from "@/lib/data/curriculum-staff";
import { teachersOnProgram } from "@/lib/data/teacher-assignments";

/**
 * One program's courses.
 *
 * Read with `includeDrafts` — this is the authoring side, so unpublished work
 * has to be visible or it can never be finished. Note the lock states shown to
 * students are deliberately *absent* here: they are per-student, and this page
 * has no student.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/admin/programs/[program]">): Promise<Metadata> {
  const { program } = await params;
  const curriculum = await getProgramCurriculum(program, { includeDrafts: true });
  return { title: curriculum?.program.title ?? "Program" };
}

export default async function AdminProgramPage({
  params,
}: PageProps<"/admin/programs/[program]">) {
  const actor = await requireRole("admin");

  const { program: slug } = await params;
  const curriculum = await getProgramCurriculum(slug, { includeDrafts: true });
  if (!curriculum) notFound();

  const [counts, teachers] = await Promise.all([
    authoredCounts(slug),
    teachersOnProgram(slug),
  ]);
  const hrefs = adminHrefs(slug);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Programs", href: "/admin/programs" },
          { label: curriculum.program.title },
        ]}
      />

      <PageHeading
        title={curriculum.program.title}
        description={curriculum.program.summary || undefined}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink
              href={`/admin/programs/${slug}/fees`}
              variant="secondary"
            >
              <Wallet size={16} aria-hidden />
              Fees
            </ButtonLink>
            <ButtonLink href={hrefs.editProgram()} variant="secondary">
              <Pencil size={16} aria-hidden />
              Edit details
            </ButtonLink>
            <ButtonLink href={hrefs.newCourse()}>
              <Plus size={16} aria-hidden />
              Add a course
            </ButtonLink>
          </div>
        }
      />

      <NodeActions
        node={{
          area: "admin",
          programSlug: slug,
          type: "program",
          nodeKey: "",
          title: curriculum.program.title,
        }}
        status={curriculum.program.nodeStatus}
        role={actor.role}
        returnTo="/admin/programs"
      />

      {counts ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Courses"
            value={curriculum.courses.length}
            icon={Library}
          />
          <StatTile
            label="Subtopics"
            value={counts.subtopics}
            hint={`across ${counts.topics} topics`}
            icon={GraduationCap}
          />
          <StatTile
            label="Assignments"
            value={counts.assignments}
            hint="handed in, then marked"
            icon={GraduationCap}
          />
          <StatTile
            label="Tests"
            value={counts.moduleTests + counts.finalTests + counts.termTests}
            hint={
              counts.emptyTests > 0
                ? `${counts.emptyTests} with no questions yet`
                : `${counts.finalTests} final · ${counts.moduleTests} module · ${counts.termTests} term`
            }
            icon={GraduationCap}
          />
        </div>
      ) : null}

      <ProgramTeachers programSlug={slug} teachers={teachers} />

      {curriculum.courses.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No courses in this program"
          description="A course holds the modules, the assignments and the final test."
          action={
            <ButtonLink href={hrefs.newCourse()}>
              <Plus size={16} aria-hidden />
              Add the first course
            </ButtonLink>
          }
        />
      ) : (
        <TreeList>
          {curriculum.courses.map((course, index) => (
            <TreeRow
              key={course.id}
              aside={
                <MoveButtons
                  node={{
                    area: "admin",
                    programSlug: slug,
                    type: "course",
                    nodeKey: course.id,
                    title: course.title,
                  }}
                  first={index === 0}
                  last={index === curriculum.courses.length - 1}
                />
              }
              href={hrefs.course(course.id)}
              icon={Library}
              eyebrow={course.number ? `Course ${course.number}` : "Checkpoint"}
              title={course.title}
              badges={<NodeBadge status={course.nodeStatus} />}
              meta={
                <>
                  {course.modules.length} modules · {course.assignments.length}{" "}
                  assignments ·{" "}
                  {course.finalTest ? "final test" : "no final test"}
                  {course.completeBy
                    ? ` · complete by ${formatDate(course.completeBy)}`
                    : ""}
                </>
              }
            />
          ))}
        </TreeList>
      )}

      <TermExams curriculum={curriculum} hrefs={hrefs} authoring />
    </div>
  );
}
