"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { recordVideoProgress } from "@/lib/actions/progress";
import { useFullscreenLandscape } from "@/lib/useFullscreenLandscape";

/**
 * The player, plus the one thing a player owes the rest of the app: telling it
 * the lesson was watched.
 *
 * `VideoStage` stays a server component — it holds the signed embed URL, and
 * signing is the whole security model. This is the thin client wrapper that
 * listens to the player and calls `recordVideoProgress`.
 *
 * ## Two players, one contract
 *
 * A Bunny video is an iframe, so its events arrive over **player.js** —
 * `postMessage` under a small library Bunny hosts. A linked media file is a
 * real `<video>` element with native events. Both end up calling the same
 * `report()`, so completion means the same thing however the lesson was
 * authored. A link to a *page* that embeds a player (YouTube, Drive) gives no
 * signal at all and is rendered by `VideoStage` without this wrapper — there is
 * nothing to listen to, and pretending otherwise would mark lessons finished
 * that nobody watched.
 *
 * ## When a lesson counts as watched
 *
 * At `ended`, or at 95% — whichever comes first. The tail of a lecture is
 * usually "thanks for watching", and a student who has to sit through an
 * outro to get their tick learns to leave the tab open instead, which is worse
 * data than just believing the 95%.
 *
 * ## Why it writes on a timer as well
 *
 * `secondsWatched` is the seam a resume feature will need, and a student who
 * closes the tab halfway is exactly the person it matters for. Every 15
 * seconds is often enough to be useful and rare enough that a 40-minute
 * lecture is 160 writes, not 2,400.
 *
 * ## It fills the box it is given, and decides nothing about that box
 *
 * Both players are `h-full w-full` inside whatever `LessonScaffold` hands them
 * — a full-bleed 16:9 strip on a phone, a height-fitted card from `lg`. This
 * file used to carry a `max-w-5xl` and a `flex-1` of its own, and the `flex-1`
 * was a real bug: its parent was an `aspect-video` **block**, so the flex rule
 * did nothing, the column had no definite height, and the iframe collapsed to
 * its intrinsic 150px inside a box three times that tall. One owner of the
 * frame's size, and it is the scaffold.
 *
 * ## The player's URL is pinned to the first one we were given
 *
 * `embedUrl` mints a **new** signed URL on every server render — a fresh token
 * and a fresh `expires` — so the `src` this component receives changes whenever
 * anything re-renders the page. Passing that straight to the iframe reloads the
 * player: the student is thrown back to the start of the lecture mid-sentence.
 * `recordVideoProgress` calls `revalidatePath("/learn")` the moment a lesson
 * completes and this file calls `router.refresh()` right after, so that reload
 * was guaranteed to happen at the 95% mark, on every lesson.
 *
 * So the first URL for a lesson is the one that stays, and a new `subtopicId`
 * is the only thing that replaces it. Nothing is lost by pinning it: the token
 * authenticates the iframe *load*, and the load already happened.
 *
 * ## Fullscreen is the player's button and our rotation
 *
 * `useFullscreenLandscape` turns the phone sideways when *anything* on the page
 * goes fullscreen, which covers Bunny's own control without our reaching inside
 * its iframe. See that file for why there is no button of ours.
 */

/** How often to persist position while playing. */
const HEARTBEAT_MS = 15_000;

/** How much of a video counts as all of it. */
const COMPLETE_AT = 0.95;

const PLAYERJS_SRC =
  "https://assets.mediadelivery.net/playerjs/playerjs-latest.min.js";

type PlayerJs = {
  on(event: string, handler: (data?: { seconds?: number; duration?: number }) => void): void;
};

declare global {
  interface Window {
    playerjs?: { Player: new (element: HTMLIFrameElement) => PlayerJs };
  }
}

/** Load Bunny's player.js once per page, and hand back the global. */
function loadPlayerJs(): Promise<Window["playerjs"]> {
  if (typeof window === "undefined") return Promise.resolve(undefined);
  if (window.playerjs) return Promise.resolve(window.playerjs);

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${PLAYERJS_SRC}"]`,
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(window.playerjs));
      // Already loaded between the check above and this branch.
      if (window.playerjs) resolve(window.playerjs);
      return;
    }

    const script = document.createElement("script");
    script.src = PLAYERJS_SRC;
    script.async = true;
    script.addEventListener("load", () => resolve(window.playerjs));
    // A blocked or failed script must not break playback — the video still
    // plays, it just cannot report itself finished.
    script.addEventListener("error", () => resolve(undefined));
    document.head.appendChild(script);
  });
}

