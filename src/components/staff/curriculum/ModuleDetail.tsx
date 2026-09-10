/**
 * One module: its topics, the subtopics inside them, and the module test.
 *
 * A topic is a heading with its subtopics beneath rather than another level of
 * link, because a topic has no content of its own — clicking one would only
 * ever show the list already on screen. Its own controls (rename, move, delete)
 * therefore sit in the heading row, which is the only place they can go.
 */
import { FileCheck2, FolderTree, Pencil, Plus } from "lucide-react";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/Button";
import { formatDuration, formatReadTime } from "@/lib/curriculum/format";
import { SUBTOPIC_KIND_LABEL } from "@/lib/curriculum/kinds";
import type { ModuleView, SubtopicView } from "@/lib/curriculum/types";
import type { Role } from "@/lib/auth/roles";
import { EmptyState } from "@/components/ui/EmptyState";
import { EmptyTestBadge, KindIcon, NodeBadge } from "./NodeBadge";
import { ModuleMaterial } from "./ModuleMaterial";
import { DeleteNodeButton, MoveButtons } from "./NodeActions";
import { TreeList, TreeRow, TreeSection } from "./TreeRow";
import { areaFor, type CurriculumHrefs } from "./hrefs";

export function ModuleDetail({
  module: view,
  courseKey,
  hrefs,
  authoring,
}: {
  module: ModuleView;
  courseKey: string;
  hrefs: CurriculumHrefs;
  /** Omitted for a read-only viewer. */
  authoring?: { programSlug: string; role: Role };
}) {
  const area = areaFor(hrefs);

  return (
    <div className="space-y-8">
      {authoring ? (
        <div className="flex justify-end">
          <ButtonLink href={hrefs.newTopic(courseKey, view.id)} size="sm">
            <Plus size={16} aria-hidden />
            Add a topic
          </ButtonLink>
        </div>
      ) : null}

      <ModuleMaterial
        material={view.material}
        materialTitle={view.materialTitle}
        authoring={
          authoring
            ? {
                area,
                programSlug: authoring.programSlug,
                moduleKey: view.id,
              }
            : undefined
        }
      />

      {view.topics.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="No topics yet"
          description="A topic groups the subtopics — the videos, reading and quizzes a student works through."
          action={
            authoring ? (
              <ButtonLink href={hrefs.newTopic(courseKey, view.id)}>
                <Plus size={16} aria-hidden />
                Add the first topic
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        view.topics.map((topic, index) => (
          <TreeSection
            key={topic.id}
            title={`${topic.number}. ${topic.title}`}
            description={
              topic.nodeStatus !== "published"
                ? "This topic is not visible to students."
                : undefined
            }
            action={
              authoring ? (
                <div className="flex flex-wrap items-center gap-2">
                  <MoveButtons
                    node={{
                      area,
                      programSlug: authoring.programSlug,
                      type: "topic",
                      nodeKey: topic.id,
                      title: topic.title,
                    }}
                    first={index === 0}
                    last={index === view.topics.length - 1}
                  />
                  <Link
                    href={hrefs.editTopic(courseKey, view.id, topic.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink-700 hover:border-border-strong"
                  >
                    <Pencil size={14} aria-hidden />
                    Edit
                  </Link>
                  <DeleteNodeButton
                    node={{
                      area,
                      programSlug: authoring.programSlug,
                      type: "topic",
                      nodeKey: topic.id,
                      title: topic.title,
                    }}
                    role={authoring.role}
                    returnTo={hrefs.module(courseKey, view.id)}
                  />
                  <ButtonLink
                    href={hrefs.newSubtopic(courseKey, view.id, topic.id)}
                    size="sm"
                    variant="secondary"
                  >
                    <Plus size={16} aria-hidden />
                    Add a subtopic
                  </ButtonLink>
                </div>
              ) : undefined
            }
          >
            {topic.subtopics.length === 0 ? (
              <EmptyState
                icon={FolderTree}
                title="Nothing in this topic yet"
                description="Add a video, some reading, a PDF, or a quiz."
              />
            ) : (
              <TreeList>
                {topic.subtopics.map((subtopic, subtopicIndex) => (
                  <TreeRow
                    key={subtopic.id}
                    href={hrefs.subtopic(courseKey, subtopic.id)}
                    title={subtopic.title}
                    badges={<NodeBadge status={subtopic.nodeStatus} />}
                    meta={describe(subtopic)}
                    trailing={
                      <span className="flex items-center gap-1.5 text-ink-500">
                        <KindIcon kind={subtopic.kind} />
                        {SUBTOPIC_KIND_LABEL[subtopic.kind]}
                      </span>
                    }
                    aside={
                      authoring ? (
                        <MoveButtons
                          node={{
                            area,
                            programSlug: authoring.programSlug,
                            type: "subtopic",
                            nodeKey: subtopic.id,
                            title: subtopic.title,
                          }}
                          first={subtopicIndex === 0}
                          last={subtopicIndex === topic.subtopics.length - 1}
                        />
                      ) : undefined
                    }
                  />
                ))}
              </TreeList>
            )}
          </TreeSection>
        ))
      )}

      <TreeSection
        title="Module test"
        description="Assessment only — the mark appears on the marksheet but counts toward nothing."
      >
        {view.test ? (
          <TreeRow
            href={hrefs.moduleTest(courseKey, view.id)}
            icon={FileCheck2}
            title={view.test.title}
            badges={
              <>
                <NodeBadge status={view.test.nodeStatus} />
                {view.test.questionCount === 0 ? <EmptyTestBadge /> : null}
              </>
            }
            meta={`${view.test.questionCount} questions · ${view.test.durationMinutes} minutes`}
          />
        ) : (
          <EmptyState
            icon={FileCheck2}
            title="No module test"
            description="Optional. It tells a student how much of the module landed, without affecting their result."
            action={
              authoring ? (
                <ButtonLink href={hrefs.moduleTest(courseKey, view.id)}>
                  <Plus size={16} aria-hidden />
                  Write a module test
                </ButtonLink>
              ) : undefined
            }
          />
        )}
      </TreeSection>
    </div>
  );
}

/** The quiet line under a subtopic's title — whatever that kind actually has. */
function describe(subtopic: SubtopicView) {
  if (subtopic.kind === "video") {
    const duration = formatDuration(subtopic.seconds);

    if (subtopic.video) {
      return subtopic.video.status === "ready"
        ? `${duration} · video uploaded`
        : subtopic.video.status === "processing"
          ? `${duration} · video encoding`
          : `${duration} · encoding failed`;
    }

    return subtopic.videoUrl
      ? `${duration} · video linked`
      : `${duration} · no video yet`;
  }
  if (subtopic.kind === "text") {
    return subtopic.body
      ? formatReadTime(subtopic.readMinutes)
      : "No content written yet";
  }
  if (subtopic.kind === "pdf") {
    return subtopic.pdf ? subtopic.pdf.name : "No PDF uploaded yet";
  }
  return subtopic.questions.length > 0
    ? `${subtopic.questions.length} question${subtopic.questions.length === 1 ? "" : "s"}`
    : "No questions yet";
}
