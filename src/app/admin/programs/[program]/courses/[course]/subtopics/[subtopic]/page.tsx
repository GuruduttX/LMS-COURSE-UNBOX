import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeading } from "@/components/staff/StatTile";
import { Breadcrumb } from "@/components/staff/curriculum/Breadcrumb";
import { SubtopicDetail } from "@/components/staff/curriculum/SubtopicDetail";
import { NodeActions } from "@/components/staff/curriculum/NodeActions";
import { adminHrefs } from "@/components/staff/curriculum/hrefs";
import { ButtonLink } from "@/components/ui/Button";
import { requireRole } from "@/lib/auth/guards";
import { findCourse, findSubtopic } from "@/lib/curriculum/find";
import { getProgramCurriculum } from "@/lib/data/curriculum-db";

export const dynamic = "force-dynamic";

type Params = PageProps<"/admin/programs/[program]/courses/[course]/subtopics/[subtopic]">;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { program, course, subtopic } = await params;
  const curriculum = await getProgramCurriculum(program, { includeDrafts: true });
  const found = curriculum ? findCourse(curriculum, course) : null;
  const hit = found ? findSubtopic(found, subtopic) : null;
  return { title: hit?.subtopic.title ?? "Subtopic" };
}

export default async function AdminSubtopicPage({ params }: Params) {
  const actor = await requireRole("admin");

  const { program: slug, course: courseKey, subtopic: subtopicKey } = await params;
  const curriculum = await getProgramCurriculum(slug, { includeDrafts: true });
  if (!curriculum) notFound();

  const course = findCourse(curriculum, courseKey);
  if (!course) notFound();

  const hit = findSubtopic(course, subtopicKey);
  if (!hit) notFound();

  const hrefs = adminHrefs(slug);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Programs", href: "/admin/programs" },
          { label: curriculum.program.title, href: hrefs.program() },
          { label: course.title, href: hrefs.course(course.id) },
          {
            label: `Module ${hit.module.number}`,
            href: hrefs.module(course.id, hit.module.id),
          },
          { label: hit.subtopic.title },
        ]}
      />

      <PageHeading
        title={hit.subtopic.title}
        description={`${hit.topic.number}. ${hit.topic.title}`}
        action={
          <ButtonLink
            href={hrefs.editSubtopic(course.id, hit.subtopic.id)}
            variant="secondary"
          >
            <Pencil size={16} aria-hidden />
            Edit content
          </ButtonLink>
        }
      />

      <NodeActions
        node={{
          area: "admin",
          programSlug: slug,
          type: "subtopic",
          nodeKey: hit.subtopic.id,
          title: hit.subtopic.title,
        }}
        status={hit.subtopic.nodeStatus}
        role={actor.role}
        returnTo={hrefs.module(course.id, hit.module.id)}
      />

      <SubtopicDetail subtopic={hit.subtopic} />
    </div>
  );
}
