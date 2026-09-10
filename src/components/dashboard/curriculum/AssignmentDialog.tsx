"use client";

import {
  CheckCircle2,
  Download,
  FileText,
  MoreVertical,
  Paperclip,
} from "lucide-react";
import { useActionState, useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { FileUpload } from "@/components/ui/FileUpload";
import { Field, Select, TextInput, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { submitAssignment } from "@/lib/actions/submissions";
import {
  EMPTY_SUBMISSION_STATE,
  type SubmissionFormState,
} from "@/lib/actions/curriculum-state";
import { formatDate } from "@/lib/curriculum/format";
import {
  SUBMISSION_FORMAT_LABEL,
  formatList,
  linkOnlyFormats,
  uploadableKinds,
} from "@/lib/curriculum/submission-formats";
import type { AssignmentView } from "@/lib/curriculum/types";
import { formatBytes } from "@/lib/uploads/kinds";

/**
 * Everything a student needs for one assignment, behind the row's ⋮ — the
 * brief as text, the brief as a document, and the way to hand work in.
 *
 * It is a dialog rather than a screen because there is no assignment screen and
 * this is not the moment to invent one: the curriculum page is where a student
 * meets the assignment, and the work of reading a brief and attaching a file
 * does not want a navigation away and back. When
 * `/dashboard/[slug]/assignments/[key]` is built, this content moves there
 * whole and the menu becomes a link.
 *
 * The trigger and the dialog live in one island, so the curriculum page stays a
 * server component and only this ships JavaScript.
 *
 * ## Two ways to hand in, and why both exist
 *
 * Uploading is the path: the file is then ours, its type is known, and there is
 * nothing for a teacher to chase. But **ZIP archives are not uploaded to
 * Cloudinary**, so an assignment that accepts one has to accept a link — and a
 * file over the size cap needs the same escape hatch. So the link is offered
 * behind a disclosure, not as an equal choice, and the format a student claims
 * for it is limited to what the teacher accepts. The action re-checks both.
 */
export function AssignmentDialog({
  programSlug,
  courseId,
  assignment,
}: {
  programSlug: string;
  courseId: string;
  assignment: AssignmentView;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();

  const brief = assignment.brief.trim();
  const hasBrief = Boolean(brief) || Boolean(assignment.briefFile);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={`Open ${assignment.title}`}
        aria-haspopup="dialog"
        className="rounded-md p-1.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
      >
        <MoreVertical size={18} aria-hidden />
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} labelledBy={titleId}>
        <div className="space-y-5 p-5 md:p-6">
          <header>
            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
              Assignment
            </p>
            <h2 id={titleId} className="mt-1 text-lg font-extrabold text-ink-900">
              {assignment.title}
            </h2>
            <p className="mt-1 text-sm text-ink-600">
              Out of {assignment.maxMarks}
              {assignment.dueDate ? ` · due ${formatDate(assignment.dueDate)}` : ""}
              {" · accepts "}
              {formatList(assignment.acceptedFormats) || "nothing yet"}
            </p>
          </header>

          {assignment.briefFile ? (
            <a
              href={assignment.briefFile.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border border-border bg-ink-50 p-3 transition-colors hover:border-border-strong hover:bg-surface"
            >
              <FileText size={18} aria-hidden className="shrink-0 text-brand-600" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-900">
                  {assignment.briefFile.name}
                </span>
                <span className="block text-2xs text-ink-500">
                  The brief document · {formatBytes(assignment.briefFile.bytes)} ·
                  opens in a new tab
                </span>
              </span>
              <Download size={16} aria-hidden className="shrink-0 text-ink-500" />
            </a>
          ) : null}

          {brief ? (
            <section>
              <h3 className="text-sm font-bold text-ink-900">Brief</h3>
              {/* Paragraphs, not markdown — rendering markdown means sanitising
                  HTML on a page students read, which is worth doing
                  deliberately rather than as a side effect here. Same call as
                  ReadingStage. */}
              <div className="mt-1.5 max-h-56 space-y-2 overflow-y-auto pr-1 text-sm leading-relaxed text-ink-700">
                {brief.split(/\n{2,}/).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </section>
          ) : null}

          {!hasBrief ? (
            <p className="rounded-lg border border-dashed border-border-strong p-3 text-sm text-ink-500">
              Your teacher hasn&apos;t added a brief yet. Ask them what this
              assignment needs before you hand anything in.
            </p>
          ) : null}

          <SubmitSection
            programSlug={programSlug}
            courseId={courseId}
            assignment={assignment}
          />

          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function SubmitSection({
  programSlug,
  courseId,
  assignment,
}: {
  programSlug: string;
  courseId: string;
  assignment: AssignmentView;
}) {
  const [state, action, pending] = useActionState<SubmissionFormState, FormData>(
    submitAssignment,
    EMPTY_SUBMISSION_STATE,
  );

  const submission = assignment.submission;
  const kinds = uploadableKinds(assignment.acceptedFormats);
  const linkOnly = linkOnlyFormats(assignment.acceptedFormats);
  const canUpload = kinds.length > 0;

  return (
    <section className="border-t border-border pt-5">
      <h3 className="text-sm font-bold text-ink-900">
        {submission ? "Your hand-in" : "Hand in your work"}
      </h3>

      {submission ? (
        <div className="mt-2 rounded-lg border border-border p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <CheckCircle2 size={16} aria-hidden className="text-success-500" />
            {submission.status === "evaluated" ? "Marked" : "Submitted"}
            <span className="font-normal text-ink-500">
              {formatDate(submission.submittedAt)}
            </span>
          </p>

          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-2xs text-ink-500">
            <Paperclip size={12} aria-hidden />
            <a
              href={submission.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="max-w-full truncate font-semibold text-brand-600 hover:underline"
            >
              {submission.file ? submission.file.name : submission.fileUrl}
            </a>
            <span>· {SUBMISSION_FORMAT_LABEL[submission.format]}</span>
          </p>

          {/* An unmarked hand-in shows no score at all. A zero would read as a
              mark of nothing rather than "not looked at yet". */}
          {submission.status === "evaluated" ? (
            <p className="mt-2 text-sm text-ink-700">
              <span className="font-extrabold tabular-nums text-brand-600">
                {submission.scored}
                <span className="font-semibold text-ink-500">
                  /{submission.maxMarks}
                </span>
              </span>
              {submission.feedback ? ` — ${submission.feedback}` : ""}
            </p>
          ) : (
            <p className="mt-2 text-2xs text-ink-500">
              Waiting to be marked. Handing in is what opens the next course —
              you do not have to wait for the mark.
            </p>
          )}
        </div>
      ) : null}

      {state.ok ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-success-500 bg-success-50 p-3 text-sm font-medium text-success-700">
          <CheckCircle2 size={16} aria-hidden className="mt-0.5 shrink-0" />
          Handed in. You can replace it any time before it is marked.
        </p>
      ) : state.error ? (
        <p role="alert" className="mt-3 rounded-lg border border-danger-500 bg-danger-50 p-3 text-sm font-medium text-danger-700">
          {state.error}
        </p>
      ) : null}

      <form action={action} noValidate className="mt-3 space-y-4">
        <input type="hidden" name="programSlug" value={programSlug} />
        <input type="hidden" name="courseKey" value={courseId} />
        <input type="hidden" name="assignmentKey" value={assignment.id} />

        {canUpload ? (
          <FileUpload
            name="file"
            scope="submissions"
            accept={kinds}
            label={submission ? "Replace your file" : "Your file"}
            required={false}
            hint={`Only ${formatList(assignment.acceptedFormats)} are accepted for this assignment.`}
            error={state.errors.fileUrl}
          />
        ) : null}

        {/* The link is a fallback, not an equal choice — it is the only way to
            hand in a zip, and the only way round the upload size cap. Open by
            default when there is nothing to upload to. */}
        <details open={!canUpload} className="group">
          <summary className="cursor-pointer list-none text-xs font-semibold text-brand-600 hover:underline">
            {canUpload
              ? "Or hand in a link instead"
              : `Paste a link to your ${formatList(linkOnly)}`}
          </summary>

          <div className="mt-3 space-y-4">
            <Field
              id="fileUrl"
              label="Link to your work"
              error={canUpload ? undefined : state.errors.fileUrl}
              required={false}
              hint="Check the sharing setting before you paste it — a link only you can open reads as nothing handed in."
            >
              <TextInput
                id="fileUrl"
                name="fileUrl"
                type="url"
                placeholder="https://drive.google.com/…"
                defaultValue={state.values.fileUrl}
                hasError={Boolean(!canUpload && state.errors.fileUrl)}
              />
            </Field>

            <Field
              id="format"
              label="What is it?"
              error={state.errors.format}
              required={false}
            >
              <Select
                id="format"
                name="format"
                defaultValue={state.values.format}
                hasError={Boolean(state.errors.format)}
              >
                <option value="">Pick a format</option>
                {assignment.acceptedFormats.map((format) => (
                  <option key={format} value={format}>
                    {SUBMISSION_FORMAT_LABEL[format]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </details>

        <Field
          id="note"
          label="Note for your teacher"
          error={state.errors.note}
          required={false}
        >
          <Textarea
            id="note"
            name="note"
            defaultValue={state.values.note}
            className="min-h-20"
            placeholder="Anything they should know before marking it."
            hasError={Boolean(state.errors.note)}
          />
        </Field>

        <Button type="submit" disabled={pending}>
          {pending
            ? "Handing in…"
            : submission
              ? "Replace my hand-in"
              : "Hand in"}
        </Button>

        {submission ? (
          <p className="text-2xs text-ink-500">
            Handing in again replaces what is there and clears any mark — new
            work cannot keep an old mark.
          </p>
        ) : null}
      </form>
    </section>
  );
}
