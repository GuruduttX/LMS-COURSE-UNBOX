/**
 * One subtopic, shown as it actually is.
 *
 * This is a *preview*, not an editor — the authoring forms land in the next
 * phase. It exists so staff can see exactly what a student will get, including
 * the honest gaps: a video with no URL says so rather than rendering an empty
 * frame, and a quiz shows which option is marked correct, because that is the
 * thing an author most needs to check and cannot see from the student side.
 *
 * **Async, because it refreshes a stale encoding status.** `video.status` is a
 * cache of something only Bunny knows, and the webhook that used to be its only
 * corrector cannot reach a laptop and can arrive before the subtopic is saved.
 * This is the screen an author watches while a lesson encodes, so it is one of
 * the two places `reconcileVideo` runs — see that function for why not the tree.
 * Both the admin and the teacher route render this component, so fixing it here
 * fixes it for both.
 */
import { AlertTriangle, Check, Clock, ExternalLink } from "lucide-react";

import { formatDuration, formatReadTime } from "@/lib/curriculum/format";
import { SUBTOPIC_KIND_LABEL } from "@/lib/curriculum/kinds";
import type { AuthoredQuestion, SubtopicView } from "@/lib/curriculum/types";
import { formatBytes } from "@/lib/uploads/kinds";
import { reconcileVideo } from "@/lib/video/reconcile";
import { thumbnailUrl } from "@/lib/video/bunny";
import { VIDEO_STATUS_LABEL } from "@/lib/video/shared";
import { KindIcon, NodeBadge } from "./NodeBadge";

export async function SubtopicDetail({ subtopic: row }: { subtopic: SubtopicView }) {
  const video = await reconcileVideo(row.video);
  const subtopic: SubtopicView =
    video === row.video
      ? row
      : { ...row, video, seconds: video?.seconds || row.seconds };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-ink-600">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 font-semibold text-brand-700">
          <KindIcon kind={subtopic.kind} />
          {SUBTOPIC_KIND_LABEL[subtopic.kind]}
        </span>
        <NodeBadge status={subtopic.nodeStatus} />
        {subtopic.kind === "video" ? (
          <span className="inline-flex items-center gap-1.5">
            <Clock size={14} aria-hidden />
            {formatDuration(subtopic.seconds)}
          </span>
        ) : null}
        {subtopic.kind === "text" && subtopic.body ? (
          <span className="inline-flex items-center gap-1.5">
            <Clock size={14} aria-hidden />
            {formatReadTime(subtopic.readMinutes)}
          </span>
        ) : null}
      </div>

      {subtopic.kind === "video" ? <VideoPreview subtopic={subtopic} /> : null}
      {subtopic.kind === "text" ? <TextPreview subtopic={subtopic} /> : null}
      {subtopic.kind === "pdf" ? <PdfPreview subtopic={subtopic} /> : null}
      {subtopic.kind === "quiz" ? (
        <QuizPreview questions={subtopic.questions} />
      ) : null}
    </div>
  );
}

