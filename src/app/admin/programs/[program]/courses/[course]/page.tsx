import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeading } from "@/components/staff/StatTile";
import { Breadcrumb } from "@/components/staff/curriculum/Breadcrumb";
import { CourseDetail } from "@/components/staff/curriculum/CourseDetail";
import { NodeBadge } from "@/components/staff/curriculum/NodeBadge";
import { NodeActions } from "@/components/staff/curriculum/NodeActions";
import { adminHrefs } from "@/components/staff/curriculum/hrefs";
import { ButtonLink } from "@/components/ui/Button";
import { requireRole } from "@/lib/auth/guards";
import { findCourse } from "@/lib/curriculum/find";
import { getProgramCurriculum } from "@/lib/data/curriculum-db";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/admin/programs/[program]/courses/[course]">): Promise<Metadata> {
  const { program, course } = await params;
  const curriculum = await getProgramCurriculum(program, { includeDrafts: true });
  const found = curriculum ? findCourse(curriculum, course) : null;
  return { title: found?.title ?? "Course" };
}

export default async function AdminCoursePage({
  params,
}: PageProps<"/admin/programs/[program]/courses/[course]">) {
  const actor = await requireRole("admin");

  const { program: slug, course: courseKey } = await params;
  const curriculum = await getProgramCurriculum(slug, { includeDrafts: true });
  if (!curriculum) notFound();

  const course = findCourse(curriculum, courseKey);
  if (!course) notFound();

  const hrefs = adminHrefs(slug);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Programs", href: "/admin/programs" },
          { label: curriculum.program.title, href: `/admin/programs/${slug}` },
          { label: course.title },
        ]}
      />

      <PageHeading
        title={course.title}
        description={course.summary || undefined}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <NodeBadge status={course.nodeStatus} />
            <ButtonLink href={hrefs.editCourse(course.id)} variant="secondary">
              <Pencil size={16} aria-hidden />
              Edit details
            </ButtonLink>
          </div>
        }
      />

      <NodeActions
        node={{
          area: "admin",
          programSlug: slug,
          type: "course",
          nodeKey: course.id,
          title: course.title,
        }}
        status={course.nodeStatus}
        role={actor.role}
        returnTo={hrefs.program()}
      />

      <CourseDetail
        course={course}
        hrefs={hrefs}
        authoring={{ programSlug: slug }}
      />
    </div>
  );
}
