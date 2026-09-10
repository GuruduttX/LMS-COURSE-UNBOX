"use client";

import { useEffect } from "react";

/**
 * Turn the phone sideways when a video goes fullscreen, and back when it
 * leaves — the thing every video app does and the browser does not do for you.
 *
 * ## Why it listens to the document rather than owning a button
 *
 * The fullscreen control belongs to the **player**, and for a Bunny video the
 * player is inside an iframe we cannot reach into. A control of our own could
 * only stretch our frame around an unchanged video, and would sit next to
 * Bunny's real one — two buttons, one of them lying.
 *
 * So this hooks the event instead. When something inside an `allowfullscreen`
 * iframe goes fullscreen, the **parent** document's `fullscreenElement` becomes
 * that iframe and `fullscreenchange` fires here. One listener therefore covers
 * all three players — Bunny's iframe, a native `<video>`, and a third-party
 * embed — without any of them knowing about it.
 *
 * ## Why the lock is allowed to fail
 *
 * `screen.orientation.lock` is Android-and-desktop-Chrome only. iOS Safari does
 * not implement it at all, and does not need to: its fullscreen video is the
 * system player, which already rotates. Every call here is therefore
 * best-effort — a rejected promise, a missing method and a thrown
 * `NotSupportedError` are all the same non-event, because the video is playing
 * fullscreen either way and a failed *rotation* must never surface as an error.
 *
 * ## Why it only fires on a touch device
 *
 * `(pointer: coarse)` is the honest signal for "a screen somebody is holding".
 * Rotating a desktop monitor is meaningless, and on the laptops where the API
 * exists it would be actively wrong.
 */

/** The lock half of the Screen Orientation API, which TS types as required. */
type LockableOrientation = {
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
};

/** `webkitFullscreenElement` for the Safari and older Android WebView path. */
type PrefixedDocument = Document & { webkitFullscreenElement?: Element | null };

function currentFullscreenElement(): Element | null {
  const doc = document as PrefixedDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function orientationApi(): LockableOrientation | null {
  if (typeof window === "undefined") return null;
  return (window.screen?.orientation as LockableOrientation | undefined) ?? null;
}

/** Best-effort, always. See the header for why every failure is ignored. */
function lockLandscape(): void {
  try {
    const promise = orientationApi()?.lock?.("landscape");
    // Not every implementation returns a promise; `?.catch` on a non-promise
    // would be the one thing here that actually throws.
    if (promise && typeof promise.catch === "function") promise.catch(() => {});
  } catch {
    /* Unsupported. The video is fullscreen regardless. */
  }
}

function releaseOrientation(): void {
  try {
    orientationApi()?.unlock?.();
  } catch {
    /* Same. */
  }
}

export function useFullscreenLandscape(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Held, not re-read on exit: a device that rotated into landscape while
    // fullscreen would otherwise still match a coarse-pointer query but the
    // *unlock* must run whatever the device now looks like.
    const isHandheld = window.matchMedia("(pointer: coarse)").matches;
    if (!isHandheld) return;

    const onFullscreenChange = () => {
      if (currentFullscreenElement()) {
        lockLandscape();
      } else {
        releaseOrientation();
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
      // Navigating away mid-fullscreen (the footer's Next, a drawer link) would
      // otherwise leave the phone pinned sideways on the following lesson.
      releaseOrientation();
    };
  }, []);
}
