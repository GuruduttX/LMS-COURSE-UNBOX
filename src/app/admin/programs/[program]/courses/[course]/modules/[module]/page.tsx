import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeading } from "@/components/staff/StatTile";
import { Breadcrumb } from "@/components/staff/curriculum/Breadcrumb";
import { ModuleDetail } from "@/components/staff/curriculum/ModuleDetail";
import { NodeBadge } from "@/components/staff/curriculum/NodeBadge";
import { NodeActions } from "@/components/staff/curriculum/NodeActions";
import { adminHrefs } from "@/components/staff/curriculum/hrefs";
import { ButtonLink } from "@/components/ui/Button";
import { requireRole } from "@/lib/auth/guards";
import { findCourse, findModule } from "@/lib/curriculum/find";
import { getProgramCurriculum } from "@/lib/data/curriculum-db";

export const dynamic = "force-dynamic";

type Params = PageProps<"/admin/programs/[program]/courses/[course]/modules/[module]">;

export async function generateMetadata({
  params,
}: Params): Promise<Metadata> {
  const { program, course, module: moduleKey } = await params;
  const curriculum = await getProgramCurriculum(program, { includeDrafts: true });
  const found = curriculum ? findCourse(curriculum, course) : null;
  const view = found ? findModule(found, moduleKey) : null;
  return { title: view?.title ?? "Module" };
}

export default async function AdminModulePage({ params }: Params) {
  const actor = await requireRole("admin");

  const { program: slug, course: courseKey, module: moduleKey } = await params;
  const curriculum = await getProgramCurriculum(slug, { includeDrafts: true });
  if (!curriculum) notFound();

  const course = findCourse(curriculum, courseKey);
  if (!course) notFound();

  const view = findModule(course, moduleKey);
  if (!view) notFound();

  const hrefs = adminHrefs(slug);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Programs", href: "/admin/programs" },
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
          area: "admin",
          programSlug: slug,
          type: "module",
          nodeKey: view.id,
          title: view.title,
        }}
        status={view.nodeStatus}
        role={actor.role}
        returnTo={hrefs.course(course.id)}
      />

      <ModuleDetail
        module={view}
        courseKey={course.id}
        hrefs={hrefs}
        authoring={{ programSlug: slug, role: actor.role }}
      />
    </div>
  );
}
