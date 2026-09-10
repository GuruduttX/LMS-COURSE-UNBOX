"use client";

import {
  CheckCircle2,
  ClipboardList,
  Filter,
  Plus,
  Search,
  Upload,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { PageHeading } from "@/components/staff/StatTile";
import { TaskComposer } from "@/components/staff/tasks/TaskComposer";
import { TaskAttachments } from "@/components/tasks/TaskAttachments";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Field";
import { formatDate } from "@/lib/curriculum/format";
import type {
  StaffTaskView,
  TaskAudienceOptions,
  TaskProgramGroup,
} from "@/lib/data/tasks";
import { describeSubmissionKinds } from "@/lib/tasks/submission-kinds";

/**
 * The tasks screen, written once and rendered by both the admin and the
 * teacher areas — the same way the students screens are shared. The two route
 * files are a guard plus this component; they differ in nothing but `area`,
 * which decides where a card links, so there is no second copy for a behaviour
 * to drift into.
 *
 * A program manager never reaches it: they hold no `task.assign`, so the nav
 * item is absent, the page's own capability check refuses them, and the actions
 * refuse them again. Three independent gates, none load-bearing on its own.
 *
 * ## Why this is a client island now
 *
 * The filters. They are the reason someone opens this screen with forty tasks
 * on it — "what did I set this student", "what is still open" — and answering
 * either through the URL would mean a server round trip per keystroke of a
 * dropdown. The data is already loaded and small; filtering it in the browser
 * is instant and the list stays in one place.
 *
 * The composer is **closed by default**. A form that fills the top of the
 * screen makes the list — the thing you came to read — start below the fold,
 * and most visits here are to look at what has been set rather than to set
 * something. Opening it is one button.
 */
export function TasksScreen({
  groups,
  audiences,
  area,
}: {
  groups: TaskProgramGroup[];
  audiences: TaskAudienceOptions;
  /** Which staff area this is rendered in — decides where a task card links. */
  area: "admin" | "teacher";
}) {
  const [composing, setComposing] = useState(false);
  const [programSlug, setProgramSlug] = useState("");
  const [studentId, setStudentId] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  const total = groups.reduce((sum, group) => sum + group.tasks.length, 0);

  /**
   * The roster the student filter offers: one program's, or everybody's with
   * duplicates collapsed — the same person can be enrolled on two programs, and
   * a picker listing them twice looks broken.
   */
  const roster = useMemo(() => {
    const source = programSlug
      ? audiences.filter((program) => program.slug === programSlug)
      : audiences;

    const byId = new Map<string, { id: string; name: string; email: string }>();
    for (const program of source) {
      for (const student of program.students) byId.set(student.id, student);
    }

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [audiences, programSlug]);

  const visible = useMemo(
    () =>
      groups
        .filter((group) => !programSlug || group.slug === programSlug)
        .map((group) => ({
          ...group,
          tasks: group.tasks.filter((task) => {
            if (!showCompleted && task.completedAt) return false;

            /**
             * A cohort task counts as one of this student's, because it is: it
             * is on their screen and they owe the hand-in. Narrowing to tasks
             * addressed to them by name would answer a different question —
             * "what have I singled them out for" — and hide the eight things
             * their program was set.
             */
            if (studentId) {
              const reaches =
                task.audience === "program" || task.studentId === studentId;
              if (!reaches) return false;
            }

            return true;
          }),
        }))
        .filter((group) => group.tasks.length > 0),
    [groups, programSlug, studentId, showCompleted],
  );

  const shown = visible.reduce((sum, group) => sum + group.tasks.length, 0);
  const filtered = Boolean(programSlug || studentId || !showCompleted);

  if (audiences.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeading
          title="Tasks"
          description="Work you've set students outside the graded curriculum."
        />
        <EmptyState
          icon={ClipboardList}
          title="No programs assigned to you"
          description="A task belongs to a program, and you aren't on one yet. An admin assigns programs from the people screen."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeading
          title="Tasks"
          description="Work you've set students outside the graded curriculum — a brief to read, an account to set up, something to fix before the next session."
        />

        <Button
          type="button"
          onClick={() => setComposing((open) => !open)}
          aria-expanded={composing}
          aria-controls="task-composer"
        >
          {composing ? (
            <X size={16} aria-hidden />
          ) : (
            <Plus size={16} aria-hidden />
          )}
          {composing ? "Close" : "Create a task"}
        </Button>
      </div>

      {/* Kept mounted while open only — a half-filled form is not worth
          preserving across a close, and unmounting is what clears it. */}
      {composing ? (
        <div id="task-composer">
          <TaskComposer
            programs={audiences}
            onCreated={() => setComposing(false)}
          />
        </div>
      ) : null}

      {total === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No tasks set yet"
          description="Create one and it appears on the student's program dashboard straight away."
        />
      ) : (
        <>
          <Filters
            audiences={audiences}
            roster={roster}
            programSlug={programSlug}
            studentId={studentId}
            showCompleted={showCompleted}
            onProgram={(slug) => {
              setProgramSlug(slug);
              // The chosen student may not be on the new program, and a filter
              // silently matching nothing is worse than one that resets.
              setStudentId("");
            }}
            onStudent={setStudentId}
            onShowCompleted={setShowCompleted}
            shown={shown}
            total={total}
          />

          {shown === 0 ? (
            <EmptyState
              icon={Search}
              title="Nothing matches"
              description={
                filtered
                  ? "No task fits these filters. Widen them, or switch completed tasks back on."
                  : "There is nothing to show."
              }
            />
          ) : (
            <div className="space-y-8">
              {visible.map((group) => (
                <section key={group.slug} className="space-y-3">
                  <h2 className="text-sm font-bold text-ink-900">
                    {group.title}
                    <span className="ml-2 font-medium text-ink-500">
                      {group.tasks.length}{" "}
                      {group.tasks.length === 1 ? "task" : "tasks"}
                    </span>
                  </h2>

                  <ul className="space-y-3">
                    {group.tasks.map((task) => (
                      <StaffTaskCard key={task.id} task={task} area={area} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Three filters, and the third is a toggle rather than a third dropdown:
 * "completed" is not a value you pick among others, it is a body of finished
 * work you either want in the list or do not. Hidden by default, because the
 * open tasks are the ones with something still to do about them.
 */
function Filters({
  audiences,
  roster,
  programSlug,
  studentId,
  showCompleted,
  onProgram,
  onStudent,
  onShowCompleted,
  shown,
  total,
}: {
  audiences: TaskAudienceOptions;
  roster: { id: string; name: string; email: string }[];
  programSlug: string;
  studentId: string;
  showCompleted: boolean;
  onProgram: (slug: string) => void;
  onStudent: (id: string) => void;
  onShowCompleted: (show: boolean) => void;
  shown: number;
  total: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-sm md:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-500">
          <Filter size={13} aria-hidden />
          Filter
        </span>

        <label className="sr-only" htmlFor="task-filter-program">
          Program
        </label>
        <Select
          id="task-filter-program"
          value={programSlug}
          onChange={(event) => onProgram(event.target.value)}
          className="w-auto min-w-44"
        >
          <option value="">All programs</option>
          {audiences.map((program) => (
            <option key={program.slug} value={program.slug}>
              {program.title}
            </option>
          ))}
        </Select>

        <label className="sr-only" htmlFor="task-filter-student">
          Student
        </label>
        <Select
          id="task-filter-student"
          value={studentId}
          onChange={(event) => onStudent(event.target.value)}
          disabled={roster.length === 0}
          className="w-auto min-w-44"
        >
          <option value="">All students</option>
          {roster.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name}
            </option>
          ))}
        </Select>

        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-700">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(event) => onShowCompleted(event.target.checked)}
            className="h-4 w-4 rounded border-border-strong text-brand-600 focus:ring-brand-600"
          />
          Show completed
        </label>

        <span className="ml-auto text-xs text-ink-500">
          {shown === total ? `${total} tasks` : `${shown} of ${total}`}
        </span>
      </div>
    </div>
  );
}

/**
 * One task as staff see it, and the whole card is a link to its own screen —
 * where the hand-ins are, and where it is completed or deleted. Those controls
 * are deliberately *not* on the card: a delete button inside a link is a
 * misclick waiting to happen, and the list reads as a list rather than as forty
 * small forms.
 *
 * The audience chip is the first thing on the row because it is the thing that
 * most changes what the row means — "everyone" and "one student" are different
 * acts, and a list where they look alike is one where a task meant for one
 * person reads as a cohort-wide announcement.
 */
function StaffTaskCard({
  task,
  area,
}: {
  task: StaffTaskView;
  area: "admin" | "teacher";
}) {
  const asks = task.submission.kinds.length > 0;

  return (
    <li>
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong">
        {/* The attachments hang *below* the link, not inside it: an anchor
            nested in an anchor is invalid HTML, and the browser resolves it by
            dropping one of the two. No focus styles of its own either —
            globals.css carries one `:focus-visible` ring for the whole app. */}
        <Link href={`/${area}/tasks/${task.id}`} className="block">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <AudienceChip task={task} />
                {task.completedAt ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-2xs font-bold uppercase tracking-wide text-success-700">
                    <CheckCircle2 size={12} aria-hidden />
                    Completed
                  </span>
                ) : null}
              </div>

              <h3 className="mt-2 text-sm font-bold text-ink-900">
                {task.title}
              </h3>
              <p className="mt-1 text-xs text-ink-500">
                Set by {task.createdByName} · {formatDate(task.createdAt)}
              </p>
            </div>

            {asks ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink-50 px-2.5 py-1.5 text-xs font-semibold text-ink-700">
                <Upload size={13} aria-hidden className="text-ink-400" />
                <span className="tabular-nums">
                  {task.submitted} of {task.recipients}
                </span>
                handed in
              </span>
            ) : null}
          </div>

          {task.description ? (
            <p className="mt-3 line-clamp-2 whitespace-pre-line text-sm text-ink-700">
              {task.description}
            </p>
          ) : null}

          {asks ? (
            <p className="mt-2 text-xs text-ink-500">
              Asks for {describeSubmissionKinds(task.submission.kinds)}.
            </p>
          ) : null}
        </Link>

        <TaskAttachments task={task} />
      </div>
    </li>
  );
}

export function AudienceChip({
  task,
}: {
  task: Pick<StaffTaskView, "audience" | "audienceLabel">;
}) {
  return task.audience === "program" ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-2xs font-bold uppercase tracking-wide text-brand-700">
      <ClipboardList size={12} aria-hidden />
      Everyone
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-2xs font-bold uppercase tracking-wide text-ink-700">
      <User size={12} aria-hidden />
      {task.audienceLabel}
    </span>
  );
}