function VideoPreview({ subtopic }: { subtopic: SubtopicView }) {
  const { video } = subtopic;

  // An uploaded video is what students actually get, so it is what the preview
  // shows — including the states that are not "fine", because "still encoding"
  // and "encoding failed" are exactly what an author needs to know before they
  // publish and walk away.
  if (video) {
    const poster = thumbnailUrl(video);

    return (
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-start gap-4">
          {poster && video.status === "ready" ? (
            /* eslint-disable-next-line @next/next/no-img-element --
               a Bunny CDN host, not a configured next/image domain, and it is
               a thumbnail on a staff-only screen: nothing to optimise. */
            <img
              src={poster}
              alt=""
              className="hidden h-20 w-36 shrink-0 rounded-lg border border-border object-cover sm:block"
            />
          ) : null}

          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-900">Uploaded video</p>
            <p className="mt-0.5 truncate text-sm text-ink-600">{video.name}</p>

            <p
              className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                video.status === "ready"
                  ? "bg-success-50 text-success-700"
                  : video.status === "processing"
                    ? "bg-warning-50 text-warning-700"
                    : "bg-danger-50 text-danger-700"
              }`}
            >
              {video.status === "ready" ? (
                <Check size={13} aria-hidden />
              ) : video.status === "processing" ? (
                <Clock size={13} aria-hidden />
              ) : (
                <AlertTriangle size={13} aria-hidden />
              )}
              {VIDEO_STATUS_LABEL[video.status]}
            </p>

            {video.status === "processing" ? (
              <p className="mt-2 text-sm text-ink-600">
                Bunny is still encoding this. Students see a &ldquo;still
                processing&rdquo; message until it finishes — usually a few
                minutes.
              </p>
            ) : null}
            {video.status === "failed" ? (
              <p className="mt-2 text-sm text-ink-600">
                Encoding failed, so this lesson cannot be published. Edit it and
                upload the file again.
              </p>
            ) : null}
          </div>
        </div>

        {subtopic.caption ? (
          <p className="mt-3 border-t border-border pt-3 text-sm text-ink-600">
            {subtopic.caption}
          </p>
        ) : null}
      </div>
    );
  }

  if (!subtopic.videoUrl) {
    return (
      <Gap
        title="No video yet"
        body="Nothing has been uploaded and no link has been pasted, so students see a placeholder frame. This subtopic cannot be published as it is."
      />
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-sm font-semibold text-ink-900">Video link</p>
      <a
        href={subtopic.videoUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-flex items-center gap-1.5 break-all text-sm text-brand-600 underline underline-offset-2"
      >
        {subtopic.videoUrl}
        <ExternalLink size={14} aria-hidden className="shrink-0" />
      </a>
      {subtopic.caption ? (
        <p className="mt-3 border-t border-border pt-3 text-sm text-ink-600">
          {subtopic.caption}
        </p>
      ) : null}
    </div>
  );
}

function TextPreview({ subtopic }: { subtopic: SubtopicView }) {
  if (!subtopic.body) {
    return (
      <Gap
        title="Nothing written yet"
        body="This reading subtopic has no content, so it cannot be published."
      />
    );
  }

  return (
    <article className="max-w-[68ch] whitespace-pre-wrap rounded-xl border border-border bg-surface p-5 text-base leading-relaxed text-ink-800 shadow-sm">
      {subtopic.body}
    </article>
  );
}

function PdfPreview({ subtopic }: { subtopic: SubtopicView }) {
  const pdf = subtopic.pdf;

  if (!pdf) {
    return (
      <Gap
        title="No PDF uploaded yet"
        body="A PDF subtopic holds a document we host ourselves. Until one is uploaded, students have nothing to open."
      />
    );
  }

  // The same embed the student gets, so an author finds out here rather than
  // from a student that their link opens a sign-in page instead of a document.
  return (
    <div className="space-y-3">
      <object
        data={pdf.url}
        type="application/pdf"
        className="h-[28rem] w-full rounded-xl border border-border bg-surface shadow-sm"
      >
        <p className="p-5 text-sm text-ink-600">
          This browser will not display the PDF inline. Students get the
          download link below instead.
        </p>
      </object>

      <a
        href={pdf.url}
        download={pdf.name}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 break-all text-sm text-brand-600 underline underline-offset-2"
      >
        {pdf.name}
        <ExternalLink size={14} aria-hidden className="shrink-0" />
      </a>

      <p className="text-sm text-ink-500">
        {formatBytes(pdf.bytes)} — hosted by us, so it cannot be moved or
        revoked from somewhere else. Replacing it here deletes the old file.
      </p>
    </div>
  );
}

function QuizPreview({ questions }: { questions: AuthoredQuestion[] }) {
  if (questions.length === 0) {
    return (
      <Gap
        title="No questions yet"
        body="A quiz with no questions cannot be published."
      />
    );
  }

  return (
    <ol className="space-y-4">
      {questions.map((question, index) => (
        <li
          key={question.id}
          className="rounded-xl border border-border bg-surface p-5 shadow-sm"
        >
          <p className="font-semibold text-ink-900">
            {index + 1}. {question.prompt}
          </p>

          <ul className="mt-3 space-y-2">
            {question.options.map((option) => {
              const correct = option.id === question.correctOptionId;
              return (
                <li
                  key={option.id}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                    correct
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : "border-border text-ink-700"
                  }`}
                >
                  {correct ? (
                    <Check
                      size={16}
                      aria-hidden
                      className="mt-0.5 shrink-0 text-emerald-600"
                    />
                  ) : (
                    <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-border" />
                  )}
                  <span>{option.text}</span>
                  {correct ? (
                    <span className="sr-only">(correct answer)</span>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {question.explanation ? (
            <p className="mt-3 border-t border-border pt-3 text-sm text-ink-600">
              <span className="font-semibold text-ink-800">Explanation. </span>
              {question.explanation}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** Something a student would meet as missing content. Named, not hidden. */
function Gap({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-dashed border-border bg-surface-muted p-5">
      <AlertTriangle
        size={18}
        aria-hidden
        className="mt-0.5 shrink-0 text-amber-600"
      />
      <div>
        <p className="text-sm font-semibold text-ink-900">{title}</p>
        <p className="mt-1 max-w-prose text-sm text-ink-600">{body}</p>
      </div>
    </div>
  );
}
