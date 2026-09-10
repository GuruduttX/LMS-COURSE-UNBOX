import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Paperclip,
  Upload,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeading } from "@/components/staff/StatTile";
import { AudienceChip } from "@/components/staff/tasks/TasksScreen";
import {
  CompleteTaskButton,
  DeleteTaskButton,
} from "@/components/staff/tasks/TaskComposer";
import { TaskAttachments } from "@/components/tasks/TaskAttachments";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireRole } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/curriculum/format";
import { getStaffTask, type TaskSubmissionView } from "@/lib/data/tasks";
import {
  TASK_SUBMISSION_LABEL,
  describeSubmissionKinds,
} from "@/lib/tasks/submission-kinds";
import { formatBytes } from "@/lib/uploads/kinds";

/**
 * One task in full: what was set, who owes it, and what has come back.
 *
 * A page rather than a dialog because it is a list of hand-ins that grows with
 * the cohort — design.md §5 keeps modals for confirms and short focused
 * content. It is also where the two controls that change a task live (complete
 * and delete), deliberately off the list card: a destructive button inside a
 * link is a misclick waiting to happen.
 *
 * **The guard is here, not in the two route files**, the same shape as
 * `StudentDetailScreen`: they are three lines apiece, and a check written twice
 * is a check that can be forgotten once. `getStaffTask` answers "no such task"
 * and "not your program" identically, and both become the same 404 — a task on
 * somebody else's program should be indistinguishable from one that is not
 * there.
 */
export async function TaskDetailScreen({
  taskId,
  area,
}: {
  taskId: string;
  area: "admin" | "teacher";
}) {
  const user = await requireRole(area === "admin" ? "admin" : "teacher");
  if (!can(user, "task.assign")) notFound();

  const task = await getStaffTask(user, taskId);
  if (!task) notFound();

  const asks = task.submission.kinds.length > 0;

  return (
    <div className="space-y-6">
      <Link
        href={`/${area}/tasks`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
      >
        <ArrowLeft size={16} aria-hidden />
        All tasks
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <AudienceChip task={task} />
            {task.completedAt ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-2xs font-bold uppercase tracking-wide text-success-700">
                <CheckCircle2 size={12} aria-hidden />
                Completed {formatDate(task.completedAt)}
              </span>
            ) : null}
          </div>

          <PageHeading
            title={task.title}
            description={`${task.programTitle} · set by ${task.createdByName} on ${formatDate(task.createdAt)}`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CompleteTaskButton
            id={task.id}
            completed={Boolean(task.completedAt)}
          />
          <DeleteTaskButton
            id={task.id}
            title={task.title}
            redirectTo={`/${area}/tasks`}
          />
        </div>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4 shadow-sm md:p-5">
        {task.description ? (
          <p className="whitespace-pre-line text-sm text-ink-700">
            {task.description}
          </p>
        ) : (
          <p className="text-sm italic text-ink-500">
            No description — the attached document is the brief.
          </p>
        )}

        <TaskAttachments task={task} />

        {asks ? (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-sm font-medium text-ink-800">
              Students hand in {describeSubmissionKinds(task.submission.kinds)}.
            </p>
            {task.submission.note ? (
              <p className="mt-1 whitespace-pre-line text-sm text-ink-600">
                Shown above their submission box: “{task.submission.note}”
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 border-t border-border pt-3 text-sm text-ink-500">
            Nothing to hand in — this task is an instruction only.
          </p>
        )}
      </section>

      {asks ? (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-ink-900">
              Handed in
              <span className="ml-2 font-medium text-ink-500 tabular-nums">
                {task.submitted} of {task.recipients}
              </span>
            </h2>

            {task.submissions.length === 0 ? (
              <EmptyState
                icon={Upload}
                title="Nothing handed in yet"
                description="Hand-ins appear here the moment a student submits."
              />
            ) : (
              <ul className="space-y-3">
                {task.submissions.map((submission) => (
                  <SubmissionRow key={submission.id} submission={submission} />
                ))}
              </ul>
            )}
          </section>

          {task.outstanding.length > 0 ? (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
                <Clock size={14} aria-hidden className="text-ink-400" />
                Still to hand in
                <span className="font-medium text-ink-500 tabular-nums">
                  {task.outstanding.length}
                </span>
              </h2>

              {/* Named, not counted: "four outstanding" is only actionable once
                  you know which four, and chasing them is the point. */}
              <ul className="flex flex-wrap gap-2">
                {task.outstanding.map((person) => (
                  <li
                    key={person.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-700"
                  >
                    <UserX size={12} aria-hidden className="text-ink-400" />
                    {person.name}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * One hand-in. The link opens in a new tab whichever way the work arrived —
 * uploaded to us or pasted by the student — and carries `rel="noopener
 * noreferrer"` for the pasted case, where the URL points anywhere on the web.
 * The scheme was restricted to http(s) at the write, so this render is not
 * where that is decided; it is where it would have been the bug.
 */
function SubmissionRow({ submission }: { submission: TaskSubmissionView }) {
  return (
    <li className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink-900">
            {submission.studentName}
          </p>
          {submission.studentEmail ? (
            <p className="text-xs text-ink-500">{submission.studentEmail}</p>
          ) : null}
        </div>
        <p className="text-xs text-ink-500">
          {TASK_SUBMISSION_LABEL[submission.kind]} ·{" "}
          {formatDate(submission.submittedAt)}
        </p>
      </div>

      <a
        href={submission.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex max-w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-brand-600 transition-colors hover:border-border-strong hover:bg-ink-50"
      >
        {submission.file ? (
          <>
            <Paperclip
              size={14}
              aria-hidden
              className="shrink-0 text-ink-400"
            />
            <span className="truncate">{submission.file.name}</span>
            <span className="shrink-0 text-xs font-normal text-ink-500">
              {formatBytes(submission.file.bytes)}
            </span>
          </>
        ) : (
          <>
            <ExternalLink
              size={14}
              aria-hidden
              className="shrink-0 text-ink-400"
            />
            <span className="truncate">{submission.url}</span>
          </>
        )}
      </a>

      {submission.note ? (
        <p className="mt-2 whitespace-pre-line text-sm text-ink-700">
          {submission.note}
        </p>
      ) : null}
    </li>
  );
}
