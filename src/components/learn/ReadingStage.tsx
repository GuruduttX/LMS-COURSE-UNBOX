"use client";

import { Check, ExternalLink, FileType2 } from "lucide-react";

import { formatReadTime } from "@/lib/curriculum/format";
import type { SubtopicView } from "@/lib/curriculum/types";

import { EmptyPane } from "./EmptyPane";
import { MaterialViewer } from "./MaterialViewer";
import { useReachedEnd } from "./useReachedEnd";

/**
 * The two panes that came with authoring: written material, and a hosted PDF.
 *
 * Both existed as subtopic kinds before any student could open one — a teacher
 * could author a reading and it would appear in the outline with nowhere to go.
 * These are deliberately the plain version of each: the reading is the text at
 * a comfortable measure, the PDF is the document in the page.
 *
 * **Both now record completion**, by the same rule a video does — the student
 * is observed finishing it rather than asked to say so. A reading is finished
 * when the end of the text has been on screen; a PDF when its last page has
 * been. Before this, `SubtopicProgress` had one writer and it was the video
 * player, so a course with a single reading in it could never be completed and
 * no gate behind it could ever open.
 */
export function TextStage({ subtopic }: { subtopic: SubtopicView }) {
  const done = subtopic.status === "completed";
  const { endRef, complete } = useReachedEnd(subtopic.id, { enabled: !done });

  if (!subtopic.body) {
    return (
      <EmptyPane
        title={subtopic.title}
        message="There is nothing written on this lesson yet. Your teacher is still working on it."
      />
    );
  }

  return (
    <article className="mx-auto w-full max-w-[68ch] px-4 py-6 md:px-6">
      <h1 className="text-xl font-extrabold tracking-tight text-ink-900 md:text-2xl">
        {subtopic.title}
      </h1>
      <p className="mt-1 text-xs font-medium text-ink-500">
        {formatReadTime(subtopic.readMinutes)}
      </p>

      {/* Stored as markdown, rendered as paragraphs. There is no markdown
          renderer in the app yet and adding one to get bold text would mean
          sanitising HTML on a page students read — worth doing deliberately,
          not as a side effect of the rewiring. Blank lines are the one piece
          of structure honoured, because they are the one an author relies on. */}
      <div className="mt-6 space-y-4 text-base/[1.65] text-ink-700">
        {subtopic.body
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean)
          .map((paragraph, index) => (
            <p key={index} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
      </div>

      {/* The marker the observer watches. Rendered after the prose, so it is on
          screen exactly when the end of the reading is — including immediately,
          for a lesson too short to scroll. */}
      <div ref={endRef} aria-hidden className="h-px" />

      <CompletionNote done={done || complete} />
    </article>
  );
}

/**
 * Says so, once, when a lesson has been recorded as finished.
 *
 * Quiet on purpose: the student did not press anything, so this is a
 * confirmation rather than a reward, and it must not look like a control they
 * were meant to find.
 */
function CompletionNote({ done }: { done: boolean }) {
  if (!done) return null;

  return (
    <p className="mt-8 flex items-center gap-1.5 text-xs font-medium text-success-700">
      <Check size={14} aria-hidden />
      Marked as complete
    </p>
  );
}

export function PdfStage({ subtopic }: { subtopic: SubtopicView }) {
  const pdf = subtopic.pdf;
  const done = subtopic.status === "completed";
  const { setAtEnd, complete } = useReachedEnd(subtopic.id, {
    enabled: !done && Boolean(pdf),
  });

  if (!pdf) {
    return (
      <EmptyPane
        title={subtopic.title}
        message="There is no document on this lesson yet. Your teacher hasn't uploaded it."
      />
    );
  }

  return (
    <div className="flex h-full flex-col px-4 py-4 md:px-6">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-base font-bold text-ink-900">
          <FileType2 size={18} aria-hidden className="text-ink-500" />
          {subtopic.title}
        </h1>

        <div className="flex items-center gap-3">
          <CompletionNote done={done || complete} />

          {/* Always offered alongside the viewer: some readers want the file
              itself, and `download` names it as the teacher uploaded it rather
              than as the opaque public id at the end of the URL. */}
          <a
            href={pdf.url}
            download={pdf.name}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
          >
            <ExternalLink size={14} aria-hidden />
            Download
          </a>
        </div>
      </div>

      {/* The same viewer a module's study material gets, rather than a bare
          iframe. Two reasons: it renders through pdf.js onto a canvas we own,
          so the document is paged, zoomable and keyboard-navigable; and it is
          the only way to know the reader reached the last page — a cross-origin
          iframe tells us nothing about what is happening inside it. */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <MaterialViewer
          url={pdf.url}
          kind="pdf"
          title={subtopic.title}
          onReachedEnd={setAtEnd}
        />
      </div>
    </div>
  );
}
