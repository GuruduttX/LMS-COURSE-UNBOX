import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  CircleDot,
  FileText,
  Lock,
} from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/cn";
import { formatDuration, formatReadTime } from "@/lib/curriculum/format";
import { SUBTOPIC_KIND_ICON } from "@/lib/curriculum/kinds";
import {
  courseDetailsHref,
  learnHref,
  materialHref,
  moduleEntryHref,
} from "@/lib/curriculum/links";
import { modulePercent, topicStatus } from "@/lib/curriculum/status";
import type {
  LearnScreen,
  Status,
  SubtopicView,
  TopicView,
} from "@/lib/curriculum/types";

/**
 * The outline column: which module of the course you're in, that module's
 * topics, and each topic's subtopics.
 *
 * Both disclosures are native `<details>`, and the open one is decided on the
 * server from the URL. That keeps the whole column a server component — no
 * hydration cost on the page whose real work is the player — and it still opens
 * and closes without JavaScript.
 */
export function LearnSidebar({
  screen,
  isMaterialOpen = false,
}: {
  screen: LearnScreen;
  /** The study material has the pane, so the subtopic below it is not "here". */
  isMaterialOpen?: boolean;
}) {
  const { program, course, modules, module, topic, subtopic } = screen;

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <Link
        href={courseDetailsHref(program.slug, course.id)}
        className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
      >
        <BarChart3 size={16} aria-hidden />
        Course details
      </Link>

      <section>
        <h2 className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
          {course.number !== null ? `Course ${course.number}: ` : ""}
          {course.title}
        </h2>

        <p className="mt-3 text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
          Module
        </p>

        <details className="group mt-2 rounded-lg border border-border bg-surface">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-bold text-ink-900">
            <span>
              {module.number}. {module.title}
            </span>
            <ChevronDown
              size={16}
              aria-hidden
              className="shrink-0 text-brand-600 transition-transform duration-[120ms] group-open:rotate-180"
            />
          </summary>

          <ul className="border-t border-border p-1">
            {modules.map((item) => (
              <li key={item.id}>
                <Link
                  href={moduleEntryHref(program.slug, course.id, item)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm",
                    item.id === module.id
                      ? "bg-brand-50 font-semibold text-brand-700"
                      : "text-ink-700 hover:bg-ink-50",
                  )}
                >
                  <span className="min-w-0">
                    {item.number}. {item.title}
                  </span>
                  <span className="shrink-0 text-2xs font-bold tabular-nums text-ink-500">
                    {modulePercent(item.topics)}%
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>

        {/* Outside the disclosure on purpose: the handout is for the module you
            are in, and hiding it behind the module *switcher* would be the one
            place a student never thinks to look.

            A link into the pane, not out to the file: the document opens where
            the lessons open. The teacher's title, never the filename. */}
        {module.material ? (
          <div className="mt-3">
            <p className="mb-1.5 text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
              Study material
            </p>
            <Link
              href={materialHref(program.slug, course.id, module.id)}
              aria-current={isMaterialOpen ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors",
                isMaterialOpen
                  ? "border-brand-600 bg-brand-50 font-semibold text-brand-700"
                  : "border-border bg-surface text-ink-700 hover:bg-ink-50",
              )}
            >
              <FileText
                size={16}
                aria-hidden
                className="shrink-0 text-brand-600"
              />
              <span className="min-w-0 truncate">
                {module.materialTitle || "Study material"}
              </span>
            </Link>
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
          Topics
        </h2>

        <ol className="mt-2 space-y-2">
          {module.topics.map((item) => (
            <li key={item.id}>
              <TopicDisclosure
                programSlug={program.slug}
                courseId={course.id}
                moduleId={module.id}
                topic={item}
                isOpen={item.id === topic.id}
                // Nothing in the outline is current while the document has the
                // pane — two "you are here" marks would be one too many.
                activeSubtopicId={isMaterialOpen ? "" : subtopic.id}
              />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function TopicDisclosure({
  programSlug,
  courseId,
  moduleId,
  topic,
  isOpen,
  activeSubtopicId,
}: {
  programSlug: string;
  courseId: string;
  moduleId: string;
  topic: TopicView;
  isOpen: boolean;
  activeSubtopicId: string;
}) {
  const status = topicStatus(topic);

  return (
    <details
      open={isOpen}
      className="group overflow-hidden rounded-lg border border-border bg-surface"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3">
        <TopicMarker status={status} />
        <span
          className={cn(
            "min-w-0 flex-1 text-sm font-semibold",
            status === "locked" ? "text-ink-500" : "text-ink-900",
          )}
        >
          {topic.number}. {topic.title}
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          className="shrink-0 text-ink-400 transition-transform duration-[120ms] group-open:rotate-180"
        />
      </summary>

      <ol className="border-t border-border">
        {topic.subtopics.map((item) => (
          <li key={item.id}>
            <SubtopicRow
              programSlug={programSlug}
              courseId={courseId}
              moduleId={moduleId}
              subtopic={item}
              isActive={item.id === activeSubtopicId}
            />
          </li>
        ))}
      </ol>
    </details>
  );
}

function SubtopicRow({
  programSlug,
  courseId,
  moduleId,
  subtopic,
  isActive,
}: {
  programSlug: string;
  courseId: string;
  moduleId: string;
  subtopic: SubtopicView;
  isActive: boolean;
}) {
  const locked = subtopic.status === "locked";

  const body = (
    <>
      <span className="w-4 shrink-0">
        {subtopic.status === "completed" ? (
          <CheckCircle2 size={15} aria-hidden className="text-success-500" />
        ) : locked ? (
          <Lock size={14} aria-hidden className="text-ink-400" />
        ) : null}
      </span>

      <KindMarker kind={subtopic.kind} />

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm",
            locked
              ? "text-ink-400"
              : isActive
                ? "font-semibold text-brand-700"
                : "text-ink-800",
          )}
        >
          {subtopic.title}
        </span>
        <span className="mt-0.5 block text-2xs font-medium text-ink-500">
          {describe(subtopic)}
          {locked ? " · Finish the previous topic to unlock" : ""}
        </span>
      </span>
    </>
  );

  const className = cn(
    "flex min-h-14 w-full items-center gap-2 px-3 py-2 text-left",
    isActive && "border-l-[3px] border-brand-600 bg-brand-50 pl-[9px]",
    !isActive && !locked && "hover:bg-ink-50",
  );

  // A locked row is not a link: nothing to navigate to, so it must not look or
  // behave like something you can open.
  if (locked) {
    return (
      <div className={cn(className, "cursor-not-allowed")} aria-disabled="true">
        {body}
      </div>
    );
  }

  return (
    <Link
      href={learnHref(programSlug, courseId, moduleId, subtopic.id)}
      aria-current={isActive ? "true" : undefined}
      className={className}
    >
      {body}
    </Link>
  );
}

function TopicMarker({ status }: { status: Status }) {
  if (status === "completed")
    return <CheckCircle2 size={17} aria-hidden className="shrink-0 text-success-500" />;
  if (status === "locked")
    return <Lock size={15} aria-hidden className="shrink-0 text-ink-400" />;
  if (status === "in-progress")
    return <CircleDot size={17} aria-hidden className="shrink-0 text-brand-600" />;
  return <CircleDashed size={17} aria-hidden className="shrink-0 text-ink-400" />;
}

/** The icon for a kind, from the one map every screen reads. */
function KindMarker({ kind }: { kind: SubtopicView["kind"] }) {
  const Icon = SUBTOPIC_KIND_ICON[kind];
  return <Icon size={15} aria-hidden className="shrink-0 text-ink-500" />;
}

/** The quiet line under a subtopic: whatever that kind actually measures. */
function describe(subtopic: SubtopicView): string {
  if (subtopic.kind === "video") return formatDuration(subtopic.seconds);
  if (subtopic.kind === "text") return formatReadTime(subtopic.readMinutes);
  if (subtopic.kind === "pdf") return "PDF";
  const count = subtopic.questions.length;
  return `${count} ${count === 1 ? "question" : "questions"}`;
}
