import { ChevronRight, FileText, Lock, PencilLine } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/curriculum/format";
import { materialHref, moduleEntryHref } from "@/lib/curriculum/links";
import {
  itemStatus,
  moduleSeconds,
  moduleSubtopics,
  moduleTestLockReason,
} from "@/lib/curriculum/status";
import type { CourseItem } from "@/lib/curriculum/types";

import { AssignmentDialog } from "./AssignmentDialog";
import { StatusBadge, StatusIcon, TypeIcon, TYPE_LABEL } from "./status";

/**
 * One row of a course: a module, or an assignment.
 *
 * Module rows are links into the learning screen — the row *is* the way in, so
 * making the student find the "Go to course" button instead would be a step
 * they don't need. Assignment rows aren't links yet; that screen doesn't exist.
 *
 * Which is why an assignment row carries a **⋮ menu** (`AssignmentDialog`):
 * the brief, the brief document and the way to hand work in all live behind it.
 * The screen that would otherwise carry them does not exist, and an assignment
 * a student can see but not open or answer is not much of an assignment. The
 * menu is hidden while the course is locked, like everything else inside it.
 *
 * Tests no longer appear here. A module test belongs to its module and a final
 * test to the course, so each has its own place rather than a row in a list
 * whose other entries are the work you do to earn it.
 */
export function ItemRow({
  programSlug,
  courseId,
  item,
}: {
  programSlug: string;
  courseId: string;
  item: CourseItem;
}) {
  const status = itemStatus(item);
  const locked = status === "locked";
  const courseModule = item.module;

  const body = (
    <>
      <span className="mt-0.5 shrink-0 sm:mt-0">
        <StatusIcon status={status} />
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium",
            locked
              ? "text-ink-500"
              : status === "in-progress"
                ? "text-brand-700"
                : "text-ink-900",
          )}
        >
          {item.title}
        </p>

        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs font-medium text-ink-500">
          <span className="inline-flex items-center gap-1">
            <TypeIcon type={item.type} />
            {TYPE_LABEL[item.type]}
          </span>

          {courseModule ? (
            <>
              <Meta>
                {courseModule.topics.length}{" "}
                {courseModule.topics.length === 1 ? "topic" : "topics"}
              </Meta>
              <Meta>{moduleSubtopics(courseModule.topics).length} lessons</Meta>
              <Meta>{Math.round(moduleSeconds(courseModule.topics) / 60)} min</Meta>
            </>
          ) : null}

          {item.assignment ? (
            <Meta>
              Out of {item.assignment.maxMarks}
            </Meta>
          ) : null}

          {item.dueDate && !locked ? <Meta>Due {formatDate(item.dueDate)}</Meta> : null}
          {locked && item.lockedReason ? <Meta>{item.lockedReason}</Meta> : null}
        </p>

      </div>

      <div className="flex shrink-0 items-center gap-3">
        {/* A mark, not a percentage: an assignment is marked out of whatever
            the teacher set it out of, and printing "80%" for 80/100 would be a
            coincidence that stops being true the moment they set it out of 50. */}
        {typeof item.score === "number" && item.assignment ? (
          <span className="text-sm font-extrabold tabular-nums text-brand-600">
            {item.score}
            <span className="font-semibold text-ink-500">
              /{item.assignment.maxMarks}
            </span>
          </span>
        ) : null}
        {/* The breakpoint rides a wrapper, not the badge: `cn` does not resolve
            Tailwind conflicts, so a `hidden` handed to StatusBadge would sit
            alongside the `inline-flex` it sets on itself and lose the cascade —
            leaving the badge visible on exactly the widths it was meant to skip. */}
        <span className="hidden sm:block">
          <StatusBadge status={status} />
        </span>

        {item.assignment && !locked ? (
          <AssignmentDialog
            programSlug={programSlug}
            courseId={courseId}
            assignment={item.assignment}
          />
        ) : null}

        {courseModule && !locked ? (
          <ChevronRight size={16} aria-hidden className="text-ink-400" />
        ) : null}
      </div>
    </>
  );

  const className = cn(
    "flex min-h-14 items-start gap-3 px-4 py-3 sm:min-h-12 sm:items-center",
    status === "in-progress" && "border-l-[3px] border-brand-600 bg-brand-50 pl-[13px]",
  );

  if (!courseModule || locked) {
    return <li className={className}>{body}</li>;
  }

  return (
    <li>
      <Link
        href={moduleEntryHref(programSlug, courseId, courseModule)}
        className={cn(className, "hover:bg-ink-50")}
      >
        {body}
      </Link>

      {/* A sibling of the row, never inside it: the row is already a link, and
          an anchor inside an anchor is invalid and unclickable.

          It goes to the *same* screen the outline's link goes to, rather than
          to the file — the document is read in the pane either way, so which
          door a student came through makes no difference to where they end up.
          The teacher's title, never the filename. */}
      {courseModule.material ? (
        <Link
          href={materialHref(programSlug, courseId, courseModule.id)}
          className="flex items-center gap-2 border-t border-border px-4 py-2 text-2xs font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
        >
          <FileText size={14} aria-hidden className="shrink-0 text-brand-600" />
          <span className="min-w-0 truncate">
            Study material: {courseModule.materialTitle || "Open"}
          </span>
        </Link>
      ) : null}

      {/* The module's test, if it has one — a sibling of the row for the same
          reason the material is, and immediately under the module it examines.
          `ItemRow`'s header says a module test belongs to its module; this is
          where that stopped being only a comment. Before it existed a teacher
          could author a test nobody could sit, while the final test's gate went
          on refusing to open until they had. */}
      {courseModule.test ? (
        <ModuleTestRow
          programSlug={programSlug}
          courseId={courseId}
          module={courseModule}
        />
      ) : null}
    </li>
  );
}

