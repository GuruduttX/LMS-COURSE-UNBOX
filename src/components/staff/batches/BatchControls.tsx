"use client";

import { Layers, Pencil, Plus, X } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { createBatch, updateBatch } from "@/app/manager/batches/actions";
import {
  EMPTY_BATCH_FORM,
  type BatchFormState,
} from "@/app/manager/batches/state";
import type { BatchRow } from "@/lib/data/batches";

/**
 * The two write controls on the batches screen.
 *
 * Small islands on an otherwise server-rendered page, the same shape as
 * `students/EnrollControls.tsx`. Both post to actions that re-check the role,
 * the capability **and** the scope, so rendering them is not what makes them
 * work: a manager who forged the form for a program they don't run is still
 * refused.
 */

export function CreateBatchForm({
  programs,
}: {
  programs: { slug: string; title: string }[];
}) {
  const [state, action, pending] = useActionState<BatchFormState, FormData>(
    createBatch,
    EMPTY_BATCH_FORM,
  );

  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
        <Layers size={15} aria-hidden className="text-ink-400" />
        New batch
      </h2>

      <form
        action={action}
        className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end"
      >
        <Field
          id="programSlug"
          label="Program"
          required
          error={state.errors.programSlug}
        >
          <Select
            id="programSlug"
            name="programSlug"
            defaultValue={programs.length === 1 ? programs[0].slug : ""}
            hasError={!!state.errors.programSlug}
          >
            <option value="">Pick a program</option>
            {programs.map((program) => (
              <option key={program.slug} value={program.slug}>
                {program.title}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          id="name"
          label="Name"
          required
          error={state.errors.name}
          hint="How staff and students will refer to this cohort."
        >
          <TextInput
            id="name"
            name="name"
            placeholder="Aug 2026 · Evening"
            defaultValue={state.values.name}
            hasError={!!state.errors.name}
          />
        </Field>

        <Field
          id="capacity"
          label="Seats"
          required
          error={state.errors.capacity}
        >
          <TextInput
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            max={1000}
            defaultValue={state.values.capacity}
            hasError={!!state.errors.capacity}
          />
        </Field>

        <Field
          id="startsOn"
          label="Starts"
          required={false}
          error={state.errors.startsOn}
        >
          <TextInput
            id="startsOn"
            name="startsOn"
            type="date"
            defaultValue={state.values.startsOn}
            hasError={!!state.errors.startsOn}
          />
        </Field>

        <Field
          id="endsOn"
          label="Ends"
          required={false}
          error={state.errors.endsOn}
        >
          <TextInput
            id="endsOn"
            name="endsOn"
            type="date"
            defaultValue={state.values.endsOn}
            hasError={!!state.errors.endsOn}
          />
        </Field>

        <Button
          type="submit"
          disabled={pending}
          className="sm:col-span-2 lg:col-span-1"
        >
          <Plus size={16} aria-hidden />
          {pending ? "Creating…" : "Create batch"}
        </Button>
      </form>

      {state.ok && state.message ? (
        <p role="status" className="mt-2 text-xs font-medium text-success-700">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Edit one batch, inline.
 *
 * Closing is part of this form rather than its own button: a closed batch is a
 * state of the cohort, not an event, and pairing it with the seat count is what
 * makes "closed with 12 people in it" legible. Nothing here deletes — the name
 * is the key every enrolment joins on.
 */
export function EditBatchButton({ batch }: { batch: BatchRow }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<BatchFormState, FormData>(
    updateBatch,
    EMPTY_BATCH_FORM,
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded text-xs font-semibold text-ink-600 hover:text-brand-700"
      >
        <Pencil size={14} aria-hidden />
        Edit
      </button>
    );
  }

  return (
    // Stacked, never columnar: this form opens *inside a batch card*, which is
    // a third of a grid row wide, and four columns there gave each input about
    // sixty pixels — a date field that could not show a date. The create form
    // above is the one that spans the page and can afford a row.
    <form action={action} className="grid gap-3 sm:max-w-xs">
      <input type="hidden" name="id" value={batch.id} />
      <input type="hidden" name="programSlug" value={batch.programSlug} />

      <Field
        id={`name-${batch.id}`}
        label="Name"
        required
        error={state.errors.name}
      >
        <TextInput
          id={`name-${batch.id}`}
          name="name"
          defaultValue={batch.name}
          hasError={!!state.errors.name}
        />
      </Field>

      <Field
        id={`capacity-${batch.id}`}
        label="Seats"
        required
        error={state.errors.capacity}
        hint={
          batch.enrolled > 0 ? `${batch.enrolled} already enrolled.` : undefined
        }
      >
        <TextInput
          id={`capacity-${batch.id}`}
          name="capacity"
          type="number"
          min={1}
          max={1000}
          defaultValue={String(batch.capacity)}
          hasError={!!state.errors.capacity}
        />
      </Field>

      <Field
        id={`startsOn-${batch.id}`}
        label="Starts"
        required={false}
        error={state.errors.startsOn}
      >
        <TextInput
          id={`startsOn-${batch.id}`}
          name="startsOn"
          type="date"
          defaultValue={batch.startsOn ? batch.startsOn.slice(0, 10) : ""}
          hasError={!!state.errors.startsOn}
        />
      </Field>

      <Field
        id={`endsOn-${batch.id}`}
        label="Ends"
        required={false}
        error={state.errors.endsOn}
      >
        <TextInput
          id={`endsOn-${batch.id}`}
          name="endsOn"
          type="date"
          defaultValue={batch.endsOn ? batch.endsOn.slice(0, 10) : ""}
          hasError={!!state.errors.endsOn}
        />
      </Field>

      <Field
        id={`status-${batch.id}`}
        label="Status"
        required
        hint="Closed batches are not offered when enrolling."
      >
        <Select
          id={`status-${batch.id}`}
          name="status"
          defaultValue={batch.status}
        >
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </Select>
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-900"
        >
          <X size={14} aria-hidden />
          Cancel
        </button>
        {state.ok && state.message ? (
          <span role="status" className="text-xs font-medium text-success-700">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