export function VideoPlayer({
  subtopicId,
  title,
  src,
  provider,
  alreadyComplete,
}: {
  /** The subtopic's stable key — what the action looks the lesson up by. */
  subtopicId: string;
  title: string;
  src: string;
  provider: "bunny" | "file";
  /** Whether this student has already finished it, from the server. */
  alreadyComplete: boolean;
}) {
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useFullscreenLandscape();

  /**
   * The URL the iframe actually gets — see the header. Replaced only when the
   * lesson changes, so a re-render carrying a freshly signed URL cannot reload
   * the player out from under whoever is watching it.
   *
   * State adjusted during render rather than a ref: this is React's documented
   * "derived state that resets on a prop change" pattern, it re-renders before
   * anything is committed, and unlike a ref it does not trip the compiler's
   * rule against reading `.current` while rendering.
   */
  const [pinned, setPinned] = useState({ subtopicId, src });
  if (pinned.subtopicId !== subtopicId) setPinned({ subtopicId, src });
  const playerSrc = pinned.subtopicId === subtopicId ? pinned.src : src;

  /** Latest position, read by the heartbeat rather than sent by every tick. */
  const position = useRef({ seconds: 0, duration: 0 });
  /** So the completing call is made once, not on every tick past 95%. */
  const reportedComplete = useRef(alreadyComplete);
  /**
   * Whether the server has already been told, so the refresh happens once.
   *
   * There is deliberately no `complete` state here any more and no tick drawn
   * by this component. The "Completed" chip is rendered by the scaffold from
   * the server's `subtopic.status`, and `router.refresh()` below is what makes
   * it appear — the same re-render that updates the outline, the module
   * percentage and the curriculum page. Two sources for one fact is how a
   * player and a sidebar end up disagreeing about whether a lesson was watched.
   */
  const refreshed = useRef(alreadyComplete);
  const lastSent = useRef(0);

  const report = useCallback(
    async (seconds: number, finished: boolean) => {
      if (finished && reportedComplete.current) return;
      if (finished) reportedComplete.current = true;

      try {
        const outcome = await recordVideoProgress(subtopicId, seconds, finished);

        if (outcome.ok && outcome.state === "completed" && !refreshed.current) {
          refreshed.current = true;
          // The sidebar, the curriculum page and every percentage are server
          // rendered from these rows, so the tick only appears after a refresh.
          router.refresh();
        }
      } catch {
        // A failed report is not a failed lesson. The next heartbeat retries,
        // and nothing the student can see depends on this call succeeding.
        if (finished) reportedComplete.current = false;
      }
    },
    [router, subtopicId],
  );

  /** Called by both players on every time update. */
  const onTick = useCallback(
    (seconds: number, duration: number) => {
      position.current = { seconds, duration };

      if (
        !reportedComplete.current &&
        duration > 0 &&
        seconds / duration >= COMPLETE_AT
      ) {
        void report(seconds, true);
      }
    },
    [report],
  );

  /* The heartbeat. One timer for the life of the component, reading the ref —
     rather than a timer restarted by every `timeupdate`, which would be a new
     interval several times a second. */
  useEffect(() => {
    const timer = setInterval(() => {
      const { seconds } = position.current;
      if (seconds <= 0 || seconds === lastSent.current) return;

      lastSent.current = seconds;
      void report(seconds, false);
    }, HEARTBEAT_MS);

    return () => clearInterval(timer);
  }, [report]);

  /* Bunny's iframe, over player.js. */
  useEffect(() => {
    if (provider !== "bunny") return;

    let cancelled = false;

    void loadPlayerJs().then((lib) => {
      if (cancelled || !lib || !frameRef.current) return;

      const player = new lib.Player(frameRef.current);

      player.on("ready", () => {
        player.on("timeupdate", (data) => {
          onTick(data?.seconds ?? 0, data?.duration ?? 0);
        });
        player.on("ended", () => {
          void report(position.current.duration || position.current.seconds, true);
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [onTick, provider, report]);

  /**
   * One frame, both providers. `h-full w-full` and nothing else: the box, its
   * aspect ratio, its corners and its border all belong to `LessonScaffold`.
   */
  const frameClass = "h-full w-full border-0 bg-night-900";

  if (provider === "file") {
    return (
      <video
        ref={videoRef}
        key={playerSrc}
        controls
        playsInline
        preload="metadata"
        className={frameClass}
        src={playerSrc}
        onTimeUpdate={(event) =>
          onTick(event.currentTarget.currentTime, event.currentTarget.duration || 0)
        }
        onEnded={(event) => void report(event.currentTarget.currentTime, true)}
      >
        {/* Captions are a real gap, not an oversight — design.md §7 rule 28.
            There is nowhere to author a track file yet. */}
        Your browser cannot play this video.{" "}
        <a href={playerSrc}>Open it directly.</a>
      </video>
    );
  }

  return (
    <iframe
      ref={frameRef}
      key={playerSrc}
      src={playerSrc}
      title={title}
      // Deliberately not `loading="lazy"`: the signed URL expires, and a
      // frame that waits for a scroll can wait past its own token. This is
      // also the point of the page, so there is nothing to defer.
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      className={frameClass}
    />
  );
}
