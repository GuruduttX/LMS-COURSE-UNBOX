"use client";

/**
 * Who teaches anywhere on this program, and which cohorts each one takes.
 *
 * **A roll-up, not the place staffing is decided.** Teachers are assigned to a
 * batch (see components/staff/batches/BatchTeachers.tsx), because a program
 * runs several cohorts and one teacher rarely takes all of them. This screen is
 * where the shape of that is legible in one place: five teachers, nine
 * cohorts, who is on what.
 *
 * The one control it keeps is **Remove from program**, and it is here because
 * it is the only staffing change a batch panel cannot express: an assignment
 * that names no batches means every cohort, so there is no single batch to take
 * it off. Without this, a teacher assigned before batches existed — or from the
 * admin's person form — could never be removed at all. It is also the honest
 * way to say "they have left this program", which is otherwise one click per
 * cohort.
 *
 * A client island because the remove form needs its own pending and error
 * state; everything around it stays a server component.
 */
import { useActionState } from "react";
import Link from "next/link";
import { UserMinus, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useConfirmSubmit } from "@/components/ui/ConfirmDialog";
import {
  removeTeacherFromProgram,
  type TeacherAssignmentState,
} from "@/lib/actions/teacher-assignments";
import type { ProgramTeacher } from "@/lib/data/teacher-assignments";

const EMPTY: TeacherAssignmentState = { ok: false };

export function ProgramTeachers({
  programSlug,
  teachers,
  /** False on the teacher's own copy of the screen — see StaffProgram. */
  readOnly = false,
}: {
  programSlug: string;
  teachers: ProgramTeacher[];
  readOnly?: boolean;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-bold text-ink-900">Teachers</h2>
        <p className="mt-0.5 text-sm text-ink-600">
          Who teaches this program, and which batches they take. Every teacher
          here can author the whole program&rsquo;s content — the cohorts decide
          whose students they see.
          {readOnly ? null : (
            <>
              {" "}
              <Link
                href={`/manager/batches?program=${programSlug}`}
                className="font-semibold text-primary-600 underline-offset-2 hover:underline"
              >
                Staff a batch
              </Link>
              .
            </>
          )}
        </p>
      </div>

      {teachers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-muted px-6 py-8 text-center">
          <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-400">
            <UsersRound size={18} aria-hidden />
          </span>
          <p className="text-sm font-semibold text-ink-900">
            No teachers on this program
          </p>
          <p className="mt-1 text-sm text-ink-600">
            Nobody can author its content until one is assigned to a batch.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {teachers.map((teacher) => (
            <li
              key={teacher.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-ink-900">
                  {teacher.name}
                  {teacher.status === "suspended" ? (
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-600">
                      Suspended
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-sm text-ink-600">
                  {teacher.email}
                  {teacher.upcomingSessions > 0
                    ? ` · ${teacher.upcomingSessions} upcoming ${
                        teacher.upcomingSessions === 1 ? "session" : "sessions"
                      }`
                    : ""}
                </p>
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  {teacher.coversWholeProgram ? (
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-700">
                      Every batch
                    </span>
                  ) : (
                    teacher.batches.map((batch) => (
                      <span
                        key={batch}
                        className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700"
                      >
                        {batch}
                      </span>
                    ))
                  )}
                </p>
              </div>

              {readOnly ? null : (
                <RemoveButton programSlug={programSlug} teacher={teacher} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RemoveButton({
  programSlug,
  teacher,
}: {
  programSlug: string;
  teacher: ProgramTeacher;
}) {
  const [state, action, pending] = useActionState(
    removeTeacherFromProgram,
    EMPTY,
  );

  const cohorts = teacher.coversWholeProgram
    ? "every batch"
    : teacher.batches.length === 1
      ? teacher.batches[0]
      : `all ${teacher.batches.length} of their batches`;

  // Neutral tone: this is a reversible staffing change, not a destructive one.
  const { onSubmit, dialog } = useConfirmSubmit({
    title: `Remove ${teacher.name} from this program?`,
    message:
      teacher.upcomingSessions > 0
        ? `This takes them off ${cohorts}. They keep their ${teacher.upcomingSessions} upcoming ${
            teacher.upcomingSessions === 1 ? "session" : "sessions"
          } — reassign those separately if you need to.`
        : `This takes them off ${cohorts}, and they lose access to the program's content.`,
    confirmLabel: "Remove",
    tone: "neutral",
  });

  return (
    <form
      action={action}
      onSubmit={onSubmit}
      className="flex items-center gap-3"
    >
      {dialog}
      <input type="hidden" name="programSlug" value={programSlug} />
      <input type="hidden" name="teacherId" value={teacher.id} />

      {state.error ? (
        <span role="alert" className="text-sm text-red-600">
          {state.error}
        </span>
      ) : null}

      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        <UserMinus size={16} aria-hidden />
        {pending ? "Removing…" : "Remove from program"}
      </Button>
    </form>
  );
}
