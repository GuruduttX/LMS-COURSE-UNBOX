import { Pencil } from "lucide-react";
import type { Metadata } from "next";

import { PageHeading } from "@/components/staff/StatTile";
import { Breadcrumb } from "@/components/staff/curriculum/Breadcrumb";
import { CourseDetail } from "@/components/staff/curriculum/CourseDetail";
import { NodeBadge } from "@/components/staff/curriculum/NodeBadge";
import { NodeActions } from "@/components/staff/curriculum/NodeActions";
import { teacherHrefs } from "@/components/staff/curriculum/hrefs";
import { ButtonLink } from "@/components/ui/Button";
import { loadTeacherCourse } from "../../../load";

export const dynamic = "force-dynamic";

type Params = PageProps<"/teacher/programs/[program]/courses/[course]">;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { program, course } = await params;
  const { course: view } = await loadTeacherCourse(program, course);
  return { title: view.title };
}

export default async function TeacherCoursePage({ params }: Params) {
  const { program: slug, course: courseKey } = await params;
  const { curriculum, course, user } = await loadTeacherCourse(slug, courseKey);
  const hrefs = teacherHrefs(slug);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "My programs", href: "/teacher/programs" },
          { label: curriculum.program.title, href: hrefs.program() },
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
          area: "teacher",
          programSlug: slug,
          type: "course",
          nodeKey: course.id,
          title: course.title,
        }}
        status={course.nodeStatus}
        role={user.role}
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
