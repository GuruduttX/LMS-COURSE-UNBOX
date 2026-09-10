"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, FileText } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { DURATION, EASE_IN_SOFT, EASE_OUT_SOFT } from "@/lib/motion";

/**
 * The frame around a video lesson: the player, what it is called, and the
 * module's handout — **one layout, two arrangements, one player**.
 *
 * ## The phone: a full-bleed stage, then a sheet
 *
 * The video runs edge to edge at the top of the screen, and everything about
 * the lesson sits under it on a card with rounded top corners, separated from
 * the player by a thin black gutter.
 *
 * **That gutter is not decoration.** The sheet used to ride `-mt-3` up over the
 * black, which looked right and was wrong: a `relative z-10` box overlapping
 * the player also *takes the taps* over the strip it covers, and the strip it
 * covered was the bottom of Bunny's control bar. Play, mute and fullscreen sat
 * under an invisible white edge. Measured with `elementFromPoint`: at 98% of
 * the way down the player the topmost element was the sheet, not the iframe.
 * Nothing may overlap the player.
 *
 * Edge-to-edge is not decoration. On a 390px screen an inset, rounded, bordered
 * video is a card floating in a page — twenty-odd pixels of wasted width on the
 * one element the page exists for, and a corner radius nobody asked for.
 *
 * ## Why the order flips at `lg`
 *
 * The player is first in the DOM and the title second, which is the phone's
 * reading order. From `lg` the title moves above the video with `order`, where
 * a desktop reader expects a heading. `order` rather than two branches, because
 * the alternative is rendering the player twice — two iframes, two sets of
 * progress writes, and a lesson that could mark itself watched from a player
 * nobody can see.
 *
 * ## The two ways the stage is sized, and why neither is "fill the pane"
 *
 * On a phone it is a plain `aspect-video` box the full width of the screen. The
 * width is the constraint and the height follows; the page scrolls beneath it.
 *
 * From `lg` the constraint flips: the pane's *height* is fixed (the lesson must
 * not scroll — the footer controls have to stay on screen), so the stage is an
 * `aspect-video` box capped by a width derived from the viewport height,
 * `calc((100dvh - 13rem) * 16/9)`. Below that cap it fills the pane; above it,
 * the cap stops the box growing taller than the space left after the header,
 * the title block and the footer. The result is a video that is exactly as
 * large as it can be with no letterboxing and no scrollbar.
 *
 * The alternative — `flex-1` on a box the player letterboxes inside — is what
 * this replaced. It gave black bars down both sides on a wide monitor, and on a
 * phone it silently did nothing at all, because a `flex-1` child of an
 * `aspect-video` **block** is not a flex item: the frame collapsed to an
 * iframe's intrinsic 150px inside a box three times that tall. That is the bug
 * behind "the video isn't filling the screen".
 *
 * ## Fullscreen and landscape
 *
 * Both belong to the player: Bunny's iframe and the native `<video>` each have
 * their own control, and a second one of ours could not reach inside the iframe
 * anyway — it would only stretch our frame around an unchanged video. What we
 * add is the rotation, in `useFullscreenLandscape`, which listens for the
 * document going fullscreen however that happened.
 *
 * ## The handout opens in place
 *
 * Tapping "Study material" reveals the document **below the title, without
 * touching the player** — it is the same React element throughout, so the video
 * carries on playing while the student reads. That is the whole reason this is
 * a client component and the material arrives as a prop rather than as a route:
 * `?v=material` replaces the pane, which would stop the video.
 *
 * It stays a mobile affordance. On desktop the outline column already has the
 * material link, and there is room for the document to have the pane to itself.
 */
