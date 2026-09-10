"use client";

/**
 * Create or edit a program — the root of the tree, and admin-only.
 *
 * The slug gets the same treatment a key does one level down: suggested from
 * the title while creating, frozen afterwards. It is what live sessions,
 * enrolments and staff assignments join on, so renaming it would orphan all
 * three.
 */
import { useActionState, useState } from "react";

import { saveProgram } from "@/lib/actions/curriculum";
import {
  EMPTY_PROGRAM_STATE,
  type ProgramFormState,
} from "@/lib/actions/curriculum-state";
import { Field, TextInput, Textarea } from "@/components/ui/Field";
import { slugify } from "@/lib/curriculum/keys";
import type { ProgramInput } from "@/lib/validation/curriculum";

import {
  FieldRow,
  FormActions,
  FormBanner,
  FormLayout,
  FormSection,
  SidebarCard,
  StatusField,
} from "./FormShell";

export function ProgramForm({
  mode,
  initial,
  cancelHref,
}: {
  mode: "create" | "edit";
  initial?: ProgramInput;
  cancelHref: string;
}) {
  const [state, action, pending] = useActionState<ProgramFormState, FormData>(
    saveProgram,
    initial ? { ...EMPTY_PROGRAM_STATE, values: initial } : EMPTY_PROGRAM_STATE,
  );

  const values = state.values;
  const [title, setTitle] = useState(values.title);
  const [slug, setSlug] = useState(values.slug);

  return (
    <FormLayout
      action={action}
      aside={
        <>
          <SidebarCard>
            <StatusField value={values.status} error={state.errors.status} />
          </SidebarCard>
          <FormActions
            pending={pending}
            cancelHref={cancelHref}
            submitLabel={mode === "create" ? "Create program" : "Save changes"}
            note="Courses are added from the program screen once it exists."
          />
        </>
      }
    >
      <input type="hidden" name="mode" value={mode} />
      {mode === "edit" ? (
        <input type="hidden" name="originalSlug" value={values.slug} />
      ) : null}

      <FormBanner ok={state.ok} error={state.error} />

      <FormSection
        title="The program"
        description="Its name, the slug every URL is built from, and what it promises a student."
      >
        <FieldRow>
          <Field id="title" label="Title" error={state.errors.title} required>
            <TextInput
              id="title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Performance Marketing"
              hasError={Boolean(state.errors.title)}
            />
          </Field>

          {mode === "create" ? (
            <Field
              id="slug"
              label="Slug"
              error={state.errors.slug}
              required
              hint="Appears in every URL and joins to live sessions and enrolments. Fixed after creation."
            >
              <TextInput
                id="slug"
                name="slug"
                value={slug}
                onChange={(event) => setSlug(slugify(event.target.value))}
                placeholder={slugify(title) || "performance-marketing"}
                hasError={Boolean(state.errors.slug)}
              />
            </Field>
          ) : (
            <Field
              id="slug"
              label="Slug"
              required
              hint="Fixed after creation — sessions, enrolments and every URL point at it."
            >
              <TextInput id="slug" value={values.slug} readOnly disabled />
              <input type="hidden" name="slug" value={values.slug} />
            </Field>
          )}
        </FieldRow>

        <Field
          id="summary"
          label="Summary"
          error={state.errors.summary}
          hint="One or two lines, shown above the curriculum."
        >
          <Textarea
            id="summary"
            name="summary"
            defaultValue={values.summary}
            hasError={Boolean(state.errors.summary)}
          />
        </Field>

        <Field
          id="deadline"
          label="Programme deadline"
          error={state.errors.deadline}
          hint="The date the whole programme should be finished by."
        >
          <TextInput
            id="deadline"
            name="deadline"
            type="date"
            defaultValue={values.deadline}
            hasError={Boolean(state.errors.deadline)}
          />
        </Field>
      </FormSection>
    </FormLayout>
  );
}
