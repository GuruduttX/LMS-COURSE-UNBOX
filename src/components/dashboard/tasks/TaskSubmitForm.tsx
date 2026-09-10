"use client";

import { CheckCircle2, ExternalLink, Info, Paperclip, Upload } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, Textarea, TextInput } from "@/components/ui/Field";
import { FileUpload } from "@/components/ui/FileUpload";
import { submitTask } from "@/lib/actions/task-submissions";
import { EMPTY_TASK_SUBMISSION_FORM } from "@/lib/actions/task-state";
import { formatDate } from "@/lib/curriculum/format";
import type { MyTaskSubmission, StudentTaskView } from "@/lib/data/tasks";
import {
  TASK_SUBMISSION_LABEL,
  describeSubmissionKinds,
  uploadableFileKinds,
} from "@/lib/tasks/submission-kinds";
import { formatBytes } from "@/lib/uploads/kinds";

/**
 * Handing a task in.
 *
 * The form renders **only what the task asked for**: an upload field when it
 * wants a document or an image, a URL box when it wants a link, both when it
 * wants either. Offering all three regardless would leave a student choosing
 * between ways to be wrong, and the action refuses anything the task does not
 * accept anyway — this is that same rule, shown rather than enforced.
 *
 * **The teacher's note sits directly above the field**, which is the whole
 * reason it is stored apart from the description: it is the instruction that
 * has to be read at the moment of handing in ("name the file with your student
 * number"), not the one read when the task is opened. Putting it anywhere else
 * on the page is how it gets scrolled past.
 *
 * Handing in again replaces what is there — the previous hand-in stays on
 * screen until it does, so nobody is left looking at an empty form wondering
 * whether the first attempt counted.
 */
export function TaskSubmitForm({
  task,
  programSlug,
}: {
  task: StudentTaskView;
  programSlug: string;
}) {
  const [state, action, pending] = useActionState(
    submitTask,
    EMPTY_TASK_SUBMISSION_FORM,
  );

  const accepts = task.submission.kinds;
  const fileKinds = uploadableFileKinds(accepts);
  const takesLink = accepts.includes("link");
  const submitted = task.mySubmission;

  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm md:p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
        <Upload size={15} aria-hidden className="text-ink-400" />
        {submitted ? "Your hand-in" : "Hand this in"}
      </h2>

      {submitted ? <AlreadyIn submission={submitted} /> : null}

      {state.ok ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-success-500 bg-success-50 p-3 text-sm font-medium text-success-700">
          <CheckCircle2 size={16} aria-hidden className="mt-0.5 shrink-0" />
          {state.message ?? "Handed in."}
        </p>
      ) : state.error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-danger-500 bg-danger-50 p-3 text-sm font-medium text-danger-700"
        >
          {state.error}
        </p>
      ) : null}

      <form action={action} noValidate className="mt-4 space-y-4">
        <input type="hidden" name="programSlug" value={programSlug} />
        <input type="hidden" name="taskId" value={task.id} />

        {/* The teacher's instruction, immediately above the field it is about. */}
        {task.submission.note ? (
          <p className="flex items-start gap-2 rounded-lg border border-brand-600/30 bg-brand-50 p-3 text-sm text-ink-800">
            <Info size={15} aria-hidden className="mt-0.5 shrink-0 text-brand-600" />
            <span className="whitespace-pre-line">{task.submission.note}</span>
          </p>
        ) : null}

        {fileKinds.length > 0 ? (
          <FileUpload
            name="file"
            scope="submissions"
            accept={fileKinds}
            label={submitted ? "Replace your file" : "Your work"}
            required={!takesLink}
            hint={`This task takes ${describeSubmissionKinds(accepts)}.`}
            error={state.errors.url}
          />
        ) : null}

        {takesLink ? (
          <Field
            id="task-url"
            label={fileKinds.length > 0 ? "Or a link to your work" : "Link to your work"}
            required={fileKinds.length === 0}
            error={fileKinds.length > 0 ? undefined : state.errors.url}
            hint="Check the sharing setting before you paste it — a link only you can open reads as nothing handed in."
          >
            <TextInput
              id="task-url"
              name="url"
              type="url"
              inputMode="url"
              placeholder="https://…"
              defaultValue={state.values.url}
              hasError={Boolean(state.errors.url)}
            />
          </Field>
        ) : null}

        <Field
          id="task-note"
          label="Note for your teacher"
          required={false}
          error={state.errors.note}
        >
          <Textarea
            id="task-note"
            name="note"
            rows={2}
            defaultValue={state.values.note}
            placeholder="Anything they should know about what you've sent."
            hasError={Boolean(state.errors.note)}
          />
        </Field>

        <Button type="submit" disabled={pending}>
          <Upload size={16} aria-hidden />
          {pending ? "Sending…" : submitted ? "Replace it" : "Hand it in"}
        </Button>
      </form>
    </section>
  );
}

/** What is already in, so replacing it is a decision and not an accident. */
function AlreadyIn({ submission }: { submission: MyTaskSubmission }) {
  return (
    <div className="mt-3 rounded-lg border border-border bg-ink-50 p-3">
      <p className="text-xs text-ink-500">
        {TASK_SUBMISSION_LABEL[submission.kind]} · handed in{" "}
        {formatDate(submission.submittedAt)}
      </p>

      <a
        href={submission.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 inline-flex max-w-full items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
      >
        {submission.file ? (
          <>
            <Paperclip size={14} aria-hidden className="shrink-0 text-ink-400" />
            <span className="truncate">{submission.file.name}</span>
            <span className="shrink-0 text-xs font-normal text-ink-500">
              {formatBytes(submission.file.bytes)}
            </span>
          </>
        ) : (
          <>
            <ExternalLink size={14} aria-hidden className="shrink-0 text-ink-400" />
            <span className="truncate">{submission.url}</span>
          </>
        )}
      </a>

      {submission.note ? (
        <p className="mt-2 whitespace-pre-line text-sm text-ink-700">
          {submission.note}
        </p>
      ) : null}
    </div>
  );
}
