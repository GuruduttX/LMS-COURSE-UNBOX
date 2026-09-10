import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeading } from "@/components/staff/StatTile";
import { Breadcrumb } from "@/components/staff/curriculum/Breadcrumb";
import { SubtopicDetail } from "@/components/staff/curriculum/SubtopicDetail";
import { NodeActions } from "@/components/staff/curriculum/NodeActions";
import { teacherHrefs } from "@/components/staff/curriculum/hrefs";
import { ButtonLink } from "@/components/ui/Button";
import { findSubtopic } from "@/lib/curriculum/find";
import { loadTeacherCourse } from "../../../../../load";

export const dynamic = "force-dynamic";

type Params =
  PageProps<"/teacher/programs/[program]/courses/[course]/subtopics/[subtopic]">;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { program, course, subtopic } = await params;
  const { course: view } = await loadTeacherCourse(program, course);
  return { title: findSubtopic(view, subtopic)?.subtopic.title ?? "Subtopic" };
}

export default async function TeacherSubtopicPage({ params }: Params) {
  const { program: slug, course: courseKey, subtopic: subtopicKey } = await params;
  const { curriculum, course, user } = await loadTeacherCourse(slug, courseKey);

  const hit = findSubtopic(course, subtopicKey);
  if (!hit) notFound();

  const hrefs = teacherHrefs(slug);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "My programs", href: "/teacher/programs" },
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
          area: "teacher",
          programSlug: slug,
          type: "subtopic",
          nodeKey: hit.subtopic.id,
          title: hit.subtopic.title,
        }}
        status={hit.subtopic.nodeStatus}
        role={user.role}
        returnTo={hrefs.module(course.id, hit.module.id)}
      />

      <SubtopicDetail subtopic={hit.subtopic} />
    </div>
  );
}
