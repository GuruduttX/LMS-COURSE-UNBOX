"use client";

/**
 * Who teaches this cohort — and adding or removing one.
 *
 * The panel that replaced staffing-by-program. A program runs several batches
 * and one teacher rarely takes all of them, so the decision is made here, where
 * the cohort is, rather than on the program screen where it read as "everyone
 * teaches everyone".
 *
 * A client island because two forms share one screen and each needs its own
 * pending and error state; everything around it stays a server component.
 *
 * Four deliberate details:
 *
 * - **Removing says what it costs.** A teacher with classes still to take shows
 *   that count next to the button, and the confirm names it. Taking someone off
 *   a cohort does not unbook their sessions, and finding that out afterwards is
 *   worse than being told first.
 * - **A suspended teacher stays listed.** Suspension is not removal, and hiding
 *   them here would make a cohort look understaffed when it isn't.
 * - **A whole-program teacher is listed without a Remove button.** They hold
 *   every batch, so there is nothing here to take away — the row says so and
 *   points at the program screen, rather than offering a button the action
 *   would refuse.
 * - **`readOnly` renders the list without the controls** rather than hiding the
 *   section, so a viewer who cannot staff a cohort can still see who is on it.
 */
import { useActionState } from "react";
import { UserMinus, UserPlus, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useConfirmSubmit } from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Field";
import {
  assignTeacherToBatch,
  removeTeacherFromBatch,
  type TeacherAssignmentState,
} from "@/lib/actions/teacher-assignments";
import type {
  AssignableTeacher,
  BatchTeacher,
} from "@/lib/data/teacher-assignments";

const EMPTY: TeacherAssignmentState = { ok: false };

export function BatchTeachers({
  programSlug,
  batchName,
  teachers,
  assignable,
  readOnly = false,
}: {
  programSlug: string;
  batchName: string;
  teachers: BatchTeacher[];
  assignable: AssignableTeacher[];
  readOnly?: boolean;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-bold text-ink-900">Teachers</h2>
        <p className="mt-0.5 text-sm text-ink-600">
          {readOnly
            ? "Who takes this batch."
            : "Who takes this batch. They see these students, mark their work and set their tasks — the program's content is shared with every other cohort."}
        </p>
      </div>

      {teachers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-muted px-6 py-8 text-center">
          <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-400">
            <UsersRound size={18} aria-hidden />
          </span>
          <p className="text-sm font-semibold text-ink-900">
            No teachers on this batch
          </p>
          <p className="mt-1 text-sm text-ink-600">
            Nobody is marking these students&rsquo; work until one is assigned.
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
                  {teacher.coversWholeProgram ? (
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-600">
                      Every batch
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
              </div>

              {readOnly ? null : teacher.coversWholeProgram ? (
                <p className="text-sm text-ink-500">
                  Assigned to the whole program
                </p>
              ) : (
                <RemoveButton
                  programSlug={programSlug}
                  batchName={batchName}
                  teacher={teacher}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {readOnly ? null : (
        <AddTeacher
          programSlug={programSlug}
          batchName={batchName}
          assignable={assignable}
        />
      )}
    </section>
  );
}

function AddTeacher({
  programSlug,
  batchName,
  assignable,
}: {
  programSlug: string;
  batchName: string;
  assignable: AssignableTeacher[];
}) {
  const [state, action, pending] = useActionState(assignTeacherToBatch, EMPTY);

  // "Nobody left to add" is not the same as "this batch is full" — a batch's
  // capacity counts students, and it holds as many teachers as you like. Saying
  // it the first way stops an empty picker from reading as a limit.
  if (assignable.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        Everyone with a teacher account already takes this batch. Add more from
        the People screen and they will appear here.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="programSlug" value={programSlug} />
      <input type="hidden" name="batchName" value={batchName} />

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1">
          <span className="mb-1 block text-sm font-medium text-ink-700">
            Add a teacher
          </span>
          <Select name="teacherId" defaultValue="" required>
            <option value="" disabled>
              Choose a teacher…
            </option>
            {assignable.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.name} — {teacher.email}
              </option>
            ))}
          </Select>
        </label>

        <Button type="submit" disabled={pending}>
          <UserPlus size={16} aria-hidden />
          {pending ? "Assigning…" : "Assign"}
        </Button>
      </div>

      <Feedback state={state} okMessage="Teacher assigned to this batch." />
    </form>
  );
}

function RemoveButton({
  programSlug,
  batchName,
  teacher,
}: {
  programSlug: string;
  batchName: string;
  teacher: BatchTeacher;
}) {
  const [state, action, pending] = useActionState(removeTeacherFromBatch, EMPTY);

  // Neutral tone: this is a reversible staffing change, not a destructive one.
  const { onSubmit, dialog } = useConfirmSubmit({
    title: `Remove ${teacher.name} from ${batchName}?`,
    message:
      teacher.upcomingSessions > 0
        ? `They keep their ${teacher.upcomingSessions} upcoming ${
            teacher.upcomingSessions === 1 ? "session" : "sessions"
          } — reassign those separately if you need to.`
        : "They will stop seeing these students. Any other batch of this program they take is unaffected.",
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
      <input type="hidden" name="batchName" value={batchName} />
      <input type="hidden" name="teacherId" value={teacher.id} />

      {state.error ? (
        <span role="alert" className="text-sm text-red-600">
          {state.error}
        </span>
      ) : null}

      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        <UserMinus size={16} aria-hidden />
        {pending ? "Removing…" : "Remove"}
      </Button>
    </form>
  );
}

function Feedback({
  state,
  okMessage,
}: {
  state: TeacherAssignmentState;
  okMessage: string;
}) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="text-sm text-emerald-700">
        {okMessage}
      </p>
    );
  }
  return null;
}
