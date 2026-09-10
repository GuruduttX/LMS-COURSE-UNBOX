import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeading } from "@/components/staff/StatTile";
import { Breadcrumb } from "@/components/staff/curriculum/Breadcrumb";
import { ModuleDetail } from "@/components/staff/curriculum/ModuleDetail";
import { NodeBadge } from "@/components/staff/curriculum/NodeBadge";
import { NodeActions } from "@/components/staff/curriculum/NodeActions";
import { teacherHrefs } from "@/components/staff/curriculum/hrefs";
import { ButtonLink } from "@/components/ui/Button";
import { findModule } from "@/lib/curriculum/find";
import { loadTeacherCourse } from "../../../../../load";

export const dynamic = "force-dynamic";

type Params =
  PageProps<"/teacher/programs/[program]/courses/[course]/modules/[module]">;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { program, course, module: moduleKey } = await params;
  const { course: view } = await loadTeacherCourse(program, course);
  return { title: findModule(view, moduleKey)?.title ?? "Module" };
}

export default async function TeacherModulePage({ params }: Params) {
  const { program: slug, course: courseKey, module: moduleKey } = await params;
  const { curriculum, course, user } = await loadTeacherCourse(slug, courseKey);

  const view = findModule(course, moduleKey);
  if (!view) notFound();

  const hrefs = teacherHrefs(slug);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "My programs", href: "/teacher/programs" },
          { label: curriculum.program.title, href: hrefs.program() },
          { label: course.title, href: hrefs.course(course.id) },
          { label: `Module ${view.number}` },
        ]}
      />

      <PageHeading
        title={view.title}
        description={`Module ${view.number} of ${course.title}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <NodeBadge status={view.nodeStatus} />
            <ButtonLink
              href={hrefs.editModule(course.id, view.id)}
              variant="secondary"
            >
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
          type: "module",
          nodeKey: view.id,
          title: view.title,
        }}
        status={view.nodeStatus}
        role={user.role}
        returnTo={hrefs.course(course.id)}
      />

      <ModuleDetail
        module={view}
        courseKey={course.id}
        hrefs={hrefs}
        authoring={{ programSlug: slug, role: user.role }}
      />
    </div>
  );
}
