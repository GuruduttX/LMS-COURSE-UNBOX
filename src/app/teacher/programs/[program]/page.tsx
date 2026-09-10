import { Library, Plus } from "lucide-react";
import type { Metadata } from "next";

import { PageHeading } from "@/components/staff/StatTile";
import { Breadcrumb } from "@/components/staff/curriculum/Breadcrumb";
import { NodeBadge } from "@/components/staff/curriculum/NodeBadge";
import { TermExams } from "@/components/staff/curriculum/TermExams";
import { TreeList, TreeRow } from "@/components/staff/curriculum/TreeRow";
import { teacherHrefs } from "@/components/staff/curriculum/hrefs";
import { MoveButtons } from "@/components/staff/curriculum/NodeActions";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/curriculum/format";
import { loadTeacherProgram } from "../load";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/teacher/programs/[program]">): Promise<Metadata> {
  const { program } = await params;
  const { curriculum } = await loadTeacherProgram(program);
  return { title: curriculum.program.title };
}

export default async function TeacherProgramPage({
  params,
}: PageProps<"/teacher/programs/[program]">) {
  const { program: slug } = await params;
  const { curriculum } = await loadTeacherProgram(slug);
  const hrefs = teacherHrefs(slug);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "My programs", href: "/teacher/programs" },
          { label: curriculum.program.title },
        ]}
      />

      <PageHeading
        title={curriculum.program.title}
        description={curriculum.program.summary || undefined}
        action={
          <ButtonLink href={hrefs.newCourse()}>
            <Plus size={16} aria-hidden />
            Add a course
          </ButtonLink>
        }
      />

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
                    area: "teacher",
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
