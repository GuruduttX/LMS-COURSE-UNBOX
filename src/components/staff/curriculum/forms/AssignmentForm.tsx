"use client";

/**
 * Create or edit an assignment — the only work in the app a human marks.
 *
 * Two fields carry most of the weight. **The brief** is what the student
 * actually works from, so it is the tall field in the middle rather than a note
 * at the bottom, and it is required before publishing. **Accepted formats** is
 * the requirement made concrete: at least one must be ticked, because a student
 * has to be told what to hand in.
 *
 * The brief comes in two halves, and either can stand alone: the text a teacher
 * types, and **a PDF handed out to every student on the assignment** (the
 * rubric, the dataset, the printed spec). Publishing needs one of the two, not
 * both — a teacher whose brief *is* the PDF should not have to retype it into
 * the box, and a rule like that is one people work around by pasting "see
 * attached".
 *
 * What the form must not imply: the student's **hand-in** is still a link, not
 * an upload. The teacher uploading a brief and the student submitting work are
 * two different things, and the hint under the formats says so — we can only
 * check a hand-in's format when its URL happens to end in a file extension,
 * which most share links do not.
 */
import { useActionState, useState } from "react";

import { saveAssignment } from "@/lib/actions/curriculum";
import {
  EMPTY_ASSIGNMENT_STATE,
  type AssignmentFormState,
} from "@/lib/actions/curriculum-state";
import { Field, TextInput, Textarea } from "@/components/ui/Field";
import { FileUpload } from "@/components/ui/FileUpload";
import {
  SUBMISSION_FORMATS,
  SUBMISSION_FORMAT_ICON,
  SUBMISSION_FORMAT_LABEL,
} from "@/lib/curriculum/submission-formats";
import type { SubmissionFormat } from "@/lib/curriculum/submission-formats";
import type { UploadedFile } from "@/lib/uploads/kinds";
import {
  MAX_BODY_LENGTH,
  type AssignmentInput,
} from "@/lib/validation/curriculum";

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

export function AssignmentForm({
  mode,
  area,
  programSlug,
  courseKey,
  initial,
  initialFormats,
  initialBriefFile,
  suggestedKey,
  cancelHref,
  context = [],
}: {
  mode: "create" | "edit";
  area: "admin" | "teacher";
  programSlug: string;
  courseKey: string;
  initial?: AssignmentInput;
  initialFormats?: SubmissionFormat[];
  initialBriefFile?: UploadedFile | null;
  suggestedKey?: string;
  cancelHref: string;
  /** Program / course titles for the side rail. */
  context?: { label: string; value: string }[];
}) {
  const [state, action, pending] = useActionState<
    AssignmentFormState,
    FormData
  >(
    saveAssignment,
    initial
      ? {
          ...EMPTY_ASSIGNMENT_STATE,
          values: initial,
          acceptedFormats: initialFormats ?? ["pdf"],
          briefFile: initialBriefFile ?? null,
        }
      : EMPTY_ASSIGNMENT_STATE,
  );

  const values = state.values;
  const [title, setTitle] = useState(values.title);

  // Held here so a rejected save comes back with the boxes still ticked.
  const [formats, setFormats] = useState<SubmissionFormat[]>(
    initialFormats ?? state.acceptedFormats,
  );

  function toggle(format: SubmissionFormat) {
    setFormats((current) =>
      current.includes(format)
        ? current.filter((item) => item !== format)
        : [...current, format],
    );
  }

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
            submitLabel={
              mode === "create" ? "Create assignment" : "Save changes"
            }
            note="Hand-ins are marked from the course's submissions screen."
          />
        </>
      }
    >
      <FormContext
        area={area}
        programSlug={programSlug}
        mode={mode}
        courseKey={courseKey}
        originalKey={mode === "edit" ? values.key : undefined}
      />

      <FormBanner ok={state.ok} error={state.error} />

      <FormSection
        title="The assignment"
        description="What it is called, and the identifier every link to it uses."
      >
        <FieldRow>
          <Field id="title" label="Title" error={state.errors.title} required>
            <TextInput
              id="title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Build and document a search campaign"
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
      </FormSection>

      <FormSection
        title="The brief"
        description="What the student works from — a document, written instructions, or both."
      >
        <FileUpload
          name="briefFile"
          scope="curriculum"
          accept={["pdf"]}
          label="Brief document"
          required={false}
          hint="Handed out to every student on this assignment — the rubric, the spec, the dataset. Optional if you write the brief below instead."
          error={state.errors.briefFile}
          defaultValue={initialBriefFile ? [initialBriefFile] : []}
        />

        <Field
          id="brief"
          label="Brief"
          error={state.errors.brief}
          hint={`Markdown. What the student works from — required before publishing unless you attached the brief as a PDF above. Up to ${MAX_BODY_LENGTH.toLocaleString("en-IN")} characters.`}
        >
          <Textarea
            id="brief"
            name="brief"
            defaultValue={values.brief}
            className="min-h-64 font-mono text-[13px]"
            hasError={Boolean(state.errors.brief)}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Handing in and marking"
        description="What you will accept, when it is due, and what it is worth."
      >
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-700">
            What may they hand in?
          </legend>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {SUBMISSION_FORMATS.map((format) => {
              const Icon = SUBMISSION_FORMAT_ICON[format];
              const checked = formats.includes(format);
              return (
                <label
                  key={format}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                    checked
                      ? "border-brand-600 bg-brand-50"
                      : "border-border bg-surface hover:border-border-strong"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="acceptedFormats"
                    value={format}
                    checked={checked}
                    onChange={() => toggle(format)}
                    className="h-4 w-4 shrink-0 accent-brand-600"
                  />
                  <span className="flex items-center gap-1.5 font-medium text-ink-900">
                    <Icon size={16} aria-hidden />
                    {SUBMISSION_FORMAT_LABEL[format]}
                  </span>
                </label>
              );
            })}
          </div>

          {state.errors.acceptedFormats ? (
            <p
              role="alert"
              className="mt-1.5 text-xs font-medium text-danger-700"
            >
              {state.errors.acceptedFormats}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-ink-500">
              Students hand in a link, not a file — the upload above is your
              brief, not their work. This tells them what to link to, and it is
              yours to enforce by eye.
            </p>
          )}
        </fieldset>

        <FieldRow>
          <Field id="dueDate" label="Due date" error={state.errors.dueDate}>
            <TextInput
              id="dueDate"
              name="dueDate"
              type="date"
              defaultValue={values.dueDate}
              hasError={Boolean(state.errors.dueDate)}
            />
          </Field>

          <Field
            id="maxMarks"
            label="Out of"
            error={state.errors.maxMarks}
            required
            hint="What a full mark is worth on the marksheet."
          >
            <TextInput
              id="maxMarks"
              name="maxMarks"
              inputMode="numeric"
              defaultValue={values.maxMarks}
              hasError={Boolean(state.errors.maxMarks)}
            />
          </Field>
        </FieldRow>
      </FormSection>
    </FormLayout>
  );
}
