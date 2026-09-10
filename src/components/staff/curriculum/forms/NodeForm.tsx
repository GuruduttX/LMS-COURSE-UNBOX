"use client";

/**
 * Create or edit a module or a topic.
 *
 * One component for both, because they carry identical fields — a title, a key
 * and a visibility — and their numbering is not one of them: `Module 2` is
 * derived from position, so a teacher who moves it never has to remember to
 * renumber it.
 *
 * A module's **study material** used to be a field here and is not any more.
 * It is attached, replaced and removed on the module's own screen, beside the
 * topics and the test — see `ModuleMaterial`. That is where a teacher looks
 * for it, and it means the file has exactly one writer: this form, saved from
 * a tab left open, can no longer re-post a handout somebody has taken down.
 */
import { useActionState, useState } from "react";

import { saveModule, saveTopic } from "@/lib/actions/curriculum";
import {
  EMPTY_NODE_STATE,
  type NodeFormState,
} from "@/lib/actions/curriculum-state";
import { Field, TextInput } from "@/components/ui/Field";
import type { NodeInput } from "@/lib/validation/curriculum";

import {
  ContextCard,
  FormActions,
  FormBanner,
  FormContext,
  FormLayout,
  FormSection,
  KeyField,
  SidebarCard,
  StatusField,
} from "./FormShell";

export function NodeForm({
  noun,
  mode,
  area,
  programSlug,
  courseKey,
  moduleKey,
  initial,
  suggestedKey,
  cancelHref,
  context = [],
}: {
  noun: "module" | "topic";
  mode: "create" | "edit";
  area: "admin" | "teacher";
  programSlug: string;
  courseKey: string;
  /** Set for a topic — the module it belongs to. */
  moduleKey?: string;
  initial?: NodeInput;
  suggestedKey?: string;
  cancelHref: string;
  /** Program / course / module titles for the side rail. */
  context?: { label: string; value: string }[];
}) {
  const [state, action, pending] = useActionState<NodeFormState, FormData>(
    noun === "module" ? saveModule : saveTopic,
    initial ? { ...EMPTY_NODE_STATE, values: initial } : EMPTY_NODE_STATE,
  );

  const values = state.values;
  const [title, setTitle] = useState(values.title);

  return (
    <FormLayout
      action={action}
      aside={
        <>
          {context.length > 0 ? <ContextCard items={context} /> : null}
          <SidebarCard>
            <StatusField value={values.status} error={state.errors.status} />
          </SidebarCard>
          <FormActions
            pending={pending}
            cancelHref={cancelHref}
            submitLabel={mode === "create" ? `Create ${noun}` : "Save changes"}
            note={
              noun === "module"
                ? "Topics, the study material and the module test are added from the module screen once it exists."
                : "The videos, reading and quizzes are added from the module screen."
            }
          />
        </>
      }
    >
      <FormContext
        area={area}
        programSlug={programSlug}
        mode={mode}
        courseKey={courseKey}
        moduleKey={moduleKey}
        originalKey={mode === "edit" ? values.key : undefined}
      />

      <FormBanner ok={state.ok} error={state.error} />

      <FormSection
        title={noun === "module" ? "The module" : "The topic"}
        description={
          noun === "module"
            ? "What students see in the outline, and the identifier every link to it uses."
            : "A heading inside the module. Its number follows its position."
        }
      >
        <Field
          id="title"
          label="Title"
          error={state.errors.title}
          required
          hint={
            noun === "module"
              ? "The number is added automatically from its position."
              : undefined
          }
        >
          <TextInput
            id="title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={
              noun === "module"
                ? "Bidding strategies"
                : "Manual CPC in practice"
            }
            hasError={Boolean(state.errors.title)}
          />
        </Field>

        <KeyField
          mode={mode}
          value={values.key}
          suggestion={suggestedKey ?? ""}
          error={state.errors.key}
        />
      </FormSection>
    </FormLayout>
  );
}
