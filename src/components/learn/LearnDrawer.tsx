"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  FileText,
  Layers,
  Lock,
  Menu,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";

import { cn } from "@/lib/cn";
import { formatDuration, formatReadTime } from "@/lib/curriculum/format";
import { SUBTOPIC_KIND_ICON } from "@/lib/curriculum/kinds";
import { learnHref, materialHref, moduleEntryHref } from "@/lib/curriculum/links";
import { modulePercent } from "@/lib/curriculum/status";
import { DURATION, EASE_IN_SOFT, EASE_OUT_SOFT } from "@/lib/motion";
import type { LearnScreen, SubtopicView, TopicView } from "@/lib/curriculum/types";

/**
 * The mobile outline: a hamburger, and a drawer that slides in from the left.
 *
 * ## Why the outline stopped being a column on phones
 *
 * It used to stack *above* the lesson — so every visit to a video began by
 * scrolling past the whole contents list, and the pane the page exists for
 * started below the fold. On a phone the lesson should own the screen and the
 * outline should be one tap away. That is what this is.
 *
 * From `lg` nothing here renders: `LearnSidebar` is a proper column there, it
 * is a server component, and it costs no hydration on the page whose real work
 * is the player.
 *
 * ## Why this one is a client component when the sidebar is not
 *
 * The sidebar's disclosures are native `<details>`, which cannot animate their
 * height. A drawer that appears instantly and topics that snap open read as a
 * page redrawing rather than a panel opening, and the request was explicitly
 * for smooth transitions. So this half is `framer-motion`, using the shared
 * variants — and the cost is confined to the breakpoint that needs it.
 *
 * ## Closing
 *
 * The drawer closes when the route changes, which is what makes tapping a
 * subtopic feel like navigation instead of leaving a panel hanging over the
 * page it just loaded. Escape and the overlay close it too, and the body is
 * locked while it is open so the page behind does not scroll under a finger
 * meant for the drawer.
 */
