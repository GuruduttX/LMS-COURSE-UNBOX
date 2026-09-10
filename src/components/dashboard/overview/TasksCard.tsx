import { ClipboardCheck, ExternalLink, Paperclip, User } from "lucide-react";
import Link from "next/link";

import { TaskStatusPill } from "@/components/tasks/TaskStatusPill";
import { formatDate } from "@/lib/curriculum/format";
import type { StudentTaskView } from "@/lib/data/tasks";

/**
 * The newest few tasks, on the overview's main column.
 *
 * The way in: without it `/dashboard/[slug]/tasks` would be a screen nobody
 * could reach, which is the same as not having built it. It sits in the main
 * column rather than the right rail because a task is work — it belongs beside
 * "continue learning", not beside the schedule.
 *
 * Deliberately a **summary, not a list**: status, titles, who set them, and
 * whether something is attached. The description and the links live on the full
 * screen, where there is room to read them.
 *
 * Each row is a link to that task, so the card is a way *into* the three tasks
 * it names rather than only into the list — from the overview, "hand this one
 * in" should be one click, not two.
 */
export function TasksCard({
  slug,
  tasks,
}: {
  slug: string;
  tasks: StudentTaskView[];
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4">
        <h2 className="text-base font-bold text-ink-900">Tasks</h2>
        <Link
          href={`/dashboard/${slug}/tasks`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
        >
          View all
          <ExternalLink size={13} aria-hidden />
        </Link>
      </div>

      <div className="p-4">
        {tasks.length === 0 ? (
          <div className="rounded-lg bg-surface-muted px-4 py-8 text-center">
            <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-400">
              <ClipboardCheck size={18} aria-hidden />
            </span>
            <p className="text-sm text-ink-500">All Done keep Grinding.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {tasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/dashboard/${slug}/tasks/${task.id}`}
                  className="block rounded-lg border border-border p-3 transition-colors hover:border-brand-600/40 hover:bg-brand-50/20"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-ink-900">
                      {task.title}
                    </p>
                    <TaskStatusPill task={task} size="sm" />
                  </div>

                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                    {task.audience === "student" ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-brand-700">
                        <User size={11} aria-hidden />
                        For you
                      </span>
                    ) : null}
                    <span>
                      {task.createdByName} · {formatDate(task.createdAt)}
                    </span>
                    {task.document ? (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip size={11} aria-hidden />
                        Document
                      </span>
                    ) : null}
                    {task.links.length > 0 ? (
                      <span>
                        {task.links.length}{" "}
                        {task.links.length === 1 ? "link" : "links"}
                      </span>
                    ) : null}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
