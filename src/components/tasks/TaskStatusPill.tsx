import { CheckCircle2, Timer } from "lucide-react";

import type { StudentTaskView } from "@/lib/data/tasks";

/**
 * Done, or pending — the one thing a student wants to know at a glance.
 *
 * Rendered identically on the overview card, the tasks list and the task's own
 * screen, so the answer never changes shape as they move between them.
 *
 * **What "done" means depends on the task**, and that is decided here rather
 * than at each call site:
 *
 * - A task that asks for a hand-in is done when **this student** has handed in.
 *   Deliberately not the task's `completedAt`, which is staff closing the task
 *   for everyone — telling a student who submitted nothing that they are
 *   finished is the one wrong answer this component could give.
 * - A task that asks for nothing has no hand-in to wait for, so staff closing
 *   it is the only completion it will ever have, and `completedAt` is the
 *   honest signal.
 */
export function TaskStatusPill({
  task,
  size = "md",
}: {
  task: Pick<StudentTaskView, "submission" | "mySubmission" | "completedAt">;
  /** `sm` for the overview card's tighter rows. */
  size?: "sm" | "md";
}) {
  const done = task.submission.kinds.length > 0
    ? Boolean(task.mySubmission)
    : Boolean(task.completedAt);

  const iconSize = size === "sm" ? 12 : 14;
  const padding = size === "sm" ? "px-2 py-0.5 text-2xs" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-bold uppercase tracking-wide ${padding} ${
        done
          ? "bg-success-50 text-success-700"
          : "bg-warning-50 text-warning-700"
      }`}
    >
      {done ? (
        <CheckCircle2 size={iconSize} aria-hidden />
      ) : (
        <Timer size={iconSize} aria-hidden />
      )}
      {done ? "Done" : "Pending"}
    </span>
  );
}
