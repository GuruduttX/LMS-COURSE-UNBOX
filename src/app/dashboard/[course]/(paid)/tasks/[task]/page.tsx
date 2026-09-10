import { CheckCircle2, ClipboardList, User } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { TaskSubmitForm } from "@/components/dashboard/tasks/TaskSubmitForm";
import { TaskStatusPill } from "@/components/tasks/TaskStatusPill";
import { TaskAttachments } from "@/components/tasks/TaskAttachments";
import { BackLink } from "@/components/ui/BackLink";
import { Container } from "@/components/ui/Container";
import { formatDate } from "@/lib/curriculum/format";
import { getStudent } from "@/lib/data/student";
import { getStudentTask } from "@/lib/data/tasks";

/**
 * One task, opened from the list — and the only place a student hands one in.
 *
 * The hand-in form lives here rather than on the card for the reason the staff
 * controls do: a list of eight tasks, each with an upload field and a note box,
 * is a page nobody can read, and the upload state of eight forms is eight
 * things to get wrong. Opening the task is the act that says "I am doing this
 * one".
 *
 * `getStudentTask` returns null for "no such task", "not on this program" and
 * "set for a different student" alike, and all three become the same 404 — a
 * task that is not theirs must be indistinguishable from one that is not there.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/dashboard/[course]/tasks/[task]">): Promise<Metadata> {
  const { course, task } = await params;
  const student = await getStudent();
  const found = await getStudentTask(course, student.id, task);

  return { title: found ? found.task.title : "Task not found" };
}

export default async function TaskPage({
  params,
}: PageProps<"/dashboard/[course]/tasks/[task]">) {
  const { course, task: taskId } = await params;
  const student = await getStudent();
  const found = await getStudentTask(course, student.id, taskId);

  if (!found) notFound();

  const { program, task } = found;
  const forMe = task.audience === "student";
  const asks = task.submission.kinds.length > 0;

  return (
    <>
      <DashboardHeader />

      <main id="main" className="flex-1 py-8 md:py-10">
        <Container size="wide">
          <BackLink href={`/dashboard/${program.slug}/tasks`}>
            All tasks
          </BackLink>

          <div className="mt-5 max-w-3xl space-y-6">
            <header>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={
                    forMe
                      ? "inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-2xs font-bold uppercase tracking-wide text-brand-700"
                      : "inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-2xs font-bold uppercase tracking-wide text-ink-700"
                  }
                >
                  {forMe ? (
                    <User size={12} aria-hidden />
                  ) : (
                    <ClipboardList size={12} aria-hidden />
                  )}
                  {forMe ? "For you" : "Everyone"}
                </span>

                {/* Done or pending, by the same rule and in the same shape as
                    the list and the overview — a status that changed wording
                    between screens would read as a different status. */}
                <TaskStatusPill task={task} />

                {/* Closed by staff, which is a different fact from whether this
                    student handed in — a cohort task can be closed with their
                    hand-in still missing. It stays on their screen either way:
                    a task nobody did should not quietly disappear. */}
                {task.completedAt && task.submission.kinds.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-2xs font-bold uppercase tracking-wide text-ink-600">
                    <CheckCircle2 size={12} aria-hidden />
                    Closed by your teacher
                  </span>
                ) : null}
              </div>

              <h1 className="mt-2 text-xl font-extrabold tracking-tight text-ink-900 md:text-2xl">
                {task.title}
              </h1>
              <p className="mt-1 text-sm text-ink-500">
                {task.createdByName} · {formatDate(task.createdAt)}
              </p>
            </header>

            <section className="rounded-xl border border-border bg-surface p-4 shadow-sm md:p-5">
              {task.description ? (
                <p className="whitespace-pre-line text-sm text-ink-700">
                  {task.description}
                </p>
              ) : (
                <p className="text-sm italic text-ink-500">
                  The attached document is the brief.
                </p>
              )}

              <TaskAttachments task={task} />
            </section>

            {asks ? (
              <TaskSubmitForm task={task} programSlug={program.slug} />
            ) : (
              <p className="rounded-xl border border-border bg-ink-50 p-4 text-sm text-ink-600">
                There is nothing to hand in for this one — just do it.
              </p>
            )}
          </div>
        </Container>
      </main>
    </>
  );
}
