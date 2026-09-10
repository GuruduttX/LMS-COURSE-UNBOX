"use client";

import { AlertCircle, Check, Lock, Pencil, X } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { useConfirmSubmit } from "@/components/ui/ConfirmDialog";
import { Field, TextInput } from "@/components/ui/Field";
import { setProgramFee, type ProgramFeeFormState } from "@/lib/actions/fee-plans";
import { formatPaise, toRupeeInput } from "@/lib/payments/money";
import { EMPTY_PROGRAM_FEE } from "@/lib/validation/fee-plan";

/**
 * What the program costs, and what it is discounted from.
 *
 * **Read-only until you ask.** The price used to sit in a live input, one
 * stray keystroke from being changed — on a screen an admin opens to look at a
 * roster, not to reprice a program. Now it renders as text with a Change
 * button, and saving is confirmed. Two deliberate speed bumps in front of a
 * field that decides what several hundred people are charged.
 *
 * The confirmation is not a formality: repricing moves the balance of everyone
 * still paying, because the ledger records amounts rather than percentages. The
 * dialog says how many that is, using a count the server worked out.
 *
 * `feeAmount` is what gets charged. `listAmount` is display only — struck
 * through on the student's page — and must be higher, or there is no discount
 * to advertise. Unlike an instalment plan this **can** be edited: it mirrors
 * nothing on Razorpay's side, so there is no immutable object to drift from.
 *
 * Rupees in, paise stored.
 */
export function ProgramFeeForm({
  programSlug,
  feeAmount,
  listAmount,
  midPaymentCount,
}: {
  programSlug: string;
  /** Current fee in paise, or null when the program is free. */
  feeAmount: number | null;
  /** Struck-through price in paise, or null. */
  listAmount: number | null;
  /** Students who have paid something but aren't settled — the ones a change moves. */
  midPaymentCount: number;
}) {
  const [editing, setEditing] = useState(false);

  const [state, formAction, isPending] = useActionState<
    ProgramFeeFormState,
    FormData
  >(setProgramFee, {
    ok: false,
    errors: {},
    values: feeAmount
      ? {
          feeAmount: toRupeeInput(feeAmount),
          listAmount: listAmount ? toRupeeInput(listAmount) : "",
        }
      : EMPTY_PROGRAM_FEE,
  });

  /**
   * Close the form when a save succeeds — derived during render rather than in
   * an effect.
   *
   * `useEffect` + `setEditing` here is the cascading-render antipattern the
   * lint rule flags, and it would also close the form for one paint before
   * reopening it. This is React's documented "adjust state when a prop
   * changes" shape: compare against the previous value, and only act on the
   * transition. Closing on `state.ok` alone would jam the form shut, because
   * `ok` stays true until the next submit.
   */
  const [wasOk, setWasOk] = useState(state.ok);
  if (state.ok !== wasOk) {
    setWasOk(state.ok);
    if (state.ok) setEditing(false);
  }

  const { onSubmit, dialog } = useConfirmSubmit({
    // Nobody mid-payment, nothing to warn about — the save goes straight
    // through. A dialog on every edit is a dialog nobody reads.
    when: midPaymentCount > 0,
    title: "Change the fee?",
    message: `${midPaymentCount} ${midPaymentCount === 1 ? "student has" : "students have"} paid part of this fee. Changing it changes what they still owe — it does not refund or re-charge anything already settled.`,
    confirmLabel: "Change the fee",
    tone: "neutral",
  });

  if (!editing) {
    return (
      <div>
        {feeAmount ? (
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-2xl font-bold text-ink-900">
              {formatPaise(feeAmount)}
            </p>
            {listAmount ? (
              <>
                <p className="text-sm text-ink-500 line-through">
                  {formatPaise(listAmount)}
                </p>
                <span className="rounded-full bg-success-50 px-2 py-0.5 text-2xs font-semibold text-success-700">
                  {Math.round(((listAmount - feeAmount) / listAmount) * 100)}%
                  off
                </span>
              </>
            ) : null}
          </div>
        ) : (
          <p className="text-sm font-medium text-ink-600">
            No fee — this program opens without payment.
          </p>
        )}

        {state.ok ? (
          <p className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-success-700">
            <Check size={15} aria-hidden />
            Saved
          </p>
        ) : null}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => setEditing(true)}
        >
          <Pencil size={14} aria-hidden />
          {feeAmount ? "Change pricing" : "Set a fee"}
        </Button>

        {midPaymentCount > 0 ? (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-500">
            <Lock size={12} className="mt-0.5 shrink-0" aria-hidden />
            {midPaymentCount}{" "}
            {midPaymentCount === 1 ? "student is" : "students are"} part-way
            through paying this.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-4">
      {dialog}
      <input type="hidden" name="programSlug" value={programSlug} />

      {state.error ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-md bg-danger-50 p-3 text-sm font-medium text-danger-700"
        >
          <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <Field
        id="program-fee"
        label="Fee charged (₹)"
        error={state.errors.feeAmount}
        hint="What the student actually pays. Blank means no fee at all."
      >
        <TextInput
          id="program-fee"
          name="feeAmount"
          inputMode="decimal"
          defaultValue={state.values.feeAmount}
          hasError={!!state.errors.feeAmount}
          placeholder="24999"
          autoFocus
        />
      </Field>

      <Field
        id="program-list"
        label="Original price (₹)"
        error={state.errors.listAmount}
        hint="Shown struck through beside the fee. Must be higher. Leave blank for no discount."
      >
        <TextInput
          id="program-list"
          name="listAmount"
          inputMode="decimal"
          defaultValue={state.values.listAmount}
          hasError={!!state.errors.listAmount}
          placeholder="34999"
        />
      </Field>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save pricing"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setEditing(false)}
          disabled={isPending}
        >
          <X size={15} aria-hidden />
          Cancel
        </Button>
      </div>
    </form>
  );
}
