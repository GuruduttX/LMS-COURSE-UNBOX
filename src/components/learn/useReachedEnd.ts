"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { markLessonComplete } from "@/lib/actions/progress";

/**
 * Mark a lesson complete once the student has reached the end of it.
 *
 * The non-video half of completion: a video is finished by being watched, and a
 * reading or a document is finished by being got to the bottom of. Both are
 * observed rather than declared, so nothing asks the student to confirm what
 * they just did.
 *
 * ## Why a sentinel rather than a scroll listener
 *
 * The learning pane is not always the thing that scrolls — the layout differs
 * between the desktop split and the mobile drawer, and a listener would have to
 * know which element to attach to. An `IntersectionObserver` on a marker at the
 * end of the content asks the question directly: *is the end on screen?* That
 * answers correctly whichever ancestor scrolls, and it answers `true` straight
 * away for a lesson too short to scroll at all, which is the case a scroll
 * listener silently never fires for.
 *
 * ## The dwell
 *
 * The end being visible is not the same as having read it. Clicking through the
 * sidebar would otherwise complete a whole course in seconds, and progress that
 * can be collected by accident is not progress. So the end has to stay on
 * screen for `dwellMs` before anything is written — long enough that passing
 * through does not count, short enough that nobody notices it.
 */
export function useReachedEnd(
  subtopicKey: string,
  options: { dwellMs?: number; enabled?: boolean } = {},
) {
  const { dwellMs = 2_000, enabled = true } = options;

  const [complete, setComplete] = useState(false);
  /** Guards against a second write while the first is in flight. */
  const sent = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(async () => {
    if (sent.current) return;
    sent.current = true;

    const outcome = await markLessonComplete(subtopicKey);
    if (outcome.ok) {
      setComplete(true);
      return;
    }

    // A refusal is not shown to the reader — they are mid-lesson and a notice
    // about enrolment is not something they can act on. It is logged, because a
    // completion that silently fails is exactly the bug this feature exists to
    // fix and the next one would be just as invisible.
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[progress] ${subtopicKey} was not recorded: ${outcome.reason}`);
    }
    sent.current = false;
  }, [subtopicKey]);

  /** Call when the end is on screen (or has gone off it again). */
  const setAtEnd = useCallback(
    (atEnd: boolean) => {
      if (!enabled || sent.current) return;

      if (!atEnd) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        return;
      }

      if (timer.current) return;
      timer.current = setTimeout(finish, dwellMs);
    },
    [dwellMs, enabled, finish],
  );

  /** Attach to a zero-height marker rendered after the content. */
  const endRef = useCallback(
    (node: HTMLElement | null) => {
      if (!node || !enabled) return;

      const observer = new IntersectionObserver(
        (entries) => setAtEnd(entries.some((entry) => entry.isIntersecting)),
        { threshold: 0 },
      );
      observer.observe(node);
      return () => observer.disconnect();
    },
    [enabled, setAtEnd],
  );

  // A lesson left open when the tab closes should not fire on the way out.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { endRef, setAtEnd, complete };
}
