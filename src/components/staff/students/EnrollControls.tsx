"use client";

import { UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { batchOptionLabel } from "@/components/staff/batches/BatchFill";
import { Button } from "@/components/ui/Button";
import { useConfirmSubmit } from "@/components/ui/ConfirmDialog";
import { Field, Select } from "@/components/ui/Field";
import type { BatchOption } from "@/lib/data/batches";
import { enrollStudent, withdrawStudent } from "@/lib/actions/enrollments";
import {
  EMPTY_ACTION_STATE,
  type ActionState,
} from "@/lib/actions/curriculum-state";

/**
 * Putting a student on a program, and taking them off.
 *
 * Two small islands on an otherwise server-rendered screen. Both post to
 * actions that re-check the role, the capability **and** the scope, so these
 * controls rendering is not what makes them work — a manager who forged the
 * form for someone else's program would still be refused.
 *
 * The picker lists only students not already on the program, which is why an
 * empty list reads as "everyone is already enrolled" rather than as a broken
 * dropdown; the copy says it that way round.
 *
 * **The batch is a choice, not a typed label.** It used to be free text, which
 * meant "Aug 2026 · Evening" and "Aug 2026 - evening" were two cohorts nobody
 * could tell apart, and there was nowhere to say a cohort was full. The options
 * carry their own occupancy, and a full one is disabled here *and* refused by
 * the action — the dropdown is the convenience, the action is the control.
 */
export function EnrollControls({
  programSlug,
  enrollable,
  batches,
  lockedBatch,
}: {
  programSlug: string;
  enrollable: { id: string; name: string; email: string }[];
  batches: BatchOption[];
  /**
   * The batch screen enrols into the cohort you are looking at, so the picker
   * collapses to a fixed value. Convenience only — the action re-reads the
   * batch's occupancy and refuses a closed or full one whatever is posted.
   */
  lockedBatch?: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    enrollStudent,
    EMPTY_ACTION_STATE,
  );
  const [studentId, setStudentId] = useState("");

  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h2 className="text-sm font-bold text-ink-900">Enrol a student</h2>

      {enrollable.length === 0 ? (
        <p className="mt-1 text-sm text-ink-600">
          Every active student account is already on this program. New accounts
          are created from the admin&apos;s people screen.
        </p>
      ) : (
        <form
          action={action}
          className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="programSlug" value={programSlug} />

          <div className="flex-1">
            <Field id="studentId" label="Student" required>
              <Select
                id="studentId"
                name="studentId"
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
              >
                <option value="">Pick a student</option>
                {enrollable.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} — {person.email}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {lockedBatch === undefined ? (
            <div className="flex-1">
              <Field
                id="batch"
                label="Batch"
                required={false}
                hint={
                  batches.length === 0
                    ? undefined
                    : "Which cohort they sit with. Full batches can't be picked."
                }
              >
                <Select id="batch" name="batch" defaultValue="">
                  <option value="">
                    {batches.length === 0 ? "No batches yet" : "No batch yet"}
                  </option>
                  {batches.map((batch) => (
                    <option
                      key={batch.id}
                      value={batch.name}
                      disabled={batch.isFull}
                    >
                      {batchOptionLabel(
                        batch.name,
                        batch.enrolled,
                        batch.capacity,
                      )}
                    </option>
                  ))}
                </Select>
              </Field>

              {batches.length === 0 ? (
                <p className="mt-1.5 text-xs text-ink-500">
                  This program has no open batches.{" "}
                  <Link
                    href="/manager/batches"
                    className="font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Create one
                  </Link>{" "}
                  to group students into cohorts.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex-1">
              <input type="hidden" name="batch" value={lockedBatch} />
              <p className="text-xs font-semibold text-ink-700">Batch</p>
              <p className="mt-1 text-sm text-ink-900">{lockedBatch}</p>
            </div>
          )}

          <Button type="submit" disabled={pending || !studentId}>
            <UserPlus size={16} aria-hidden />
            {pending ? "Enrolling…" : "Enrol"}
          </Button>
        </form>
      )}

      {state.error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-danger-700">
          {state.error}
        </p>
      ) : state.ok ? (
        <p className="mt-2 text-xs font-medium text-success-700">
          Enrolled. They can see the program straight away.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Withdraw.
 *
 * A confirm, because it changes what a student can see, and the copy says
 * **withdrawn rather than removed** — their work stays, they keep their place
 * in the record, and re-enrolling them later picks up exactly where they left
 * off. A word like "remove" would promise a deletion that does not happen.
 */
export function WithdrawButton({
  programSlug,
  studentId,
  name,
}: {
  programSlug: string;
  studentId: string;
  name: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    withdrawStudent,
    EMPTY_ACTION_STATE,
  );

  const { onSubmit, dialog } = useConfirmSubmit({
    title: `Withdraw ${name} from this program?`,
    message:
      "Their progress, marks and hand-ins are kept, and they can be enrolled again later.",
    confirmLabel: "Withdraw",
  });

  return (
    <form action={action} onSubmit={onSubmit}>
      {dialog}
      <input type="hidden" name="programSlug" value={programSlug} />
      <input type="hidden" name="studentId" value={studentId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded text-xs font-semibold text-ink-600 hover:text-danger-700 disabled:opacity-50"
      >
        <UserMinus size={14} aria-hidden />
        {pending ? "Withdrawing…" : "Withdraw"}
      </button>
      {state.error ? (
        <span
          role="alert"
          className="ml-2 text-2xs font-medium text-danger-700"
        >
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
