"use client";

/**
 * Create or edit a subtopic — the learning screen itself.
 *
 * The kind picker is at the top and it switches the rest of the form, because
 * what a video needs and what a quiz needs have nothing in common. Only the
 * chosen kind's fields are submitted as content; the server clears the others,
 * so a subtopic changed from video to quiz doesn't keep a stale URL that the
 * preview would then cheerfully show.
 *
 * **Both a video and a PDF are uploaded.** Picking a video sends it straight to
 * Bunny Stream, which encodes it and plays it back — see `VideoUpload`. A link
 * field stays underneath it for videos that already live somewhere else, and it
 * is the only field when the server has no Bunny keys, which is what `uploads`
 * decides.
 *
 * A PDF goes to Cloudinary through the same signed upload a module's study
 * material uses. It used to be a pasted link, back when there was no file
 * storage; the field that replaced it stores a `publicId` too, so the document
 * can be deleted when the lesson is — and so a teacher cannot accidentally
 * point a cohort at a Drive file that is set to "restricted".
 */
import { useActionState, useState } from "react";

import { saveSubtopic } from "@/lib/actions/curriculum";
import {
  EMPTY_SUBTOPIC_STATE,
  type SubtopicFormState,
} from "@/lib/actions/curriculum-state";
import { Field, TextInput, Textarea } from "@/components/ui/Field";
import { FileUpload } from "@/components/ui/FileUpload";
import { VideoUpload } from "@/components/ui/VideoUpload";
import {
  MATERIAL_MAX_BYTES,
  parseUploadedFiles,
  type FileKind,
} from "@/lib/uploads/kinds";
import { parseStoredVideo } from "@/lib/video/shared";
import {
  SUBTOPIC_KINDS,
  SUBTOPIC_KIND_HINT,
  SUBTOPIC_KIND_ICON,
  SUBTOPIC_KIND_LABEL,
  type SubtopicKind,
} from "@/lib/curriculum/kinds";
import {
  MAX_BODY_LENGTH,
  type QuestionInput,
  type SubtopicInput,
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
import { QuestionBuilder } from "./QuestionBuilder";

/** A PDF subtopic takes a PDF. The kind is named for it, and `PdfStage`
 *  embeds it as one. */
const PDF_ONLY = ["pdf"] as const satisfies readonly FileKind[];

export function SubtopicForm({
  mode,
  area,
  programSlug,
  courseKey,
  moduleKey,
  topicKey,
  initial,
  initialQuestions = [],
  suggestedKey,
  cancelHref,
  uploads,
  context = [],
}: {
  mode: "create" | "edit";
  area: "admin" | "teacher";
  programSlug: string;
  courseKey: string;
  moduleKey: string;
  topicKey: string;
  initial?: SubtopicInput;
  initialQuestions?: QuestionInput[];
  suggestedKey?: string;
  cancelHref: string;
  /** Whether this server has Bunny Stream keys. Decided on the server — the
   *  browser has no way to know, and must not be told the keys to find out. */
  uploads: boolean;
  /** Program / course / module / topic titles for the side rail. */
  context?: { label: string; value: string }[];
}) {
  const [state, action, pending] = useActionState<SubtopicFormState, FormData>(
    saveSubtopic,
    initial
      ? {
          ...EMPTY_SUBTOPIC_STATE,
          values: initial,
          questions: initialQuestions,
        }
      : EMPTY_SUBTOPIC_STATE,
  );

  const values = state.values;
  const [kind, setKind] = useState<SubtopicKind>(
    (values.kind as SubtopicKind) || "video",
  );
  const [title, setTitle] = useState(values.title);

  // Only read on mount — `VideoUpload` owns its own state afterwards, which is
  // what keeps an upload alive across a rejected save.
  const initialVideo = parseStoredVideo(values.video).video;

  // The same, for the document: `FileUpload` posts a JSON array, so a rejected
  // save hands the attachment straight back rather than making the teacher
  // upload it a second time.
  const initialPdf = parseUploadedFiles(values.pdf, PDF_ONLY).files;

  // Questions the builder starts from: whatever came back from a rejected save,
  // falling back to what was loaded. Losing an author's typing on a validation
  // failure is the one thing a long form must never do.
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
            submitLabel={mode === "create" ? "Create subtopic" : "Save changes"}
            note="Students see it as soon as it is published and its topic is."
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
        topicKey={topicKey}
        originalKey={mode === "edit" ? values.key : undefined}
      />

      <FormBanner ok={state.ok} error={state.error} />

      <FormSection
        title="What kind of screen is this?"
        description="It decides what the rest of the form asks for — and what the student gets."
      >
        <fieldset>
          <legend className="sr-only">Kind</legend>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {SUBTOPIC_KINDS.map((option) => {
              const Icon = SUBTOPIC_KIND_ICON[option];
              const selected = kind === option;
              return (
                <label
                  key={option}
                  className={`flex cursor-pointer gap-2.5 rounded-xl border p-3 transition-colors ${
                    selected
                      ? "border-brand-600 bg-brand-50"
                      : "border-border bg-surface hover:border-border-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={option}
                    checked={selected}
                    onChange={() => setKind(option)}
                    className="mt-1 h-4 w-4 shrink-0 accent-brand-600"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                      <Icon size={15} aria-hidden />
                      {SUBTOPIC_KIND_LABEL[option]}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-ink-600">
                      {SUBTOPIC_KIND_HINT[option]}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          {state.errors.kind ? (
            <p
              role="alert"
              className="mt-1.5 text-xs font-medium text-danger-700"
            >
              {state.errors.kind}
            </p>
          ) : null}
        </fieldset>

        <FieldRow>
          <Field id="title" label="Title" error={state.errors.title} required>
            <TextInput
              id="title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Setting a target CPA"
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
        title={CONTENT_SECTION[kind].title}
        description={CONTENT_SECTION[kind].description}
      >
        {kind === "video" ? (
          <>
            {uploads ? (
              <VideoUpload
                name="video"
                label="Video"
                title={title}
                defaultValue={initialVideo}
                error={state.errors.video}
                hint="Uploaded to Bunny Stream, encoded into every quality a student's connection might need, and played in our own player. Encoding takes a few minutes — you can save and come back."
              />
            ) : (
              // No Bunny keys, no uploader. The field still posts, empty, so a
              // saved video isn't silently dropped by an unconfigured server.
              <input type="hidden" name="video" value="" />
            )}

            <Field
              id="videoUrl"
              label={uploads ? "Video link instead" : "Video link"}
              error={state.errors.videoUrl}
              hint={
                uploads
                  ? "Only for videos that live somewhere else already — YouTube, Drive, a file on a server. An uploaded video wins over this."
                  : "A link to the video wherever it is hosted. Uploads aren't configured on this server."
              }
            >
              <TextInput
                id="videoUrl"
                name="videoUrl"
                type="url"
                defaultValue={values.videoUrl}
                placeholder="https://…"
                hasError={Boolean(state.errors.videoUrl)}
              />
            </Field>

            <FieldRow>
              <Field
                id="seconds"
                label="Runtime in seconds"
                error={state.errors.seconds}
                hint="Shown as “6m 15s” next to the title."
              >
                <TextInput
                  id="seconds"
                  name="seconds"
                  inputMode="numeric"
                  defaultValue={values.seconds}
                  placeholder="375"
                  hasError={Boolean(state.errors.seconds)}
                />
              </Field>

              <Field
                id="caption"
                label="Caption"
                error={state.errors.caption}
                hint="One line under the player."
              >
                <TextInput
                  id="caption"
                  name="caption"
                  defaultValue={values.caption}
                  hasError={Boolean(state.errors.caption)}
                />
              </Field>
            </FieldRow>
          </>
        ) : null}

        {kind === "text" ? (
          <Field
            id="body"
            label="Content"
            error={state.errors.body}
            hint={`Markdown. Up to ${MAX_BODY_LENGTH.toLocaleString("en-IN")} characters. Reading time is worked out from the word count.`}
          >
            <Textarea
              id="body"
              name="body"
              defaultValue={values.body}
              className="min-h-64 font-mono text-[13px]"
              hasError={Boolean(state.errors.body)}
            />
          </Field>
        ) : null}

        {kind === "pdf" ? (
          <FileUpload
            name="pdf"
            scope="curriculum"
            accept={PDF_ONLY}
            maxBytes={MATERIAL_MAX_BYTES}
            label="Document"
            hint="Uploaded and served by us, so it cannot be moved or revoked from somewhere else later. Students read it in the page and can download the same file."
            error={state.errors.pdf}
            defaultValue={initialPdf}
          />
        ) : null}

        {kind === "quiz" ? (
          <div className="space-y-3">
            {state.errors.questions ? (
              <p role="alert" className="text-xs font-medium text-danger-700">
                {state.errors.questions}
              </p>
            ) : null}
            <QuestionBuilder
              allow={["single"]}
              initial={questions}
              showErrors={Boolean(state.errors.questions)}
            />
          </div>
        ) : null}
      </FormSection>
    </FormLayout>
  );
}

/** The heading over the kind-specific half of the form. */
const CONTENT_SECTION: Record<
  SubtopicKind,
  { title: string; description: string }
> = {
  video: {
    title: "The video",
    description:
      "Upload it, or point at one that already lives somewhere else.",
  },
  text: {
    title: "The reading",
    description: "Markdown. Reading time is worked out from the word count.",
  },
  pdf: {
    title: "The PDF",
    description: "Read inside the lesson screen, and downloadable from there.",
  },
  quiz: {
    title: "The questions",
    description:
      "A practice quiz — it is not marked and does not count towards anything.",
  },
};
