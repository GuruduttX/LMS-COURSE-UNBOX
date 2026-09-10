import { ClipboardList, Link2, Paperclip, Upload, User } from "lucide-react";
import Link from "next/link";

import { TaskStatusPill } from "@/components/tasks/TaskStatusPill";
import { formatDate } from "@/lib/curriculum/format";
import type { StudentTaskView } from "@/lib/data/tasks";
import { describeSubmissionKinds } from "@/lib/tasks/submission-kinds";

/**
 * One task in the student's list — a card in a grid, not a full-width row.
 *
 * It used to render the whole task: the description in full, the document and
 * every resource link, each an anchor of its own. On a wide screen that made
 * one card a band of text a hundred characters across, which is past what
 * anyone reads comfortably, and four tasks became a page of scrolling. So this
 * is now a **summary that links to the task's own screen**, the same call the
 * overview card makes: status, title, who set it, and *whether* there are
 * attachments rather than the attachments themselves.
 *
 * Making it a summary also makes the whole card one link, which the previous
 * version could not be — an anchor cannot contain anchors, so the attachments
 * had to hang outside the clickable area and the card had two hit targets that
 * looked like one.
 *
 * Status comes first in the reading order (top-left on the row with the
 * audience chip) because "have I done this" is the question the list exists to
 * answer; `TaskStatusPill` decides what "done" means.
 */
export function StudentTaskCard({
  task,
  programSlug,
}: {
  task: StudentTaskView;
  programSlug: string;
}) {
  const forMe = task.audience === "student";
  const asks = task.submission.kinds.length > 0;
  const attachments =
    (task.document ? 1 : 0) + (task.links.length > 0 ? 1 : 0) > 0;

  return (
    <li className="h-full">
      <Link
        href={`/dashboard/${programSlug}/tasks/${task.id}`}
        className="flex h-full flex-col rounded-xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-brand-600/40 hover:bg-brand-50/20"
      >
        <div className="flex items-start justify-between gap-2">
          <span
            className={
              forMe
                ? "inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-2xs font-bold uppercase tracking-wide text-brand-700"
                : "inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-2xs font-bold uppercase tracking-wide text-ink-700"
            }
          >
            {forMe ? <User size={12} aria-hidden /> : <ClipboardList size={12} aria-hidden />}
            {forMe ? "For you" : "Everyone"}
          </span>

          <TaskStatusPill task={task} />
        </div>

        <h3 className="mt-2.5 text-sm font-bold text-ink-900">{task.title}</h3>

        {/* Two lines of the description as a taste of what it is. The rest is
            on the task's own screen, where the line length is readable. */}
        {task.description ? (
          <p className="mt-1.5 line-clamp-2 text-sm text-ink-600">
            {task.description}
          </p>
        ) : null}

        {asks ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-700">
            <Upload size={13} aria-hidden className="text-ink-400" />
            {task.mySubmission
              ? `Handed in ${formatDate(task.mySubmission.submittedAt)}`
              : `Hand in ${describeSubmissionKinds(task.submission.kinds)}`}
          </p>
        ) : null}

        {/* Pushed to the bottom, so cards in a row line their footers up
            however long the titles above them run. */}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-ink-500">
          <span className="truncate">
            {task.createdByName} · {formatDate(task.createdAt)}
          </span>

          {attachments ? (
            <span className="inline-flex items-center gap-2">
              {task.document ? (
                <span className="inline-flex items-center gap-1">
                  <Paperclip size={11} aria-hidden />
                  Document
                </span>
              ) : null}
              {task.links.length > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Link2 size={11} aria-hidden />
                  {task.links.length}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
