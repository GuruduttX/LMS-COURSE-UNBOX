"use client";

/**
 * Create or edit a course.
 *
 * The one field worth explaining is **number**. Leaving it blank does not mean
 * "unnumbered" as a cosmetic choice — it makes the course a standalone
 * checkpoint, which unlocks on completion of everything before it rather than
 * on a final test. The hint says so, because a blank field that silently
 * changes behaviour is a trap.
 *
 * `checkpoint` turns that trap into a door. Arriving from "Add a term exam"
 * means the answer to the number question is already known, so the field is
 * replaced by a line saying what is being made — rather than leaving someone to
 * work out that a blank box is how you build a mid-term.
 */
import { useActionState, useState } from "react";

import { saveCourse } from "@/lib/actions/curriculum";
import {
  EMPTY_COURSE_STATE,
  type CourseFormState,
} from "@/lib/actions/curriculum-state";
import { Field, TextInput, Textarea } from "@/components/ui/Field";
import type { CourseInput } from "@/lib/validation/curriculum";

import {
  ContextCard,
  FieldRow,
  FormActions,
  FormBanner,
  FormContext,
  FormLayout,
  FormSection,
  KeyField,
  SidebarCard,
  StatusField,
} from "./FormShell";

export function CourseForm({
  mode,
  area,
  programSlug,
  initial,
  suggestedKey,
  cancelHref,
  checkpoint = false,
  context = [],
}: {
  mode: "create" | "edit";
  area: "admin" | "teacher";
  programSlug: string;
  initial?: CourseInput;
  suggestedKey?: string;
  cancelHref: string;
  /** Building a term exam: the number is settled, so the field goes away. */
  checkpoint?: boolean;
  /** Program title for the side rail. */
  context?: { label: string; value: string }[];
}) {
  const [state, action, pending] = useActionState<CourseFormState, FormData>(
    saveCourse,
    initial ? { ...EMPTY_COURSE_STATE, values: initial } : EMPTY_COURSE_STATE,
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
            submitLabel={mode === "create" ? "Create course" : "Save changes"}
            note="Modules, assignments and the final test are added from the course screen."
          />
        </>
      }
    >
      <FormContext
        area={area}
        programSlug={programSlug}
        mode={mode}
        originalKey={mode === "edit" ? values.key : undefined}
      />

      <FormBanner ok={state.ok} error={state.error} />

      <FormSection
        title="The course"
        description="What students see in the curriculum, and the identifier every link to it uses."
      >
        <FieldRow>
          <Field id="title" label="Title" error={state.errors.title} required>
            <TextInput
              id="title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Campaign structure and bidding"
              hasError={Boolean(state.errors.title)}
            />
          </Field>

          <KeyField
            mode={mode}
            value={values.key}
            suggestion={suggestedKey ?? ""}
            error={state.errors.key}
          />
        </FieldRow>

        {checkpoint ? (
          // An empty `number` is what makes it a checkpoint; posting it
          // explicitly beats relying on an absent field, which the action would
          // read the same way but for a reason nobody could see here.
          <>
            <input type="hidden" name="number" value="" />
            <p className="rounded-lg border border-border bg-ink-50 p-3 text-sm text-ink-700">
              This is a <span className="font-semibold">term exam</span>: it
              prints no “Course N”, sits between the courses in the order you
              give it, and opens once everything before it is finished. Write
              its paper from the program screen once it exists.
            </p>
          </>
        ) : null}

        <Field
          id="summary"
          label="Summary"
          error={state.errors.summary}
          hint="What a student will be able to do by the end of it."
        >
          <Textarea
            id="summary"
            name="summary"
            defaultValue={values.summary}
            hasError={Boolean(state.errors.summary)}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Order and pacing"
        description="Where it sits in the programme, and when it should be finished."
      >
        <FieldRow>
          {checkpoint ? null : (
            <Field
              id="number"
              label="Course number"
              error={state.errors.number}
              hint="Leave blank to make this a standalone checkpoint — it prints no “Course N” and is gated by completion rather than by a final test."
            >
              <TextInput
                id="number"
                name="number"
                inputMode="numeric"
                defaultValue={values.number}
                placeholder="4"
                hasError={Boolean(state.errors.number)}
              />
            </Field>
          )}

          <Field
            id="completeBy"
            label="Complete by"
            error={state.errors.completeBy}
          >
            <TextInput
              id="completeBy"
              name="completeBy"
              type="date"
              defaultValue={values.completeBy}
              hasError={Boolean(state.errors.completeBy)}
            />
          </Field>
        </FieldRow>

        <FieldRow>
          <Field
            id="startMonth"
            label="Starting month"
            error={state.errors.startMonth}
            hint="Which month of the programme this runs in. It is what the public page prints beside the course — leave both blank and no month is shown."
          >
            <TextInput
              id="startMonth"
              name="startMonth"
              inputMode="numeric"
              defaultValue={values.startMonth}
              placeholder="1"
              hasError={Boolean(state.errors.startMonth)}
            />
          </Field>

          <Field
            id="endMonth"
            label="Ending month"
            error={state.errors.endMonth}
            hint="Only if it spans more than one month. Blank means it sits inside the starting month."
          >
            <TextInput
              id="endMonth"
              name="endMonth"
              inputMode="numeric"
              defaultValue={values.endMonth}
              placeholder="2"
              hasError={Boolean(state.errors.endMonth)}
            />
          </Field>
        </FieldRow>
      </FormSection>
    </FormLayout>
  );
}
