"use client";

/**
 * Write a module test or a course final test.
 *
 * The same form for both, because they differ only in facts the author does not
 * get to choose. A final test is proctored and counts toward the result; a
 * module test is neither. Both are decided by *where the test was created* and
 * set by the action — offering them as checkboxes would let someone build an
 * unproctored final paper, or a module test that quietly changed a result.
 *
 * There is no key field and no create/edit mode. A course has one final test
 * and a module has one test, so the URL is the identity: Save creates it the
 * first time and updates it every time after, and the action decides which by
 * looking rather than by trusting a hidden field.
 */
import { useActionState, useState } from "react";

import { saveAssessment } from "@/lib/actions/curriculum";
import {
  EMPTY_ASSESSMENT_STATE,
  type AssessmentFormState,
} from "@/lib/actions/curriculum-state";
import { Field, Select, TextInput } from "@/components/ui/Field";
import type { AssessmentScope } from "@/lib/data/staff-work";
import type {
  AssessmentInput,
  QuestionInput,
} from "@/lib/validation/curriculum";

import {
  ContextCard,
  FieldRow,
  FormActions,
  FormBanner,
  FormLayout,
  FormSection,
  SidebarCard,
  StatusField,
} from "./FormShell";
import { QuestionBuilder } from "./QuestionBuilder";

export function AssessmentForm({
  scope,
  area,
  programSlug,
  courseKey,
  moduleKey,
  exists,
  initial,
  initialTerm = null,
  initialQuestions = [],
  cancelHref,
  context = [],
}: {
  scope: AssessmentScope;
  area: "admin" | "teacher";
  programSlug: string;
  courseKey: string;
  /** Set for a module test; a final test hangs off the course. */
  moduleKey?: string;
  /** Whether the paper is already in the database — labels only. */
  exists: boolean;
  initial: AssessmentInput;
  /** Term papers only: which of the two this is. */
  initialTerm?: "mid" | "end" | null;
  initialQuestions?: QuestionInput[];
  cancelHref: string;
  /** Program / course / module titles for the side rail. */
  context?: { label: string; value: string }[];
}) {
  const [state, action, pending] = useActionState<
    AssessmentFormState,
    FormData
  >(saveAssessment, {
    ...EMPTY_ASSESSMENT_STATE,
    values: initial,
    questions: initialQuestions,
  });

  const values = state.values;
  const [title, setTitle] = useState(values.title);
  const [term, setTerm] = useState<"mid" | "end" | "">(initialTerm ?? "");

  // Whatever came back from a rejected save, falling back to what was loaded.
  // Losing an author's typing on a validation failure is the one thing a form
  // this long must never do.
  const questions =
    state.questions.length > 0 ? state.questions : initialQuestions;

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
            submitLabel={exists ? "Save test" : "Create test"}
            note="A draft paper is invisible to students, however many questions it has."
          />
        </>
      }
    >
      <input type="hidden" name="area" value={area} />
      <input type="hidden" name="programSlug" value={programSlug} />
      <input type="hidden" name="courseKey" value={courseKey} />
      <input type="hidden" name="scope" value={scope} />
      {moduleKey ? (
        <input type="hidden" name="moduleKey" value={moduleKey} />
      ) : null}

      <FormBanner ok={state.ok} error={state.error} />

      <FormSection
        title="The paper"
        description="What it is called, how long students get, and what each question is worth."
      >
        {/*
          The one structural thing a term paper's author chooses. A checkpoint
          course does not say whether it holds the mid-term or the end-term, and
          the program may have only one of each — so this is a select rather
          than something derived from the course's position, which would guess.
        */}
        {scope === "term_test" ? (
          <Field
            id="term"
            label="Which paper is this?"
            required
            hint="A program has one mid-term and one end-term. Both count toward the aggregate."
          >
            <Select
              id="term"
              name="term"
              value={term}
              onChange={(event) => setTerm(event.target.value as "mid" | "end")}
              required
            >
              <option value="">Pick one</option>
              <option value="mid">Mid-term</option>
              <option value="end">End-term</option>
            </Select>
          </Field>
        ) : null}

        <Field id="title" label="Title" error={state.errors.title} required>
          <TextInput
            id="title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={
              scope === "term_test"
                ? "Mid-term assessment"
                : scope === "final_test"
                  ? "Final test"
                  : "Module test"
            }
            hasError={Boolean(state.errors.title)}
          />
        </Field>

        <FieldRow>
          <Field
            id="durationMinutes"
            label="Time allowed"
            error={state.errors.durationMinutes}
            required
            hint="Minutes. The clock starts when the student opens the paper."
          >
            <TextInput
              id="durationMinutes"
              name="durationMinutes"
              inputMode="numeric"
              defaultValue={values.durationMinutes}
              hasError={Boolean(state.errors.durationMinutes)}
            />
          </Field>

          <Field
            id="marksPerQuestion"
            label="Marks per question"
            error={state.errors.marksPerQuestion}
            required
            hint="Every question is worth the same. The total is this times the number of questions."
          >
            <TextInput
              id="marksPerQuestion"
              name="marksPerQuestion"
              inputMode="numeric"
              defaultValue={values.marksPerQuestion}
              hasError={Boolean(state.errors.marksPerQuestion)}
            />
          </Field>
        </FieldRow>
      </FormSection>

      <FormSection
        title="Questions"
        description="Every question is worth the same. Mark the right answer as you write each one."
      >
        {state.errors.questions ? (
          <p role="alert" className="text-xs font-medium text-danger-700">
            {state.errors.questions}
          </p>
        ) : null}
        <QuestionBuilder
          initial={questions}
          showErrors={Boolean(state.errors.questions)}
        />
      </FormSection>
    </FormLayout>
  );
}
