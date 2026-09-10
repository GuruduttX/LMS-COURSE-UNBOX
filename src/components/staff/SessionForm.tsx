"use client";

import { AlertTriangle, CheckCircle2, Video } from "lucide-react";
import { useActionState, useState } from "react";

import {
  EMPTY_SESSION_FORM,
  type SessionFormState,
} from "@/app/manager/sessions/state";
import { Field, Select, TextInput, Textarea } from "@/components/ui/Field";
import {
  FieldRow,
  FormActions,
  FormLayout,
  FormSection,
  SidebarCard,
} from "@/components/ui/FormLayout";
import { SESSION_KINDS, SESSION_KIND_SINGULAR } from "@/lib/data/session-kinds";
import type { SessionInput } from "@/lib/validation/session";

import type { TeacherOption } from "@/lib/data/manager-sessions";

export type { TeacherOption };

/**
 * Schedule or edit a live session.
 *
 * The teacher dropdown is filtered by the chosen **program and batch**, in the
 * browser, from a list the server already scoped — a manager should not be
 * offered the Tuesday teacher for a Thursday class — and the action re-checks
 * the triple anyway before saving it.
 *
 * ## A session belongs to a cohort
 *
 * A program runs several batches and they do not share a timetable, so "which
 * batch" sits beside "which program". **Leaving it on "Every batch" is a real
 * choice, not a skipped field**: the induction and the placement talk are for
 * everybody, and that session then appears on every cohort's screen and takes
 * the whole program's register. Anything else is one cohort's class, seen and
 * marked by that cohort alone.
 *
 * Date and time are two native inputs rather than one datetime-local: staff
 * think "Tuesday, 8pm", the two controls are far better on a phone, and the
 * pair converts to one UTC instant in `toUtcInstant`.
 *
 * ## The joining link is one of two things, never both
 *
 * Either we generate a Google Meet (and then the URL is Google's, shown
 * read-only) or the manager pastes their own. The checkbox swaps between them
 * rather than offering both at once, because a form with a generated link *and*
 * an editable field invites someone to overtype a URL students already hold.
 * Once a session carries a generated link there is no checkbox at all — the
 * link exists, and un-generating it is a cancellation, not an edit.
 */
