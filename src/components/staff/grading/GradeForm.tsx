"use client";

import { CheckCircle2, RotateCcw } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, TextInput, Textarea } from "@/components/ui/Field";
import {
  EMPTY_GRADE_STATE,
  EMPTY_RESUBMISSION_STATE,
  type GradeFormState,
  type ResubmissionFormState,
} from "@/lib/actions/curriculum-state";
import { markSubmission, requestResubmission } from "@/lib/actions/grading";
import type { GradingRow } from "@/lib/data/grading";

/**
 * The mark, the feedback and Save — and the teacher's other answer to a
 * hand-in, **Request resubmission**.
 *
 * One island per row rather than one form for the whole page, because a teacher
 * marks one hand-in at a time and a page-wide form would make Save mean "submit
 * everything I have typed", including the rows they were still thinking about.
 * The cost is a `useActionState` per row, which is a hook and a closure, not a
 * request.
 *
 * The inputs are seeded from the existing mark, so opening a marked hand-in
 * shows what was given rather than an empty box a teacher might take for "not
 * marked yet" and retype from scratch.
 *
 * Not rendered for a hand-in already sent back: there is nothing to mark until
 * the student hands in again, and the card says so instead.
 */
export function GradeForm({ row }: { row: GradingRow }) {
  const [state, action, pending] = useActionState<GradeFormState, FormData>(
    markSubmission,
    EMPTY_GRADE_STATE,
  );

  return (
    <div className="mt-4 border-t border-border pt-4">
      <form action={action} noValidate>
        <input type="hidden" name="submissionId" value={row.id} />

        {state.ok ? (
          <p className="mb-3 flex items-start gap-2 rounded-lg border border-success-500 bg-success-50 p-3 text-sm font-medium text-success-700">
            <CheckCircle2 size={16} aria-hidden className="mt-0.5 shrink-0" />
            Marked. The student can see this now.
          </p>
        ) : state.error ? (
          <p
            role="alert"
            className="mb-3 rounded-lg border border-danger-500 bg-danger-50 p-3 text-sm font-medium text-danger-700"
          >
            {state.error}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <Field
            id={`scored-${row.id}`}
            label={`Mark / ${row.maxMarks}`}
            error={state.errors.scored}
            required
          >
            <TextInput
              id={`scored-${row.id}`}
              name="scored"
              type="number"
              min={0}
              max={row.maxMarks}
              step="any"
              inputMode="decimal"
              // The mark already given, so a regrade edits rather than retypes.
              // `state.values` wins after a rejected save — losing what somebody
              // just typed because a *different* field was wrong is the thing
              // every form here avoids.
              defaultValue={state.values.scored || (row.scored ?? "")}
              hasError={Boolean(state.errors.scored)}
            />
          </Field>

          <Field
            id={`feedback-${row.id}`}
            label="Feedback"
            error={state.errors.feedback}
            required={false}
            hint="The student sees this next to their mark. Line breaks are kept."
          >
            <Textarea
              id={`feedback-${row.id}`}
              name="feedback"
              className="min-h-20"
              placeholder="What was good, and what to do differently next time."
              defaultValue={state.values.feedback || row.feedback}
              hasError={Boolean(state.errors.feedback)}
            />
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            {pending
              ? "Saving…"
              : row.status === "evaluated"
                ? "Update the mark"
                : "Save the mark"}
          </Button>

          {row.status === "evaluated" ? (
            <p className="text-2xs text-ink-500">
              Re-marking replaces the mark the student can already see.
            </p>
          ) : null}
        </div>
      </form>

      <RequestResubmission row={row} />
    </div>
  );
}

/**
 * Send the hand-in back for another go.
 *
 * Behind a button that opens the reason field, rather than a second always-open
 * form: it is the less common answer, and a reason box beside the feedback box
 * invites a teacher to type into the wrong one. The panel itself is the
 * confirmation — opening it and pressing a second, differently-worded button
 * is two deliberate steps.
 */
function RequestResubmission({ row }: { row: GradingRow }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<
    ResubmissionFormState,
    FormData
  >(requestResubmission, EMPTY_RESUBMISSION_STATE);

  const reasonId = `reason-${row.id}`;

  if (!open) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-dashed border-border pt-4">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setOpen(true)}
        >
          <RotateCcw size={14} aria-hidden />
          Request resubmission
        </Button>
        <p className="text-2xs text-ink-500">
          Lets the student hand in a new version. Nothing they submitted is
          deleted.
        </p>
      </div>
    );
  }

  return (
    <form
      action={action}
      noValidate
      className="mt-4 rounded-lg border border-warning-500 bg-warning-50 p-4"
    >
      <input type="hidden" name="submissionId" value={row.id} />

      <p className="flex items-center gap-2 text-sm font-bold text-ink-900">
        <RotateCcw size={16} aria-hidden className="text-warning-700" />
        Request a resubmission
      </p>
      <p className="mt-1 text-2xs text-ink-700">
        The student&apos;s submission unlocks so they can upload a revised
        version. This version stays in its history
        {row.status === "evaluated" && row.scored !== null
          ? `, together with its mark (${row.scored} / ${row.maxMarks}), which comes off the marksheet until the new version is marked`
          : ""}
        .
      </p>

      {state.error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-danger-500 bg-danger-50 p-3 text-sm font-medium text-danger-700"
        >
          {state.error}
        </p>
      ) : null}

      <div className="mt-3">
        <Field
          id={reasonId}
          label="What should they change?"
          error={state.errors.reason}
          required={false}
          hint="Shown prominently to the student. Optional, but a reason saves a round of questions."
        >
          <Textarea
            id={reasonId}
            name="reason"
            className="min-h-20 bg-surface"
            placeholder="Please revise Question 3 and explain your approach in more detail."
            defaultValue={state.values.reason}
            hasError={Boolean(state.errors.reason)}
          />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Sending…" : "Request resubmission"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