/**
 * The link into a module's test, or the reason it is not open yet.
 *
 * Never a link that fails: a locked test renders as text, the same rule the
 * course cards follow. Unlimited attempts, so once it has been sat this offers
 * a retake rather than going quiet — the best score is what the marksheet
 * reads, and the final's gate only asks that it has been sat at all.
 */
function ModuleTestRow({
  programSlug,
  courseId,
  module: courseModule,
}: {
  programSlug: string;
  courseId: string;
  module: NonNullable<CourseItem["module"]>;
}) {
  const test = courseModule.test;
  if (!test) return null;

  const reason = moduleTestLockReason(courseModule);
  const best = test.best;

  const line = (
    <>
      <span className="min-w-0 truncate">
        Module test: {test.title}
        <span className="text-ink-500">
          {" · "}
          {test.questionCount}{" "}
          {test.questionCount === 1 ? "question" : "questions"}
        </span>
      </span>

      {best ? (
        <span className="ml-auto shrink-0 font-semibold tabular-nums text-brand-600">
          {best.scored}/{best.maxScore}
        </span>
      ) : null}
    </>
  );

  if (reason) {
    return (
      <p className="flex items-center gap-2 border-t border-border px-4 py-2 text-2xs font-medium text-ink-500">
        <Lock size={14} aria-hidden className="shrink-0 text-ink-400" />
        {line}
        <span className="ml-auto shrink-0 text-ink-400">{reason}</span>
      </p>
    );
  }

  return (
    <Link
      href={`/dashboard/${programSlug}/tests/${courseId}?m=${encodeURIComponent(courseModule.id)}`}
      className="flex items-center gap-2 border-t border-border px-4 py-2 text-2xs font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
    >
      <PencilLine size={14} aria-hidden className="shrink-0 text-brand-600" />
      {line}
    </Link>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span aria-hidden className="text-ink-300">
        ·
      </span>
      <span>{children}</span>
    </>
  );
}
