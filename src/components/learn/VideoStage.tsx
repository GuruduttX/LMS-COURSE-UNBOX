import { Play } from "lucide-react";

import { formatDuration } from "@/lib/curriculum/format";
import type { ModuleView, SubtopicView } from "@/lib/curriculum/types";
import { embedUrl } from "@/lib/video/bunny";

import { EmptyPane } from "./EmptyPane";
import { LessonScaffold } from "./LessonScaffold";
import { MaterialViewer } from "./MaterialViewer";
import { VideoPlayer } from "./VideoPlayer";

/**
 * The video pane.
 *
 * This file decides **which player** and signs its URL. Where the frame sits
 * and how big it is belongs to `LessonScaffold` — a full-bleed 16:9 strip on a
 * phone, a height-fitted card from `lg`. Splitting it that way is what stopped
 * three components each carrying half a `max-w` and a `flex-1` that only
 * worked at one breakpoint.
 *
 * ## Three players, chosen by what the lesson actually holds
 *
 * 1. **An uploaded video** (`subtopic.video`) — the normal case now. It sits on
 *    Bunny Stream, encoded into a ladder of resolutions, and plays in Bunny's
 *    own iframe player: adaptive quality, speed control, resume-where-you-left
 *    off, and no bytes served by us. This wins whenever it is present.
 * 2. **A link to a file** — `<video controls>` plays it directly.
 * 3. **A link to a page** that embeds a player (YouTube, Vimeo, a Drive
 *    preview) — an `<iframe>` shows it.
 *
 * 2 and 3 are the older path, kept because lessons already point at such links
 * and because an install with no Bunny keys still has to work.
 *
 * ## The embed URL is built on the server, and that is the point
 *
 * `embedUrl` signs it with the library's token key, which never reaches the
 * browser. So a student cannot mint a playable URL for a lesson they are not
 * enrolled in — the only URLs that exist are the ones this component rendered,
 * for pages `getLearnScreen` already decided they may see, and they expire.
 *
 * That is why this stays a **server** component and the player itself is a
 * thin client wrapper: `VideoPlayer` listens for the lesson being watched and
 * writes progress, but the signing never leaves here.
 *
 * Splitting the two is also what lets the handout open inline on a phone: that
 * needs client state, and the signing must not go anywhere near a client bundle.
 */
export function VideoStage({
  subtopic,
  module,
}: {
  subtopic: SubtopicView;
  /** The module around the lesson, for its handout. Optional — quizzes have none. */
  module?: ModuleView;
}) {
  const { video } = subtopic;

  if (!video && !subtopic.videoUrl) {
    return (
      <EmptyPane
        title={subtopic.title}
        message="There is no video on this lesson yet. Your teacher hasn't added it."
      />
    );
  }

  // Bunny will happily serve a player for a video it is still encoding, but it
  // plays nothing — a black rectangle a student would read as a broken page.
  // Say what is actually happening instead.
  if (video && video.status !== "ready") {
    return (
      <EmptyPane
        title={subtopic.title}
        message={
          video.status === "processing"
            ? "This video is still being processed. It usually takes a few minutes — check back shortly."
            : "This video didn't process correctly. Your teacher has been able to see that too; it should be replaced soon."
        }
      />
    );
  }

  const player = video ? (
        <VideoPlayer
          subtopicId={subtopic.id}
          title={subtopic.title}
          src={embedUrl(video, { rememberPosition: true })}
          provider="bunny"
          alreadyComplete={subtopic.status === "completed"}
        />
  ) : isMediaFile(subtopic.videoUrl) ? (
    <VideoPlayer
      subtopicId={subtopic.id}
      title={subtopic.title}
      src={subtopic.videoUrl}
      provider="file"
      alreadyComplete={subtopic.status === "completed"}
    />
  ) : (
    // A page that embeds someone else's player. There is no event to listen
    // to, so this one cannot mark itself watched — see VideoPlayer.
    // `h-full w-full` like the other two: the scaffold owns the box.
    <iframe
      key={subtopic.videoUrl}
      src={subtopic.videoUrl}
      title={subtopic.title}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowFullScreen
      className="h-full w-full border-0 bg-night-900"
    />
  );

  /**
   * Only for a linked video: an embed can be refused by the host — a private
   * Drive file, a video whose owner disabled embedding — and the student is
   * then looking at a blank rectangle with no way forward. An uploaded video
   * has no "somewhere else" to open, and offering one would hand out a URL
   * that is meant to stay inside the player.
   *
   * It rides under the description in the sheet rather than under the frame,
   * because the frame now runs to the edges of a phone and a grey line on
   * black is a line nobody reads.
   */
  const escapeHatch = !video ? (
    <>
      <Play size={12} aria-hidden className="mr-1 inline align-[-1px]" />
      Not playing?{" "}
      <a
        href={subtopic.videoUrl}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-brand-600 hover:underline"
      >
        Open the video in a new tab
      </a>
    </>
  ) : null;

  const material = module?.material ?? null;

  return (
    <LessonScaffold
      player={player}
      title={subtopic.title}
      meta={[
        module ? `Module ${module.number}` : null,
        subtopic.seconds > 0 ? formatDuration(subtopic.seconds) : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      // The caption used to sit under the player as a grey line nobody read.
      // Under the title on a phone it is the lesson's one-line description,
      // which is the job it was written for.
      description={subtopic.caption || undefined}
      // From the server, never from the player — see the prop's own note.
      complete={subtopic.status === "completed"}
      note={escapeHatch}
      material={
        material
          ? {
              title: module?.materialTitle || "Study material",
              // Keyed on the URL so replacing the file mounts a fresh viewer
              // rather than leaving the old document's page count on screen.
              body: (
                <MaterialViewer
                  key={material.url}
                  url={material.url}
                  kind={material.kind}
                  title={module?.materialTitle || "Study material"}
                />
              ),
            }
          : null
      }
    />
  );
}

/** A link to a file we can play ourselves, rather than a page that embeds one. */
function isMediaFile(url: string): boolean {
  const path = url.split(/[?#]/)[0] ?? "";
  return /\.(mp4|webm|ogv|ogg|m4v|mov)$/i.test(path.trim());
}