export function SessionForm({
  mode,
  action,
  programs,
  batchesByProgram,
  teachers,
  initial,
  submitLabel,
  googleConfigured,
  generatedLink,
  cancelHref = "/manager/sessions",
}: {
  mode: "create" | "edit";
  action: (
    state: SessionFormState,
    formData: FormData,
  ) => Promise<SessionFormState>;
  programs: { slug: string; title: string }[];
  /** The cohorts each program has, for the batch picker. */
  batchesByProgram: { slug: string; batches: string[] }[];
  teachers: TeacherOption[];
  initial?: SessionInput & { id: string };
  submitLabel?: string;
  /** False when `.env.local` has no Google credentials — links will be mocks. */
  googleConfigured: boolean;
  /** Set when this session already has a link we minted. */
  generatedLink?: { url: string; isMock: boolean } | null;
  /** Where Cancel goes. The sessions list, unless a caller says otherwise. */
  cancelHref?: string;
}) {
  const [state, formAction, isPending] = useActionState<
    SessionFormState,
    FormData
  >(action, {
    ...EMPTY_SESSION_FORM,
    values: initial ?? {
      ...EMPTY_SESSION_FORM.values,
      programSlug: programs.length === 1 ? programs[0].slug : "",
    },
  });

  const [programSlug, setProgramSlug] = useState(state.values.programSlug);
  const [batch, setBatch] = useState(state.values.batch);
  // Default on when scheduling something new — generating the Meet is the point
  // of the integration, and pasting a link is now the exception.
  const [generateMeet, setGenerateMeet] = useState(mode === "create");
  const values = state.values;

  const batches =
    batchesByProgram.find((row) => row.slug === programSlug)?.batches ?? [];

  // Eligible = teaches this program, and takes this cohort. An assignment with
  // no batches means every cohort (models/User.ts), and a program-wide session
  // is open to every teacher on the program — both read as "no narrowing".
  const eligible = teachers.filter((teacher) => {
    const assignment = teacher.programs.find((row) => row.slug === programSlug);
    if (!assignment) return false;
    if (!batch || assignment.batches.length === 0) return true;
    return assignment.batches.includes(batch);
  });

  return (
    <FormLayout
      action={formAction}
      aside={
        <>
          <SidebarCard title="Before you save">
            <ul className="space-y-2 text-sm leading-relaxed text-ink-600">
              <li>Students on the program see it the moment you save.</li>
              <li>
                The teacher is invited to the calendar event, so assign them
                first if you can.
              </li>
              <li>Times are IST, and shown to everyone in IST.</li>
            </ul>
          </SidebarCard>
          <FormActions
            pending={isPending}
            cancelHref={cancelHref}
            submitLabel={
              submitLabel ??
              (mode === "create" ? "Schedule session" : "Save changes")
            }
            note="A session is never deleted — cancelling keeps it visible, marked as cancelled."
          />
        </>
      }
    >
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      {state.ok ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-success-500/30 bg-success-50 p-3 text-sm font-medium text-success-700"
        >
          <CheckCircle2 size={16} aria-hidden />
          Saved.
        </p>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger-500/30 bg-danger-50 p-3 text-sm font-medium text-danger-700"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <FormSection
        title="What it is"
        description="What students see on their sessions screen before they decide to turn up."
      >
        <Field id="title" label="Title" error={state.errors.title} required>
          <TextInput
            id="title"
            name="title"
            defaultValue={values.title}
            placeholder="Campaign structure clinic"
            hasError={Boolean(state.errors.title)}
          />
        </Field>

        <Field
          id="description"
          label="Description"
          error={state.errors.description}
          hint="One or two lines. Students read this before deciding to turn up."
        >
          <Textarea
            id="description"
            name="description"
            defaultValue={values.description}
            hasError={Boolean(state.errors.description)}
          />
        </Field>
      </FormSection>

      <FormSection
        title="When and who"
        description="All times are IST. The teacher list narrows to the chosen program."
      >
        <FieldRow>
          <Field
            id="programSlug"
            label="Program"
            error={state.errors.programSlug}
            required
          >
            <Select
              id="programSlug"
              name="programSlug"
              value={programSlug}
              hasError={Boolean(state.errors.programSlug)}
              onChange={(event) => {
                setProgramSlug(event.target.value);
                // The old cohort belongs to the old program. Keeping it would
                // post a batch name this program has never heard of, which the
                // action refuses — better to clear it than to explain it.
                setBatch("");
              }}
            >
              <option value="">Choose a program</option>
              {programs.map((program) => (
                <option key={program.slug} value={program.slug}>
                  {program.title}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            id="batch"
            label="Batch"
            error={state.errors.batch}
            hint={
              programSlug && batches.length === 0
                ? "This program has no batches yet, so it can only be scheduled program-wide."
                : "Every batch means everyone on the program — an induction, a placement talk."
            }
          >
            <Select
              id="batch"
              name="batch"
              value={batch}
              hasError={Boolean(state.errors.batch)}
              disabled={!programSlug || batches.length === 0}
              onChange={(event) => setBatch(event.target.value)}
            >
              <option value="">Every batch</option>
              {batches.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            id="kind"
            label="Session type"
            error={state.errors.kind}
            required
          >
            <Select
              id="kind"
              name="kind"
              defaultValue={values.kind}
              hasError={Boolean(state.errors.kind)}
            >
              {SESSION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {SESSION_KIND_SINGULAR[kind]}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="date" label="Date" error={state.errors.date} required>
            <TextInput
              id="date"
              name="date"
              type="date"
              defaultValue={values.date}
              hasError={Boolean(state.errors.date)}
            />
          </Field>

          <Field
            id="time"
            label="Start time (IST)"
            error={state.errors.time}
            required
          >
            <TextInput
              id="time"
              name="time"
              type="time"
              defaultValue={values.time}
              hasError={Boolean(state.errors.time)}
            />
          </Field>

          <Field
            id="durationMinutes"
            label="Duration (minutes)"
            error={state.errors.durationMinutes}
            required
          >
            <TextInput
              id="durationMinutes"
              name="durationMinutes"
              type="number"
              min={5}
              max={600}
              defaultValue={values.durationMinutes}
              hasError={Boolean(state.errors.durationMinutes)}
            />
          </Field>

          <Field
            id="teacherId"
            label="Teacher"
            error={state.errors.teacherId}
            hint={
              programSlug && eligible.length === 0
                ? batch
                  ? `No teacher is assigned to ${batch} yet.`
                  : "No teacher is assigned to this program yet."
                : "Who takes this session."
            }
          >
            <Select
              id="teacherId"
              name="teacherId"
              defaultValue={values.teacherId}
              disabled={!programSlug || eligible.length === 0}
            >
              <option value="">Not assigned yet</option>
              {eligible.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </Select>
          </Field>
        </FieldRow>
      </FormSection>

      <FormSection
        title="Joining link"
        description="Either we book a Google Meet, or you paste a link from elsewhere."
      >
        {generatedLink ? (
          <div className="rounded-xl border border-border bg-surface-muted p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-ink-900">
              <Video size={16} aria-hidden />
              Google Meet link
            </p>
            <a
              href={generatedLink.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block break-all text-sm font-medium text-brand-700 hover:text-brand-800"
            >
              {generatedLink.url}
            </a>
            <p className="mt-2 text-xs text-ink-500">
              Created with the session and kept in step with it — changing the
              date or time here moves the calendar event, and everyone who has
              the link keeps it. Cancelling the session withdraws the invite.
            </p>
            {generatedLink.isMock ? <MockWarning /> : null}
          </div>
        ) : (
          <div className="space-y-4">
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                generateMeet
                  ? "border-brand-600 bg-brand-50"
                  : "border-border hover:border-border-strong"
              }`}
            >
              <input
                type="checkbox"
                name="generateMeet"
                checked={generateMeet}
                onChange={(event) => setGenerateMeet(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
              />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
                  <Video size={15} aria-hidden />
                  Create a Google Meet link
                </span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  We book the calendar event and invite the assigned teacher.
                  Untick to paste a link from Zoom or elsewhere.
                </span>
              </span>
            </label>

            {generateMeet ? (
              googleConfigured ? null : (
                <MockWarning />
              )
            ) : (
              <Field
                id="joinUrl"
                label="Joining link"
                error={state.errors.joinUrl}
                hint="Optional — add it later if the meeting isn't set up yet."
              >
                <TextInput
                  id="joinUrl"
                  name="joinUrl"
                  type="url"
                  inputMode="url"
                  placeholder="https://zoom.us/j/…"
                  defaultValue={values.joinUrl}
                  hasError={Boolean(state.errors.joinUrl)}
                />
              </Field>
            )}
          </div>
        )}
      </FormSection>
    </FormLayout>
  );
}

/**
 * Said plainly, and in the manager's words rather than the developer's.
 *
 * The mock link looks exactly like a real one, which is the whole risk: without
 * this, somebody emails `meet.google.com/mock-cls-room` to a cohort and finds
 * out on the night. It names the file to fix, because the person who can fix it
 * is usually the person reading this.
 */
function MockWarning() {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-gold-300 bg-gold-50 p-3 text-xs text-ink-700">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        <strong className="font-bold">This is a placeholder link.</strong>{" "}
        Google credentials aren&apos;t set up yet, so the link won&apos;t open a
        real meeting — don&apos;t send it to students. Add{" "}
        <code className="rounded bg-surface px-1 py-0.5 font-mono">
          GOOGLE_CLIENT_EMAIL
        </code>
        ,{" "}
        <code className="rounded bg-surface px-1 py-0.5 font-mono">
          GOOGLE_PRIVATE_KEY
        </code>{" "}
        and{" "}
        <code className="rounded bg-surface px-1 py-0.5 font-mono">
          GOOGLE_ADMIN_EMAIL
        </code>{" "}
        to{" "}
        <code className="rounded bg-surface px-1 py-0.5 font-mono">
          .env.local
        </code>{" "}
        and re-schedule.
      </span>
    </p>
  );
}
