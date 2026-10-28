"use client";

import {
  CheckCircle2,
  Lock,
  MessageSquareText,
  MoreVertical,
  Paperclip,
  RotateCcw,
} from "lucide-react";
import {
  startTransition,
  useActionState,
  useId,
  useRef,
  useState,
} from "react";

import { AttachmentLink } from "@/components/ui/AttachmentLink";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
import {
  canHandIn,
  submissionStatusLabel,
} from "@/lib/curriculum/submission-status";
import type { AssignmentView, SubmissionView } from "@/lib/curriculum/types";

import { SubmissionHistory } from "./SubmissionHistory";

/**
 * The controls on an assignment row: **Submit**, and a ⋮ for the brief.
 *
 * ## Why handing in is a button now
 *
 * It used to be that the *only* way to hand work in was to open the row's ⋮ —
 * an icon with no label, next to a status badge, on a row whose siblings are
 * modules you click to watch. Handing in is the entire point of an assignment
 * and it was the one thing on the row nobody could see. So it is a button with
 * the word on it, and the ⋮ keeps only what an overflow menu is for: the brief
 * document, when a teacher has attached one. No brief file, no ⋮ — a menu whose
 * single item is absent should not be a menu.
 *
 * There is still no assignment *screen*, and the curriculum page is where a
 * student meets the assignment, so reading the brief and attaching a file
 * happens here rather than through a navigation away and back. When
 * `/dashboard/[slug]/assignments/[key]` is built, this content moves there
 * whole and the button becomes a link.
 *
 * ## What the dialog leads with
 *
 * Whatever the student most needs to know *now*, above the brief:
 *
 * - graded → the score, large, then the teacher's feedback;
 * - sent back → the request and the teacher's reason, then the form;
 * - handed in → that it was received and is locked;
 * - nothing yet → the brief, then the form.
 *
 * ## Handing in is final
 *
 * The form exists only while `canHandIn` — nothing handed in, or a teacher has
 * asked for another go. Pressing Submit opens a confirmation first; the action
 * runs only from its Confirm. The action enforces the same lock on its own, so
 * this is the courtesy and not the rule. See `actions/submissions.ts`.
 *
 * ## Why the ⋮ opens a dialog rather than a popover
 *
 * The phone's course card clips its row list (`overflow-hidden`, so the divided
 * rows keep the card's rounded corners), and an absolutely-positioned menu
 * inside a row is a menu with its bottom sliced off. `Modal` is already a
 * bottom sheet below `md` — which is the right shape for a row's overflow menu
 * on a phone anyway — and it brings the focus trap and Escape with it.
 *
 * Both dialogs and both triggers live in one island, so the curriculum page
 * stays a server component and only this ships JavaScript.
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
export function AssignmentActions({
  programSlug,
  courseId,
  assignment,
}: {
  programSlug: string;
  courseId: string;
  assignment: AssignmentView;
}) {
  const [open, setOpen] = useState<"none" | "submit" | "brief">("none");
  const submitTitleId = useId();
  const briefTitleId = useId();

  const brief = assignment.brief.trim();
  const briefFile = assignment.briefFile;
  const submission = assignment.submission;
  const mayHandIn = canHandIn(submission);

  /**
   * What the button says, which is always what pressing it does next. Blue
   * (primary) exactly when there is something for the student to do.
   */
  const label = !submission
    ? "Submit"
    : submission.status === "resubmission_requested"
      ? "Resubmit"
      : submission.status === "evaluated"
        ? "View result"
        : "View";

  return (
    <>
      {/* Its own group, tighter than the row's `gap-3`: the ⋮ is this button's
          overflow, not a third peer beside the score and the badge. */}
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant={mayHandIn ? "primary" : "secondary"}
          onClick={() => setOpen("submit")}
          aria-haspopup="dialog"
        >
          {label}
          <span className="sr-only"> {assignment.title}</span>
        </Button>

        {/* Only when there is something in it. */}
        {briefFile ? (
          <button
            type="button"
            onClick={() => setOpen("brief")}
            aria-label={`The brief for ${assignment.title}`}
            aria-haspopup="dialog"
            className="rounded-md p-1.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <MoreVertical size={18} aria-hidden />
          </button>
        ) : null}
      </div>

      <Modal
        isOpen={open === "submit"}
        onClose={() => setOpen("none")}
        labelledBy={submitTitleId}
      >
        <div className="space-y-5 p-5 md:p-6">
          <header>
            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
              Assignment
            </p>
            <h2
              id={submitTitleId}
              className="mt-1 text-lg font-extrabold text-ink-900"
            >
              {assignment.title}
            </h2>
            <p className="mt-1 text-sm text-ink-600">
              Out of {assignment.maxMarks}
              {assignment.dueDate ? ` · due ${formatDate(assignment.dueDate)}` : ""}
              {" · accepts "}
              {formatList(assignment.acceptedFormats) || "nothing yet"}
            </p>
          </header>

          {/* The thing that matters now, first. */}
          {submission?.status === "evaluated" ? (
            <GradedResult submission={submission} />
          ) : submission?.status === "resubmission_requested" ? (
            <ResubmissionRequested submission={submission} />
          ) : submission ? (
            <SubmittedNotice submission={submission} />
          ) : null}

          {/* Still offered here as well as behind the ⋮: a student reading the
              brief in order to hand in should not have to close this and find
              another control to get the document it refers to. */}
          {briefFile ? (
            <AttachmentLink file={briefFile} caption="The brief document" />
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

          {!brief && !briefFile ? (
            <p className="rounded-lg border border-dashed border-border-strong p-3 text-sm text-ink-500">
              Your teacher hasn&apos;t added a brief yet. Ask them what this
              assignment needs before you hand anything in.
            </p>
          ) : null}

          {/* The locked hand-in itself, for looking at. While a resubmission is
              open the same file is "the version that was sent back", which the
              history below already shows. */}
          {submission && submission.status !== "resubmission_requested" ? (
            <HandInSummary submission={submission} />
          ) : null}

          {mayHandIn ? (
            <SubmitForm
              // A fresh form per version: nothing typed against version 1
              // should still be sitting there when version 2 is due.
              key={submission?.version ?? 0}
              programSlug={programSlug}
              courseId={courseId}
              assignment={assignment}
            />
          ) : null}

          {submission ? <SubmissionHistory history={submission.history} /> : null}

          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setOpen("none")}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* The ⋮, and nothing else in it. */}
      {briefFile ? (
        <Modal
          isOpen={open === "brief"}
          onClose={() => setOpen("none")}
          labelledBy={briefTitleId}
        >
          <div className="space-y-4 p-5 md:p-6">
            <h2
              id={briefTitleId}
              className="text-lg font-extrabold text-ink-900"
            >
              {assignment.title}
            </h2>

            <AttachmentLink file={briefFile} caption="The brief document" />

            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setOpen("none")}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/* ------------------------------ the states ------------------------------- */

/**
 * The status, as a pill with an icon and a word — never colour alone.
 */
function StatusPill({
  tone,
  icon: Icon,
  children,
}: {
  tone: "success" | "warning" | "brand";
  icon: typeof CheckCircle2;
  children: React.ReactNode;
}) {
  const tones = {
    success: "bg-success-50 text-success-700",
    warning: "bg-warning-50 text-warning-700",
    brand: "bg-brand-50 text-brand-700",
  };

  return (
    <span
      className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-2xs font-semibold ${tones[tone]}`}
    >
      <Icon size={12} aria-hidden />
      {children}
    </span>
  );
}

/**
 * Graded: the score is the headline, the feedback is the story.
 *
 * The score is the largest thing in the dialog on purpose — a student opening a
 * marked assignment is asking one question, and should have the answer before
 * they have read a word. A percentage beside it, because "34 / 40" and
 * "85 / 100" are the same result and only one of them reads that way at a
 * glance.
 */
function GradedResult({ submission }: { submission: SubmissionView }) {
  const scored = submission.scored ?? 0;
  const percent =
    submission.maxMarks > 0 ? Math.round((scored / submission.maxMarks) * 100) : null;
  const feedback = submission.feedback.trim();
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="rounded-xl border border-border bg-surface-muted p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3
            id={headingId}
            className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500"
          >
            Assignment result
          </h3>
          <StatusPill tone="success" icon={CheckCircle2}>
            {submissionStatusLabel(submission)}
          </StatusPill>
        </div>

        <p className="mt-3 flex flex-wrap items-baseline gap-x-2 tabular-nums">
          <span className="text-5xl font-extrabold leading-none text-brand-600">
            {scored}
          </span>
          <span className="text-xl font-bold text-ink-500">
            / {submission.maxMarks}
          </span>
          {percent !== null ? (
            <span className="ml-1 text-sm font-semibold text-ink-600">
              {percent}%
            </span>
          ) : null}
        </p>
        <p className="mt-1.5 text-sm font-semibold text-ink-700">Your score</p>

        {submission.evaluatedAt ? (
          <p className="mt-1 text-2xs text-ink-500">
            Graded {formatDate(submission.evaluatedAt)}
            {submission.version > 1 ? ` · version ${submission.version}` : ""}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-border p-4 md:p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900">
          <MessageSquareText size={16} aria-hidden className="text-brand-600" />
          Teacher feedback
        </h3>
        {feedback ? (
          // `pre-line` keeps the teacher's line breaks and lists, without
          // rendering anything they typed as markup.
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-800">
            {feedback}
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-500">No feedback provided.</p>
        )}
      </div>
    </section>
  );
}

/**
 * Sent back: impossible to miss, and it says what to do about it.
 *
 * The teacher's reason is the most useful sentence on the screen, so it is set
 * apart as a quote rather than run into the explanation. When the version sent
 * back had been graded, that mark and feedback are shown too — "why" is often
 * in the feedback rather than the reason.
 */
function ResubmissionRequested({ submission }: { submission: SubmissionView }) {
  const request = submission.resubmission;
  const previous = submission.history[submission.history.length - 1] ?? null;
  const reason = request?.reason.trim() ?? "";

  return (
    <section
      role="status"
      className="rounded-xl border border-warning-500 bg-warning-50 p-4 md:p-5"
    >
      <div className="flex items-start gap-3">
        <RotateCcw
          size={20}
          aria-hidden
          className="mt-0.5 shrink-0 text-warning-700"
        />
        <div className="min-w-0 space-y-2">
          <h3 className="text-base font-bold text-ink-900">
            Resubmission requested
          </h3>
          <p className="text-sm text-ink-700">
            Your teacher has requested a new submission. Please review the
            feedback and instructions, then upload your revised assignment
            below.
          </p>

          {reason ? (
            <blockquote className="whitespace-pre-line border-l-4 border-warning-500 bg-surface py-2 pr-3 pl-3 text-sm leading-relaxed text-ink-900">
              {reason}
            </blockquote>
          ) : null}

          {previous && previous.scored !== null ? (
            <p className="text-2xs text-ink-600">
              Version {previous.version} was graded{" "}
              <span className="font-bold tabular-nums text-ink-900">
                {previous.scored} / {previous.maxMarks}
              </span>
              . Your new submission will be graded again.
            </p>
          ) : null}

          {previous?.feedback ? (
            <p className="whitespace-pre-line text-sm text-ink-700">
              <span className="font-semibold text-ink-900">Feedback: </span>
              {previous.feedback}
            </p>
          ) : null}

          {request ? (
            <p className="text-2xs text-ink-500">
              Requested {formatDate(request.requestedAt)}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Handed in, not yet graded: received, and locked. */
function SubmittedNotice({ submission }: { submission: SubmissionView }) {
  const again = submission.version > 1;

  return (
    <section className="rounded-xl border border-brand-100 bg-brand-50 p-4 md:p-5">
      <div className="flex items-start gap-3">
        <Lock size={20} aria-hidden className="mt-0.5 shrink-0 text-brand-700" />
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-ink-900">
              {again ? "Assignment resubmitted" : "Assignment submitted"}
            </h3>
            <StatusPill tone="brand" icon={CheckCircle2}>
              {submissionStatusLabel(submission)} · awaiting review
            </StatusPill>
          </div>
          <p className="text-sm text-ink-700">
            Your submission has been received and is now locked. You cannot
            replace it unless your teacher requests a resubmission.
          </p>
          <p className="text-2xs text-ink-500">
            Handing in is what opens the next course — you do not have to wait
            for the grade.
          </p>
        </div>
      </div>
    </section>
  );
}

/** The file and note that were handed in — the current version. */
function HandInSummary({ submission }: { submission: SubmissionView }) {
  return (
    <section>
      <h3 className="text-sm font-bold text-ink-900">
        Your submission
        {submission.version > 1 ? (
          <span className="font-normal text-ink-500">
            {" "}
            · version {submission.version}
          </span>
        ) : null}
      </h3>

      <div className="mt-2 rounded-lg border border-border p-3">
        <a
          href={submission.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
        >
          <Paperclip size={14} aria-hidden className="shrink-0" />
          <span className="truncate">
            {submission.file ? submission.file.name : submission.fileUrl}
          </span>
        </a>
        <p className="mt-1 text-2xs text-ink-500">
          {SUBMISSION_FORMAT_LABEL[submission.format]} · submitted{" "}
          {formatDate(submission.submittedAt)}
        </p>
        {submission.note ? (
          <p className="mt-2 whitespace-pre-line text-2xs text-ink-700">
            <span className="font-semibold text-ink-500">Your note: </span>
            {submission.note}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/* -------------------------------- the form ------------------------------- */

const CONNECTION_FAILED =
  "We couldn't confirm your submission. Check your connection, then close and reopen this assignment to see whether it was received before trying again.";

/** Has the student given us anything to hand in? Only then is there anything to confirm. */
function hasWork(data: FormData): boolean {
  const file = data.get("file");
  const link = data.get("fileUrl");
  const uploaded = typeof file === "string" && file !== "" && file !== "[]";
  return uploaded || (typeof link === "string" && link.trim() !== "");
}

function SubmitForm({
  programSlug,
  courseId,
  assignment,
}: {
  programSlug: string;
  courseId: string;
  assignment: AssignmentView;
}) {
  /**
   * Set on Confirm, cleared when the action settles. A ref rather than state,
   * because two clicks in the same frame both see the same state — and the
   * second dispatch would queue behind the first and replace its success with
   * the server's "already submitted".
   */
  const inFlight = useRef(false);

  const [state, dispatch, pending] = useActionState<SubmissionFormState, FormData>(
    async (previous, data) => {
      try {
        return await submitAssignment(previous, data);
      } catch {
        // A network failure or a server error must reach the form as a
        // sentence, not tear the dialog down through an error boundary.
        return { ...previous, ok: false, error: CONNECTION_FAILED };
      } finally {
        inFlight.current = false;
      }
    },
    EMPTY_SUBMISSION_STATE,
  );

  /** What will be posted, held while the confirmation is open. */
  const [confirming, setConfirming] = useState<FormData | null>(null);

  // The confirmation closes when the action answers, success or not. Adjusted
  // during render (not in an effect) so it never paints one frame late.
  const [answered, setAnswered] = useState(state);
  if (state !== answered) {
    setAnswered(state);
    setConfirming(null);
  }

  const submission = assignment.submission;
  const revising = submission?.status === "resubmission_requested";
  const kinds = uploadableKinds(assignment.acceptedFormats);
  const linkOnly = linkOnlyFormats(assignment.acceptedFormats);
  const canUpload = kinds.length > 0;

  function send(data: FormData) {
    if (inFlight.current) return;
    inFlight.current = true;
    startTransition(() => dispatch(data));
  }

  /**
   * Submit never hands in by itself. With work attached it opens the
   * confirmation; with nothing attached it goes straight to the server, which
   * writes nothing and hands back the field errors — asking "are you sure?"
   * about an empty form would be a question with no right answer.
   */
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || inFlight.current) return;

    const data = new FormData(event.currentTarget);
    if (hasWork(data)) setConfirming(data);
    else send(data);
  }

  return (
    <section className="border-t border-border pt-5">
      <h3 className="text-sm font-bold text-ink-900">
        {revising ? "Upload your revised assignment" : "Hand in your work"}
      </h3>
      <p className="mt-1 text-2xs text-ink-500">
        You can submit once. After that your submission is locked unless your
        teacher asks for a resubmission.
      </p>

      {/* Normally never seen: a successful hand-in refreshes the tree, the
          submission exists, and this form is replaced by the locked notice.
          Kept for the moment in between. */}
      {state.ok ? (
        <p
          role="status"
          className="mt-3 flex items-start gap-2 rounded-lg border border-success-500 bg-success-50 p-3 text-sm font-medium text-success-700"
        >
          <CheckCircle2 size={16} aria-hidden className="mt-0.5 shrink-0" />
          Submitted. Your submission is now locked.
        </p>
      ) : state.error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-danger-500 bg-danger-50 p-3 text-sm font-medium text-danger-700"
        >
          {state.error}
        </p>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="mt-3 space-y-4">
        <input type="hidden" name="programSlug" value={programSlug} />
        <input type="hidden" name="courseKey" value={courseId} />
        <input type="hidden" name="assignmentKey" value={assignment.id} />

        {canUpload ? (
          <FileUpload
            name="file"
            scope="submissions"
            accept={kinds}
            label={revising ? "Your revised file" : "Your file"}
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
            placeholder="Anything they should know before grading it."
            hasError={Boolean(state.errors.note)}
          />
        </Field>

        <Button type="submit" disabled={pending}>
          {pending
            ? "Submitting…"
            : revising
              ? "Submit revised assignment"
              : "Submit assignment"}
        </Button>
      </form>

      <ConfirmDialog
        isOpen={confirming !== null}
        pending={pending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) send(confirming);
        }}
        tone="neutral"
        title="Are you sure you want to submit?"
        message="Once submitted, you will not be able to replace or edit your submission unless your teacher requests a resubmission."
        details={
          <div>
            <p className="text-sm font-semibold text-ink-900">
              Please make sure you have:
            </p>
            <ul className="mt-1.5 space-y-1 text-sm text-ink-700">
              {[
                "Uploaded the correct file",
                "Completed all required questions",
                "Checked your answers",
                "Reviewed the final submission",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2
                    size={16}
                    aria-hidden
                    className="mt-0.5 shrink-0 text-brand-600"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        }
        cancelLabel="Cancel"
        confirmLabel="Confirm & Submit"
        pendingLabel="Submitting…"
      />
    </section>
  );
}