export function LessonScaffold({
  player,
  title,
  meta,
  description,
  complete = false,
  note,
  material,
}: {
  /** The already-signed player. Rendered exactly once — see the header. */
  player: ReactNode;
  title: string;
  /** "Module 2 · 8 min" — the small line under the title. */
  meta?: string;
  description?: string;
  /**
   * Whether this student has finished the lesson, **as the server last said**.
   *
   * Not player state. `VideoPlayer` calls `router.refresh()` when it reports a
   * completion, so this chip, the outline's tick and the module percentage all
   * change together off one server render rather than drifting apart.
   */
  complete?: boolean;
  /**
   * A small line under the description — today only the "not playing? open it
   * in a new tab" escape hatch a third-party embed needs. It lives in the
   * sheet rather than under the frame because the frame now runs to the edges
   * of a phone, and grey text on black is text nobody reads.
   */
  note?: ReactNode;
  /** The module's handout, if it has one. Mobile only. */
  material?: { title: string; body: ReactNode } | null;
}) {
  const [showMaterial, setShowMaterial] = useState(false);
  const materialBox = useRef<HTMLDivElement>(null);

  return (
    /* `flex-1` inside the pane's flex column, so the sheet's white runs to the
       bottom of the pane on a short lesson rather than stopping under the last
       card and leaving a band of page background above the footer. A flex grow
       rather than `min-h-full`, because the pane's own height comes from
       `flex-1` and a percentage resolved against it collapses to nothing. It
       still grows past the pane when the content is taller — that is what the
       pane's `overflow-y-auto` is for. */
    <div className="flex flex-1 flex-col lg:min-h-0">
      {/* 1. The stage. First in the DOM, moved below the title from lg.

             `bg-night-900` sits on the wrapper as well as the frame so the
             overscroll bounce at the top of a phone shows black rather than a
             flash of page background above the video. */}
      <div className="w-full shrink-0 bg-night-900 pb-2 lg:order-2 lg:flex lg:min-h-0 lg:flex-1 lg:items-center lg:justify-center lg:bg-transparent lg:px-6 lg:pb-3">
        <div className="aspect-video w-full overflow-hidden bg-night-900 lg:mx-auto lg:max-h-full lg:max-w-[calc((100dvh_-_13rem)*16/9)] lg:rounded-xl lg:border lg:border-border lg:shadow-sm">
          {player}
        </div>
      </div>

      {/* 2. The sheet. What the lesson is, and what comes with it.

             No `relative`, no `z-index` and no negative margin: it must not be
             able to paint or hit-test over the player. The rounded top corners
             read against the stage's black gutter instead of against the video.
             Rounding is dropped from lg, where this is a plain heading block
             above the video and a floating card would be nonsense. */}
      <div className="flex-1 rounded-t-2xl bg-surface px-4 pb-5 pt-4 lg:order-1 lg:flex-none lg:rounded-none lg:bg-transparent lg:px-6 lg:pb-0 lg:pt-4">
        <h1 className="text-lg font-bold leading-snug text-ink-900 lg:text-center lg:text-base">
          {title}
        </h1>

        {meta || complete ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 lg:justify-center">
            {meta ? (
              <p className="text-xs font-medium text-ink-500">{meta}</p>
            ) : null}
            {complete ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-2xs font-semibold text-success-700">
                <CheckCircle2 size={12} aria-hidden />
                Completed
              </span>
            ) : null}
          </div>
        ) : null}

        {description ? (
          <p className="mt-3 text-sm leading-relaxed text-ink-600 lg:hidden">
            {description}
          </p>
        ) : null}

        {note ? (
          <p className="mt-3 text-xs text-ink-500 lg:text-center">{note}</p>
        ) : null}

        {/* The one thing that travels with a lesson and has somewhere to go.
            A card rather than a bare row, because on a phone this is the only
            other destination on the screen and it should read as one. */}
        {material ? (
          <button
            type="button"
            onClick={() => setShowMaterial((open) => !open)}
            aria-expanded={showMaterial}
            className={cn(
              "mt-4 flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors lg:hidden",
              showMaterial
                ? "border-brand-600 bg-brand-50"
                : "border-border bg-surface-muted active:bg-ink-100",
            )}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <FileText size={18} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink-900">
                {material.title}
              </span>
              <span className="block text-xs text-ink-500">
                {showMaterial ? "Tap to hide" : "Read alongside the video"}
              </span>
            </span>
            <ChevronDown
              size={18}
              aria-hidden
              className={cn(
                "shrink-0 text-ink-400 transition-transform duration-200",
                showMaterial && "rotate-180",
              )}
            />
          </button>
        ) : null}

        {/* 3. The handout, in place. Only mounts when opened — a PDF worth six
               megabytes should not load for every student who never taps it. */}
        {material ? (
          <AnimatePresence initial={false}>
            {showMaterial ? (
              <motion.div
                key="material"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  height: { duration: DURATION.base, ease: EASE_OUT_SOFT },
                  opacity: { duration: DURATION.fast, ease: EASE_IN_SOFT },
                }}
                /* Bring it up to the top of the screen once it has finished
                   opening. The box opens below the video, the title and the
                   toggle, so left where it lands the reader sees the head of
                   the document and none of the controls under it — which is
                   the same complaint as having no controls at all. There is no
                   arrangement that shows the video *and* a readable document
                   on a 660px screen; the controls win, and the video plays on
                   above.

                   `start` and not `end`, because the footer is `sticky
                   bottom-0`: aligning the box's bottom with the viewport's
                   puts the viewer's toolbar underneath Prev/Next. The box's
                   own `scroll-mt-16` does the same job for the sticky header
                   at the top.

                   After the animation, not on the click: the height is still
                   growing, so scrolling to where the box *is* would aim at a
                   box that has not finished arriving. */
                onAnimationComplete={() => {
                  if (!showMaterial) return;
                  materialBox.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
                /* The negative margins live on the *clipping* box, not on the
                   document inside it. On the inner box they widened it to the
                   screen while this one went on clipping at the sheet's
                   padding — which quietly cut the right-hand end off the
                   viewer's own toolbar, the zoom-in button included. */
                className="-mx-4 overflow-hidden lg:hidden"
              >
                {/* A viewport-tall box rather than `auto`: a PDF viewer has no
                    intrinsic height, and letting it size itself would either
                    collapse it to nothing or run it to hundreds of pages. It
                    runs to the screen edges (see the wrapper above) with a
                    gutter of its own — a document inset by the sheet's full
                    padding is a document read through a letterbox.

                    **A flex column**, and that is not cosmetic. The viewer is
                    `flex-1` inside its own column, which a *block* parent
                    ignores — so the document laid itself out at full length
                    (5,800px for one Word file), the pane never scrolled
                    internally, and the toolbar that pages and zooms ended up
                    five thousand pixels below the fold. Which is the whole of
                    "the handout has no controls on a phone".

                    Its height is the screen less the sticky header and footer
                    (and a little slack), because the scroll below brings it up
                    to the top of the screen — so this is the whole of what the
                    reader can see, and anything shorter is a smaller document
                    for no gain. `dvh`, not `vh`: on a phone `vh` is measured
                    against the viewport with the URL bar hidden, so the box
                    would be taller than the screen it is on for as long as the
                    bar is showing. */}
                <div
                  ref={materialBox}
                  className="mt-4 flex h-[calc(100dvh-8rem)] scroll-mt-16 flex-col border-y border-border px-3"
                >
                  {material.body}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        ) : null}
      </div>
    </div>
  );
}
