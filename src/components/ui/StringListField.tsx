"use client";

import { Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { AlertCircle } from "lucide-react";

import { TextInput } from "@/components/ui/Field";

/**
 * A list of short strings — highlights, tools, the things a program offers.
 *
 * One `<input>` per row, all sharing the field's `name`, so the action reads
 * them with `formData.getAll(name)`. That is why this is not the JSON-in-a-
 * hidden-input pattern `QuestionBuilder` uses: a question is a structure with
 * parts that must stay together, and these are plain strings that a repeated
 * form field already expresses exactly. It also means the field degrades — the
 * rows that exist still post if the JavaScript never arrives.
 *
 * Not a one-per-line textarea, which was the other candidate: three fields use
 * this, and separate rows make the cap countable and each bullet individually
 * removable without selecting the right line of text.
 *
 * Order is the order they were entered, and it is what the public page prints.
 * Blank rows are dropped server-side by `cleanStringList` rather than rejected —
 * an empty row is somebody who clicked Add and changed their mind.
 */
export function StringListField({
  name,
  label,
  hint,
  error,
  max,
  addLabel = "Add another",
  placeholder,
  defaultValue = [],
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  /** The cap from `curriculum/rules.ts`. Adding stops here. */
  max: number;
  addLabel?: string;
  placeholder?: string;
  defaultValue?: readonly string[];
}) {
  const fieldId = useId();

  // Rows are keyed by identity rather than by index: removing the second of
  // three rows with index keys makes React reuse the removed row's DOM node for
  // the one after it, and an uncontrolled input keeps the value that was in it.
  // The row you deleted appears to come back and the one below it vanishes.
  const [rows, setRows] = useState<{ id: number; value: string }[]>(() =>
    seedRows(defaultValue),
  );

  const full = rows.length >= max;

  function update(id: number, value: string) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, value } : row)),
    );
  }

  function remove(id: number) {
    // Never drop to zero rows: an empty field would be a lone "Add" button with
    // nothing to explain what it adds.
    setRows((current) =>
      current.length === 1
        ? [{ id: current[0].id, value: "" }]
        : current.filter((row) => row.id !== id),
    );
  }

  function add() {
    setRows((current) =>
      current.length >= max
        ? current
        : [...current, { id: nextId(current), value: "" }],
    );
  }

  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium text-ink-700">
        {label}
        <span className="ml-1.5 text-xs font-normal text-ink-400">
          (optional)
        </span>
      </legend>

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.id} className="flex items-center gap-2">
            <TextInput
              name={name}
              value={row.value}
              onChange={(event) => update(row.id, event.target.value)}
              placeholder={index === 0 ? placeholder : undefined}
              hasError={Boolean(error)}
              aria-label={`${label} ${index + 1}`}
              aria-describedby={
                error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
              }
            />
            <button
              type="button"
              onClick={() => remove(row.id)}
              className="shrink-0 rounded-md border border-border p-2 text-ink-500 transition-colors hover:border-border-strong hover:text-ink-700"
            >
              <X size={16} aria-hidden />
              <span className="sr-only">
                Remove {label} {index + 1}
              </span>
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        disabled={full}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700 disabled:cursor-not-allowed disabled:text-ink-400"
      >
        <Plus size={16} aria-hidden />
        {full ? `That's all ${max}` : addLabel}
      </button>

      {error ? (
        <p
          id={`${fieldId}-error`}
          className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-danger-700"
        >
          <AlertCircle size={14} className="mt-px shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="mt-1.5 text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Saved values, or one empty row so the field is never a bare button. */
function seedRows(values: readonly string[]): { id: number; value: string }[] {
  if (values.length === 0) return [{ id: 0, value: "" }];
  return values.map((value, index) => ({ id: index, value }));
}

function nextId(rows: readonly { id: number }[]): number {
  return rows.reduce((highest, row) => Math.max(highest, row.id), -1) + 1;
}
