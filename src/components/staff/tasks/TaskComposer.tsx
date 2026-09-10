"use client";

import {
  Check,
  ClipboardList,
  Link2,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { useConfirmSubmit } from "@/components/ui/ConfirmDialog";
import { Field, Select, Textarea, TextInput } from "@/components/ui/Field";
import { FileUpload } from "@/components/ui/FileUpload";
import { createTask, deleteTask, setTaskComplete } from "@/lib/actions/tasks";
import {
  EMPTY_DELETE_TASK,
  EMPTY_TASK_FORM,
  type TaskFormState,
} from "@/lib/actions/task-state";
import type { TaskAudienceOptions } from "@/lib/data/tasks";
import {
  TASK_SUBMISSION_HINT,
  TASK_SUBMISSION_KINDS,
  TASK_SUBMISSION_LABEL,
  type TaskSubmissionKind,
} from "@/lib/tasks/submission-kinds";
import type { UploadedFile } from "@/lib/uploads/kinds";
import {
  MAX_SUBMISSION_NOTE,
  MAX_TASK_LINKS,
  type TaskLinkInput,
} from "@/lib/validation/task";

/**
 * Setting a task: the one write control on the staff tasks screen.
 *
 * A client island on an otherwise server-rendered page, the same shape as
 * `batches/BatchControls.tsx`. It posts to an action that re-checks the role,
 * the capability, the scope **and** whether the named student is really on the
 * program, so rendering this is not what makes it work.
 *
 * Two things are held in React state rather than left to the DOM, and both for
 * the same reason — they change what the rest of the form means:
 *
 * - **the program**, because the batch and student pickers are built from it;
 *   and
 * - **the audience**, because "one batch" and "one student" are what make those
 *   pickers exist.
 *
 * ## Three widths, and the widest is not always offered
 *
 * A teacher is assigned to batches of a program, not to the program (see
 * models/User.ts), so "everyone on the program" would reach a colleague's
 * students. `mayAddressProgram` comes off the loader already scoped, and when
 * it is false that option is simply absent rather than present-and-refused —
 * the house rule that a control which renders is a control that works. The
 * batch and student pickers are likewise built from what the loader allowed,
 * and `createTask` re-checks all three, because a form is a convenience and an
 * action is the control.
 *
 * The links repeater and the document both post as **JSON in one hidden
 * field**, the `QuestionBuilder` / `FileUpload` pattern: the action parses one
 * field instead of `links[0][url]` name soup, and what is posted matches
 * `TaskLinkInput` exactly, so the same validator runs on both sides.
 */
export function TaskComposer({
  programs,
  onCreated,
}: {
  programs: TaskAudienceOptions;
  /**
   * Told when a task was actually set. The screen closes the form in response,
   * and that unmount **is** the reset: the links, the upload and the picked
   * kinds are state up here that the action cannot clear from the server, and
   * throwing the component away clears all three without a cascade of
   * `setState` calls in an effect. A caller that keeps the composer mounted
   * would keep the last task's attachments, so don't.
   */
  onCreated: () => void;
}) {
  const [state, action, pending] = useActionState<TaskFormState, FormData>(
    createTask,
    EMPTY_TASK_FORM,
  );

  const [programSlug, setProgramSlug] = useState(
    programs.length === 1 ? programs[0].slug : "",
  );
  const [audience, setAudience] = useState<"program" | "batch" | "student">(
    "program",
  );
  const [batch, setBatch] = useState("");
  const [links, setLinks] = useState<TaskLinkInput[]>([]);
  const [document, setDocument] = useState<UploadedFile[]>([]);
  const [submissionKinds, setSubmissionKinds] = useState<TaskSubmissionKind[]>(
    [],
  );

  /**
   * Keyed off `state.ok` rather than done in the submit handler, because what
   * succeeded is the save, not the click — a rejected post must leave the form
   * exactly as it was, with everything the person typed still in it.
   */
  useEffect(() => {
    if (state.ok) onCreated();
  }, [state.ok, onCreated]);

  const program = programs.find((row) => row.slug === programSlug);
  const roster = program?.students ?? [];
  const batches = program?.batches ?? [];

  // A teacher on some of a program's cohorts cannot address all of it. When the
  // program picker lands on such a program the audience has to move off
  // "everyone" — otherwise the form sits on an option that is no longer in its
  // own list and posts something the action refuses.
  const mayAddressProgram = program?.mayAddressProgram ?? true;
  const effectiveAudience =
    audience === "program" && !mayAddressProgram ? "batch" : audience;

  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm md:p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
        <ClipboardList size={15} aria-hidden className="text-ink-400" />
        Set a task
      </h2>

      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="links" value={JSON.stringify(links)} />
        <input
          type="hidden"
          name="submissionKinds"
          value={JSON.stringify(submissionKinds)}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Field
            id="task-program"
            label="Program"
            required
            error={state.errors.programSlug}
          >
            <Select
              id="task-program"
              name="programSlug"
              value={programSlug}
              onChange={(event) => {
                setProgramSlug(event.target.value);
                // The old cohort belongs to the old program.
                setBatch("");
              }}
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
            id="task-audience"
            label="Who it's for"
            required
            error={state.errors.audience}
            hint={
              effectiveAudience === "program"
                ? "Everyone enrolled on the program, including anyone who joins later."
                : effectiveAudience === "batch"
                  ? "Everyone in that batch, including anyone who joins it later."
                  : undefined
            }
          >
            <Select
              id="task-audience"
              name="audience"
              value={effectiveAudience}
              onChange={(event) => {
                const picked = event.target.value;
                setAudience(
                  picked === "student"
                    ? "student"
                    : picked === "batch"
                      ? "batch"
                      : "program",
                );
              }}
            >
              {mayAddressProgram ? (
                <option value="program">Everyone on the program</option>
              ) : null}
              <option value="batch">One batch</option>
              <option value="student">One student</option>
            </Select>
          </Field>
        </div>

        {effectiveAudience === "batch" ? (
          <Field
            id="task-batch"
            label="Batch"
            required
            error={state.errors.batch}
            hint={
              programSlug && batches.length === 0
                ? "You don't take any batch on this program yet."
                : "Only students in this batch will see the task."
            }
          >
            <Select
              id="task-batch"
              name="batch"
              value={batch}
              disabled={batches.length === 0}
              hasError={!!state.errors.batch}
              onChange={(event) => setBatch(event.target.value)}
            >
              <option value="">
                {programSlug ? "Pick a batch" : "Pick a program first"}
              </option>
              {batches.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {effectiveAudience === "student" ? (
          <Field
            id="task-student"
            label="Student"
            required
            error={state.errors.studentId}
            hint={
              programSlug && roster.length === 0
                ? "Nobody you teach is enrolled on this program yet."
                : "Only this student will see the task."
            }
          >
            <Select
              id="task-student"
              name="studentId"
              defaultValue=""
              disabled={roster.length === 0}
              hasError={!!state.errors.studentId}
            >
              <option value="">
                {programSlug ? "Pick a student" : "Pick a program first"}
              </option>
              {roster.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} · {student.email}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field
          id="task-title"
          label="Title"
          required
          error={state.errors.title}
        >
          <TextInput
            id="task-title"
            name="title"
            placeholder="Set up your Meta Business Suite account"
            defaultValue={state.values.title}
            maxLength={140}
            hasError={!!state.errors.title}
          />
        </Field>

        <Field
          id="task-description"
          label="Description"
          required={document.length === 0}
          error={state.errors.description}
          hint="What to do, and by when. Plain text — line breaks are kept."
        >
          <Textarea
            id="task-description"
            name="description"
            rows={5}
            placeholder="Walk through the account setup we covered in Module 2, then send a screenshot of your dashboard."
            defaultValue={state.values.description}
            hasError={!!state.errors.description}
          />
        </Field>

        <FileUpload
          name="document"
          scope="tasks"
          accept={["pdf", "document", "image"]}
          label="Document"
          hint="A brief, a rubric, a worked example — handed out with the task."
          onChange={setDocument}
        />

        <LinkRepeater
          links={links}
          onChange={setLinks}
          error={state.errors.links}
        />

        <SubmissionPicker
          kinds={submissionKinds}
          onChange={setSubmissionKinds}
          defaultNote={state.values.submissionNote}
          kindsError={state.errors.submissionKinds}
          noteError={state.errors.submissionNote}
        />

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button type="submit" disabled={pending}>
            <Plus size={16} aria-hidden />
            {pending ? "Setting…" : "Set task"}
          </Button>
          {state.ok && state.message ? (
            <span
              role="status"
              className="text-xs font-medium text-success-700"
            >
              {state.message}
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}

/**
 * What comes back, and what to say about it.
 *
 * Checkboxes rather than a dropdown because the answer is genuinely a set: a
 * task can want the report *and* a link to the live page, and "pick one" would
 * make the second thing arrive as an afterthought in the note field.
 *
 * **Nothing ticked is the default and a real answer** — most tasks ask for
 * nothing back — so there is no "no submission" option to choose. The note only
 * appears once something is ticked, for the same reason the action drops it:
 * it renders directly above the student's hand-in field, so with no field there
 * is nowhere for it to go, and a box you can type into that silently discards
 * what you typed is worse than no box.
 */
function SubmissionPicker({
  kinds,
  onChange,
  defaultNote,
  kindsError,
  noteError,
}: {
  kinds: TaskSubmissionKind[];
  onChange: (kinds: TaskSubmissionKind[]) => void;
  defaultNote: string;
  kindsError?: string;
  noteError?: string;
}) {
  function toggle(kind: TaskSubmissionKind, on: boolean) {
    // Rebuilt from the canonical order rather than appended, so the stored list
    // reads the same way however the boxes were clicked.
    onChange(
      TASK_SUBMISSION_KINDS.filter((item) =>
        item === kind ? on : kinds.includes(item),
      ),
    );
  }

  return (
    <div className="rounded-lg border border-border bg-ink-50/50 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-ink-700">
        <Upload size={14} aria-hidden className="text-ink-400" />
        What students hand in
        <span className="text-xs font-normal text-ink-400">(optional)</span>
      </p>
      <p className="mt-0.5 text-xs text-ink-500">
        Leave these empty for a task with nothing to submit — a brief to read,
        an account to set up.
      </p>

      <ul className="mt-3 space-y-2">
        {TASK_SUBMISSION_KINDS.map((kind) => (
          <li key={kind}>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={kinds.includes(kind)}
                onChange={(event) => toggle(kind, event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border-strong text-brand-600 focus:ring-brand-600"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink-800">
                  {TASK_SUBMISSION_LABEL[kind]}
                </span>
                <span className="block text-xs text-ink-500">
                  {TASK_SUBMISSION_HINT[kind]}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {kindsError ? (
        <p className="mt-2 text-xs font-medium text-danger-700">{kindsError}</p>
      ) : null}

      {kinds.length > 0 ? (
        <div className="mt-4 border-t border-border pt-4">
          <Field
            id="task-submission-note"
            label="Note above their submission box"
            required={false}
            error={noteError}
            hint="Shown to the student right where they hand in — “name the file with your student number”, “include the ad account ID”."
          >
            <Textarea
              id="task-submission-note"
              name="submissionNote"
              rows={2}
              maxLength={MAX_SUBMISSION_NOTE}
              defaultValue={defaultNote}
              placeholder="Anything they need to know as they upload."
              hasError={!!noteError}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The resource links.
 *
 * A label per URL, required rather than optional: a bare link on a student's
 * screen is a thing they have to click to find out what it is, and half of them
 * won't. Rows are added one at a time and blank ones are dropped on save, so an
 * abandoned row costs nothing.
 */
function LinkRepeater({
  links,
  onChange,
  error,
}: {
  links: TaskLinkInput[];
  onChange: (links: TaskLinkInput[]) => void;
  error?: string;
}) {
  function update(index: number, patch: Partial<TaskLinkInput>) {
    onChange(
      links.map((link, i) => (i === index ? { ...link, ...patch } : link)),
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink-700">
        Resource links
        <span className="ml-1.5 text-xs font-normal text-ink-400">
          (optional)
        </span>
      </p>

      {links.length > 0 ? (
        <ul className="space-y-2">
          {links.map((link, index) => (
            <li
              key={index}
              className="flex flex-wrap items-start gap-2 sm:flex-nowrap"
            >
              <TextInput
                aria-label={`Link ${index + 1} label`}
                placeholder="Meta Blueprint course"
                value={link.label}
                maxLength={120}
                onChange={(event) =>
                  update(index, { label: event.target.value })
                }
                className="sm:w-56"
              />
              <TextInput
                aria-label={`Link ${index + 1} URL`}
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={link.url}
                onChange={(event) => update(index, { url: event.target.value })}
                leadingIcon={<Link2 size={15} />}
                className="min-w-0 flex-1"
              />
              <button
                type="button"
                onClick={() => onChange(links.filter((_, i) => i !== index))}
                aria-label={`Remove link ${index + 1}`}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-danger-700 md:h-10 md:w-10"
              >
                <X size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {links.length < MAX_TASK_LINKS ? (
        <button
          type="button"
          onClick={() => onChange([...links, { label: "", url: "" }])}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
        >
          <Plus size={14} aria-hidden />
          {links.length === 0 ? "Add a link" : "Add another link"}
        </button>
      ) : (
        <p className="mt-2 text-xs text-ink-500">
          {MAX_TASK_LINKS} links is the maximum.
        </p>
      )}

      {error ? (
        <p className="mt-1.5 text-xs font-medium text-danger-700">{error}</p>
      ) : null}
    </div>
  );
}

/**
 * Delete one task, behind the same `window.confirm` the curriculum's delete
 * buttons use — one confirm pattern in the staff panel, not two.
 *
 * Its own tiny island so the screen around it stays a server component. Deleted
 * rather than archived: nothing points at a task and nothing is derived from
 * one, so there is no history to keep. The action re-checks the scope, so the
 * button rendering is not what makes it work.
 *
 * `redirectTo` is for the detail screen, whose whole subject has just stopped
 * existing — staying put would leave a 404 behind on the next revalidation.
 * The list passes nothing and simply loses the row.
 */
export function DeleteTaskButton({
  id,
  title,
  redirectTo,
}: {
  id: string;
  title: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    deleteTask,
    EMPTY_DELETE_TASK,
  );

  useEffect(() => {
    if (state.ok && redirectTo) router.push(redirectTo);
  }, [state.ok, redirectTo, router]);

  const { onSubmit, dialog } = useConfirmSubmit({
    title: `Delete the task “${title}”?`,
    message:
      "Students stop seeing it, and the attached document and every hand-in are deleted too. This cannot be undone.",
    confirmLabel: "Delete task",
  });

  return (
    <form
      action={action}
      onSubmit={onSubmit}
      className="flex items-center gap-3"
    >
      {dialog}
      <input type="hidden" name="id" value={id} />

      {state.error ? (
        <span role="alert" className="text-xs font-medium text-danger-700">
          {state.error}
        </span>
      ) : null}

      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        <Trash2 size={14} aria-hidden />
        {pending ? "Deleting\u2026" : "Delete"}
      </Button>
    </form>
  );
}

/**
 * Close a task, or reopen it — one button posting the state it wants.
 *
 * No confirm on either direction, unlike delete: completing is reversible by
 * the same control that did it, and a dialog in front of a reversible thing is
 * a dialog people learn to dismiss without reading.
 */
export function CompleteTaskButton({
  id,
  completed,
}: {
  id: string;
  completed: boolean;
}) {
  const [state, action, pending] = useActionState(
    setTaskComplete,
    EMPTY_DELETE_TASK,
  );

  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <input
        type="hidden"
        name="complete"
        value={completed ? "false" : "true"}
      />

      {state.error ? (
        <span role="alert" className="text-xs font-medium text-danger-700">
          {state.error}
        </span>
      ) : null}

      <Button
        type="submit"
        variant={completed ? "secondary" : "primary"}
        size="sm"
        disabled={pending}
      >
        {completed ? (
          <RotateCcw size={14} aria-hidden />
        ) : (
          <Check size={14} aria-hidden />
        )}
        {pending
          ? completed
            ? "Reopening\u2026"
            : "Completing\u2026"
          : completed
            ? "Reopen"
            : "Mark complete"}
      </Button>
    </form>
  );
}
