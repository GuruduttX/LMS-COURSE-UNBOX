"use client";

import { AlertCircle, Check, Tag, X } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { setCustomFee, type CustomFeeFormState } from "@/lib/actions/fee-plans";
import { formatPaise, toRupeeInput } from "@/lib/payments/money";

/**
 * A price for one student — the scholarship, the staff child, the fee agreed
 * over the phone.
 *
 * Collapsed behind a button like the program's own fee, and for the same
 * reason: this decides what a named person is charged, and it sits on a screen
 * people open to read rather than to edit.
 *
 * Blank clears it and puts them back on the program's price. **₹0 is a free
 * seat** — a real decision, distinct from having no custom price, which is why
 * the hint says so rather than leaving somebody to type ₹1 and hope.
 *
 * The action refuses a price below what they have already paid, so this cannot
 * be used to manufacture a credit; the message it returns says what to do
 * instead.
 */
export function CustomFeeControl({
  programSlug,
  studentId,
  studentName,
  customFeeAmount,
  programFeeLabel,
}: {
  programSlug: string;
  studentId: string;
  studentName: string;
  /** Their own price in paise, or null when they pay the program's. */
  customFeeAmount: number | null;
  /** What they'd pay without one — the placeholder, so the default is visible. */
  programFeeLabel: string;
}) {
  const [editing, setEditing] = useState(false);

  const [state, formAction, isPending] = useActionState<
    CustomFeeFormState,
    FormData
  >(setCustomFee, {
    ok: false,
    errors: {},
    values: {
      customFeeAmount:
        customFeeAmount === null ? "" : toRupeeInput(customFeeAmount),
    },
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

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-800"
      >
        <Tag size={12} aria-hidden />
        {customFeeAmount === null
          ? "Set a custom price"
          : `Custom: ${formatPaise(customFeeAmount)}`}
      </button>
    );
  }

  return (
    <form action={formAction} className="w-full">
      <input type="hidden" name="programSlug" value={programSlug} />
      <input type="hidden" name="studentId" value={studentId} />

      <label
        htmlFor={`custom-fee-${studentId}`}
        className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-ink-500"
      >
        {studentName}&rsquo;s price
      </label>

      <div className="flex items-center gap-2">
        <TextInput
          id={`custom-fee-${studentId}`}
          name="customFeeAmount"
          inputMode="decimal"
          className="h-9 text-sm"
          defaultValue={state.values.customFeeAmount}
          hasError={!!state.errors.customFeeAmount}
          placeholder={programFeeLabel}
          autoFocus
        />
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "…" : <Check size={14} aria-hidden />}
          <span className="sr-only">Save</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(false)}
          disabled={isPending}
        >
          <X size={14} aria-hidden />
          <span className="sr-only">Cancel</span>
        </Button>
      </div>

      <p className="mt-1 text-2xs text-ink-500">
        Blank = the program&rsquo;s price. 0 = a free seat.
      </p>

      {state.errors.customFeeAmount || state.error ? (
        <p
          role="alert"
          className="mt-1 flex items-start gap-1 text-xs font-medium text-danger-700"
        >
          <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden />
          {state.errors.customFeeAmount ?? state.error}
        </p>
      ) : null}
    </form>
  );
}
