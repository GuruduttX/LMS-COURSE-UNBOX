import { ExternalLink, Link2, Paperclip } from "lucide-react";

import type { TaskView } from "@/lib/data/tasks";
import { formatBytes } from "@/lib/uploads/kinds";

/**
 * The document and the links that came with a task, rendered the same way
 * everywhere — the staff list, both task detail screens and the student's card.
 *
 * Its own file rather than an export from `TasksScreen`, which is a client
 * island now: a server component importing this would otherwise have dragged
 * the whole composer, its filters and their state into the client bundle for
 * the sake of one list of links.
 *
 * Every link is `target="_blank"` with `rel="noopener noreferrer"`: the URLs are
 * typed by staff and point anywhere on the web, and a page that can reach back
 * into `window.opener` is the reason that `rel` exists. The scheme was already
 * restricted to http(s) at the write, so nothing here has to re-check it — but
 * this is the render that would have been the bug.
 */
export function TaskAttachments({
  task,
}: {
  task: Pick<TaskView, "document" | "links">;
}) {
  if (!task.document && task.links.length === 0) return null;

  return (
    <div className="mt-4 space-y-2 border-t border-border pt-3">
      {task.document ? (
        <a
          href={task.document.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-ink-800 transition-colors hover:border-border-strong hover:bg-ink-50"
        >
          <Paperclip size={14} aria-hidden className="shrink-0 text-ink-400" />
          <span className="truncate">{task.document.name}</span>
          <span className="shrink-0 text-xs font-normal text-ink-500">
            {formatBytes(task.document.bytes)}
          </span>
        </a>
      ) : null}

      {task.links.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {task.links.map((link) => (
            <li key={`${link.url}-${link.label}`}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
              >
                <Link2 size={14} aria-hidden />
                {link.label}
                <ExternalLink size={12} aria-hidden className="text-ink-400" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