export function LearnDrawer({
  screen,
  triggerClassName,
}: {
  screen: LearnScreen;
  /**
   * Overrides the trigger's colours only — never its size or its `lg:hidden`.
   *
   * The learn page's mobile bar is dark now (it butts up against the video and
   * reads as the player's own chrome), and an ink-coloured hamburger on it is
   * invisible. A prop rather than a second component, and colours rather than a
   * free-for-all, because a drawer whose trigger can be any size is a drawer
   * whose tap target can be made too small from the outside.
   */
  triggerClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();

  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Both segments matter: the module is in the path, the subtopic in `?s=`, so
  // watching only the pathname would leave the drawer open when a student picks
  // a different subtopic in the same module — the commonest tap in here.
  const route = `${pathname}?${searchParams}`;

  const close = useCallback(() => setIsOpen(false), []);

  /**
   * Close on navigation, derived during render rather than in an effect.
   *
   * A `useEffect` on `route` would close the drawer one paint *after* the new
   * lesson has painted behind it, which is the flicker this pattern avoids —
   * and it is the cascading-render shape the lint rule flags.
   */
  const [lastRoute, setLastRoute] = useState(route);
  if (route !== lastRoute) {
    setLastRoute(route);
    if (isOpen) setIsOpen(false);
  }

  // Escape, and the scroll lock. Genuinely external — a keydown listener and
  // document.body — which is what an effect is actually for.
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const { program, course, modules, module, topic, subtopic } = screen;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Open the lesson outline"
        aria-expanded={isOpen}
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors lg:hidden",
          triggerClassName ?? "text-ink-700 active:bg-ink-100",
        )}
      >
        <Menu size={22} aria-hidden />
      </button>

      <AnimatePresence>
        {isOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-night-900/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.base }}
              onClick={close}
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-surface shadow-xl"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{
                duration: DURATION.slow,
                ease: EASE_OUT_SOFT,
              }}
            >
              <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4">
                <div className="min-w-0">
                  <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
                    {course.number !== null ? `Course ${course.number}` : "Assessment"}
                  </p>
                  <h2
                    id={titleId}
                    className="mt-0.5 text-sm font-bold leading-snug text-ink-900"
                  >
                    {course.title}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={close}
                  aria-label="Close the outline"
                  className="-m-1 shrink-0 rounded-lg p-1 text-ink-500 transition-colors active:bg-ink-100"
                >
                  <X size={20} aria-hidden />
                </button>
              </header>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
                <ModuleSwitcher
                  programSlug={program.slug}
                  courseId={course.id}
                  modules={modules}
                  currentId={module.id}
                />

                {/* Outside the module switcher on purpose, for the reason the
                    sidebar gives: the handout belongs to the module you are in,
                    and hiding it behind the switcher is the one place nobody
                    thinks to look. */}
                {module.material ? (
                  <Link
                    href={materialHref(program.slug, course.id, module.id)}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface p-3 text-sm text-ink-700 transition-colors active:bg-ink-50"
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
                ) : null}

                <section>
                  <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
                    Topics
                  </h3>

                  <ol className="mt-2 space-y-2">
                    {module.topics.map((item) => (
                      <li key={item.id}>
                        <TopicAccordion
                          programSlug={program.slug}
                          courseId={course.id}
                          moduleId={module.id}
                          topic={item}
                          startOpen={item.id === topic.id}
                          activeSubtopicId={subtopic.id}
                        />
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/**
 * Which module of the course you are in, and a way to any other.
 *
 * Collapsed by default — the student is already in a module, and the list of
 * the other eleven is not what they opened the drawer for. The topics below are.
 */
function ModuleSwitcher({
  programSlug,
  courseId,
  modules,
  currentId,
}: {
  programSlug: string;
  courseId: string;
  modules: LearnScreen["modules"];
  currentId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const current = modules.find((item) => item.id === currentId);

  return (
    <section>
      <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
        Module
      </h3>

      <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          className="flex w-full items-center gap-2 p-3 text-left"
        >
          <Layers size={16} aria-hidden className="shrink-0 text-brand-600" />
          <span className="min-w-0 flex-1 text-sm font-bold text-ink-900">
            {current ? `${current.number}. ${current.title}` : "Modules"}
          </span>
          <ChevronDown
            size={16}
            aria-hidden
            className={cn(
              "shrink-0 text-ink-400 transition-transform duration-200",
              isOpen && "rotate-180",
            )}
          />
        </button>

        <Collapse isOpen={isOpen}>
          <ul className="border-t border-border p-1">
            {modules.map((item) => (
              <li key={item.id}>
                <Link
                  href={moduleEntryHref(programSlug, courseId, item)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md px-2 py-2.5 text-sm",
                    item.id === currentId
                      ? "bg-brand-50 font-semibold text-brand-700"
                      : "text-ink-700 active:bg-ink-50",
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
        </Collapse>
      </div>
    </section>
  );
}

/** One topic, and its subtopics behind an animated disclosure. */
function TopicAccordion({
  programSlug,
  courseId,
  moduleId,
  topic,
  startOpen,
  activeSubtopicId,
}: {
  programSlug: string;
  courseId: string;
  moduleId: string;
  topic: TopicView;
  startOpen: boolean;
  activeSubtopicId: string;
}) {
  // Open on the topic the student is in, and free to close after that. Seeding
  // from a prop rather than syncing to it: re-forcing it open on every render
  // would fight a student who deliberately collapsed it.
  const [isOpen, setIsOpen] = useState(startOpen);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-2 p-3 text-left"
      >
        <span className="min-w-0 flex-1 text-sm font-semibold text-ink-900">
          {topic.number}. {topic.title}
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          className={cn(
            "shrink-0 text-ink-400 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>

      <Collapse isOpen={isOpen}>
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
      </Collapse>
    </div>
  );
}

/**
 * Height animation, shared by both disclosures above.
 *
 * `height: auto` is not animatable in CSS, which is the whole reason these are
 * not native `<details>` like their desktop counterparts. Framer measures the
 * child and animates to the measured height, so a topic with three subtopics
 * and one with twelve both open at the same speed.
 */
function Collapse({
  isOpen,
  children,
}: {
  isOpen: boolean;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {isOpen ? (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{
            height: { duration: DURATION.base, ease: EASE_OUT_SOFT },
            opacity: { duration: DURATION.fast, ease: EASE_IN_SOFT },
          }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
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
  const KindIcon = SUBTOPIC_KIND_ICON[subtopic.kind];

  const body = (
    <>
      <span className="w-4 shrink-0">
        {subtopic.status === "completed" ? (
          <CheckCircle2 size={15} aria-hidden className="text-success-500" />
        ) : locked ? (
          <Lock size={14} aria-hidden className="text-ink-400" />
        ) : null}
      </span>

      <KindIcon
        size={14}
        aria-hidden
        className={cn("shrink-0", locked ? "text-ink-300" : "text-ink-400")}
      />

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
          {subtopic.kind === "video" && subtopic.seconds > 0
            ? formatDuration(subtopic.seconds)
            : subtopic.kind === "text" || subtopic.kind === "pdf"
              ? formatReadTime(Math.max(1, Math.round(subtopic.seconds / 60)))
              : null}
        </span>
      </span>
    </>
  );

  // A locked lesson is not a link. It renders the same way and does nothing,
  // rather than disappearing — a student should be able to see what is ahead.
  if (locked) {
    return (
      <div
        aria-disabled
        className="flex items-start gap-2 px-3 py-2.5 opacity-80"
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={learnHref(programSlug, courseId, moduleId, subtopic.id)}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-start gap-2 px-3 py-2.5 transition-colors active:bg-ink-50",
        isActive && "bg-brand-50",
      )}
    >
      {body}
    </Link>
  );
}
