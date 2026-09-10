"use client";

import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Minus,
  MoveHorizontal,
  Plus,
  Scan,
  TriangleAlert,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";

import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

import { cn } from "@/lib/cn";
import type { FileKind } from "@/lib/uploads/kinds";

/**
 * A study material document, rendered by us.
 *
 * This replaced an embedded `view.officeapps.live.com` frame. That was somebody
 * else's page inside ours — their chrome, their fonts, their uptime, their
 * ~10 MB ceiling — and it looked like it. Here a PDF goes through Mozilla's
 * pdf.js (via `react-pdf`) onto a canvas we own, and a Word file through
 * `docx-preview` into a div we own, so both sit in the app's own frame with the
 * app's own controls.
 *
 * **PowerPoint is not supported on purpose.** There is no pdf.js-equivalent for
 * `.pptx`; the browser renderers that exist are far smaller and approximate on
 * real decks. A preview that quietly misrepresents a document is worse than no
 * preview, so `MATERIAL_KINDS` refuses the format and a teacher exports a PDF.
 *
 * Both libraries fetch the file from Cloudinary **in the browser**, which is
 * only possible because raw delivery sends `access-control-allow-origin: *` and
 * answers range requests with a 206 (checked against the account, not assumed).
 * If that ever changes, these fetches fail and the file needs proxying through
 * a route of ours.
 *
 * ## Zoom
 *
 * Both viewers share `useDocumentZoom`, and both mean the same thing by it:
 * `scale` is the document's **true** size, so 100% is the page at the size it
 * would print, Fit width is whatever makes the page span the pane, and Fit page
 * is whatever makes a whole page visible at once. Getting there is the same
 * four ways in either viewer — the buttons, ⌘/Ctrl and the wheel, a trackpad
 * pinch, and a two-finger pinch on a touchscreen — because a student who
 * pinches a document expects the document to zoom, and every one of those
 * gestures otherwise zooms the browser window with the document inside it.
 */

/**
 * pdf.js runs its parser in a worker, and refuses to start without one. The
 * copy shipped inside `pdfjs-dist` is used rather than a CDN build: the two
 * versions have to match exactly, and pinning one against a URL somebody else
 * controls is how that silently stops being true.
 */
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/**
 * PDF pages are measured in points (72 to the inch) and the web in CSS pixels
 * (96 to the inch). Multiplying by this is what makes our 100% the same 100%
 * that Acrobat and pdf.js's own viewer mean: the page at its printed size.
 */
const CSS_UNITS = 96 / 72;

const SCALE_MIN = 0.15;
const SCALE_MAX = 6;
/** One press of the +/− buttons. Multiplicative, so a step is a step at any size. */
const SCALE_STEP = 1.2;

const clampScale = (value: number) =>
  Math.min(Math.max(value, SCALE_MIN), SCALE_MAX);

/**
 * How the document is sized to the pane. `none` is a size the reader chose, and
 * every gesture and button lands there; the two fits recompute themselves when
 * the pane changes, which is what makes them survive a phone being turned.
 */
type Fit = "width" | "page" | "none";

/** One page's size in CSS pixels, plus the height of everything scrolled. */
type Natural = { pageWidth: number; pageHeight: number; contentHeight: number };

type Box = { width: number; height: number };

export function MaterialDocument({
  url,
  kind,
  title,
  onReachedEnd,
}: {
  url: string;
  kind: FileKind;
  title: string;
  onReachedEnd?: (atEnd: boolean) => void;
}) {
  return kind === "pdf" ? (
    <PdfViewer url={url} title={title} onReachedEnd={onReachedEnd} />
  ) : (
    <DocxViewer url={url} />
  );
}

/* ---------------------------------- zoom --------------------------------- */

/**
 * The zoom state, and every way a reader changes it.
 *
 * Shared by both viewers because the behaviour has to be identical — a reader
 * does not know or care that one document is a canvas and the other is a tree
 * of divs — and because the fiddly parts (anchoring, gesture plumbing) are
 * worth writing once.
 *
 * `natural` is null until the document has been measured; until then there is
 * nothing to fit to and the scale stays where it is.
 */
function useDocumentZoom(natural: Natural | null) {
  const scroller = useRef<HTMLDivElement>(null);

  const [box, setBox] = useState<Box>({ width: 0, height: 0 });
  const [fit, setFit] = useState<Fit>("width");
  /** Only meaningful while `fit` is "none" — the size the reader chose. */
  const [chosen, setChosen] = useState(1);

  /**
   * The pane, measured rather than guessed from a breakpoint: its width depends
   * on the sidebar, and its height on the header above it. `contentRect` is the
   * content box, so the padding is already out of both.
   */
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setBox({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /**
   * A fit is **derived, not remembered**: it is recomputed from the pane on
   * every render, so it stays a fit when the sidebar opens or a phone is
   * turned, and nothing has to notice that and write a new number down.
   */
  const fitted = useMemo(() => {
    if (!natural || box.width === 0) return null;

    const byWidth = box.width / natural.pageWidth;
    return clampScale(
      fit === "page"
        ? Math.min(byWidth, box.height / natural.pageHeight)
        : byWidth,
    );
  }, [box, fit, natural]);

  const scale = fit === "none" ? chosen : (fitted ?? chosen);

  /**
   * The live scale, for the gestures. They fire between renders and often
   * several times in one frame, so `apply` writes here as well as to state —
   * otherwise the second event of a fast pinch would compute from the size
   * before the first one.
   */
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  /**
   * Zooming keeps whatever was under the pointer under the pointer.
   *
   * Without this the view jumps to a different part of the page on every step,
   * because a scroll offset means something different once the content has
   * changed size. The correction has to happen after the new size is laid out
   * but before the browser paints, hence `useLayoutEffect`.
   */
  const anchor = useRef<{ x: number; y: number; factor: number } | null>(null);

  useLayoutEffect(() => {
    const element = scroller.current;
    const pending = anchor.current;
    if (!element || !pending) return;

    anchor.current = null;
    element.scrollLeft = (element.scrollLeft + pending.x) * pending.factor - pending.x;
    element.scrollTop = (element.scrollTop + pending.y) * pending.factor - pending.y;
  });

  /**
   * Every path to a new scale goes through here, so none of them can forget to
   * leave the fit behind or to hold the anchor point still. `at` is a point
   * inside the pane; without one the pane's centre is held instead, which is
   * what the buttons and the keyboard want.
   *
   * A pending correction is multiplied rather than replaced: two wheel notches
   * in one frame are one correction of both, and overwriting would drop the
   * first.
   */
  const zoomTo = useCallback((next: number, at?: { x: number; y: number }) => {
    const element = scroller.current;
    const current = scaleRef.current;
    const clamped = clampScale(next);
    if (Math.abs(clamped - current) < 0.0005) return;

    if (element) {
      const pending = anchor.current;
      const factor = clamped / current;
      anchor.current = {
        x: at?.x ?? element.clientWidth / 2,
        y: at?.y ?? element.clientHeight / 2,
        factor: pending ? pending.factor * factor : factor,
      };
    }

    scaleRef.current = clamped;
    setFit("none");
    setChosen(clamped);
  }, []);

  const zoomBy = useCallback(
    (factor: number) => zoomTo(scaleRef.current * factor),
    // `zoomTo` is stable; the scale is read from the ref at call time.
    [zoomTo],
  );

  const chooseFit = useCallback((next: Fit) => {
    setFit(next);
    // A fit means "show me the document from the start", so the horizontal
    // scroll a zoom left behind would be a document apparently missing a margin.
    const element = scroller.current;
    if (element) element.scrollLeft = 0;
  }, []);

  /**
   * A pinch in progress, previewed with a transform and committed on release.
   *
   * Not committed as it goes, for a reason that only shows up on a touchscreen:
   * `react-pdf` keys its canvas on the scale, so every committed step
   * **remounts** the canvas — and a touch sequence keeps being delivered to the
   * element it started on, which by then no longer exists. The gesture died
   * after one step. Scaling the wrapper instead re-renders nothing, so the
   * fingers keep their target, and the real render happens once at the end
   * instead of on every frame of the pinch.
   */
  const content = useRef<HTMLDivElement>(null);
  const pinch = useRef<{
    spread: number;
    base: number;
    factor: number;
    at: { x: number; y: number };
    origin: string;
  } | null>(null);

  /**
   * The gestures, all registered by hand rather than through React's props,
   * because every one of them has to `preventDefault` and React's wheel and
   * touch listeners are passive — a passive listener may not, and without that
   * the *browser* zooms, taking the whole page with it. That is the bug this
   * exists to fix, so it is worth the effect.
   */
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;

    const pointIn = (clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    /** ⌘/Ctrl + wheel — which is also what a trackpad pinch sends in Chrome. */
    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return; // a plain wheel still scrolls
      event.preventDefault();

      /**
       * Exponential, so one notch is the same *proportional* step at 50% as at
       * 300%. The delta is capped first because the raw number is wildly
       * inconsistent between devices — a mouse wheel reports ~120 per notch and
       * some report far more, and feeding that straight in took the zoom from
       * 140% to 300% in a single flick. Capped and damped, a notch is about 13%.
       *
       * Committed as it goes rather than previewed: a wheel event is delivered
       * to whatever is under the pointer at the time, so unlike a pinch it does
       * not mind the canvas being replaced underneath it.
       */
      const step = Math.max(Math.min(event.deltaY, 60), -60);
      zoomTo(
        scaleRef.current * Math.exp(-step / 500),
        pointIn(event.clientX, event.clientY),
      );
    }

    function begin(clientX: number, clientY: number, spread: number) {
      const box = content.current?.getBoundingClientRect();
      pinch.current = {
        spread,
        base: scaleRef.current,
        factor: 1,
        at: pointIn(clientX, clientY),
        origin: box
          ? `${clientX - box.left}px ${clientY - box.top}px`
          : "center",
      };
    }

    function move(factor: number) {
      const gesture = pinch.current;
      const element = content.current;
      if (!gesture) return;

      // Clamped here as well as on commit, so a pinch that runs past the limit
      // stops there rather than springing back when the fingers lift.
      gesture.factor = clampScale(gesture.base * factor) / gesture.base;

      if (element) {
        element.style.transformOrigin = gesture.origin;
        element.style.transform = `scale(${gesture.factor})`;
      }
    }

    function end() {
      const gesture = pinch.current;
      const element = content.current;
      pinch.current = null;

      if (element) {
        element.style.transform = "";
        element.style.transformOrigin = "";
      }
      if (gesture) zoomTo(gesture.base * gesture.factor, gesture.at);
    }

    /**
     * Safari sends its own gesture events for a trackpad pinch and no
     * ctrl+wheel at all, so without these three a pinch on a Mac zooms the
     * window. They are not in the DOM typings, hence the local shape.
     */
    type Gesture = Event & { scale: number; clientX: number; clientY: number };

    function onGestureStart(event: Event) {
      event.preventDefault();
      const gesture = event as Gesture;
      begin(gesture.clientX, gesture.clientY, 1);
    }

    function onGestureChange(event: Event) {
      event.preventDefault();
      move((event as Gesture).scale);
    }

    function onGestureEnd(event: Event) {
      event.preventDefault();
      end();
    }

    /**
     * Two fingers on a touchscreen. `touch-action: pan-x pan-y` on the pane is
     * the other half of this: it leaves one-finger scrolling to the browser
     * while taking the pinch away from it, so the page behind can no longer be
     * zoomed by a gesture that started on the document.
     */
    const spreadOf = (touches: TouchList) =>
      Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
      );

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 2) return;
      const [a, b] = [event.touches[0], event.touches[1]];
      begin(
        (a.clientX + b.clientX) / 2,
        (a.clientY + b.clientY) / 2,
        spreadOf(event.touches),
      );
    }

    function onTouchMove(event: TouchEvent) {
      const gesture = pinch.current;
      if (!gesture || event.touches.length !== 2) return;
      event.preventDefault();

      const spread = spreadOf(event.touches);
      if (spread > 0) move(spread / gesture.spread);
    }

    function onTouchEnd(event: TouchEvent) {
      if (pinch.current && event.touches.length < 2) end();
    }

    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("gesturestart", onGestureStart, { passive: false });
    element.addEventListener("gesturechange", onGestureChange, { passive: false });
    element.addEventListener("gestureend", onGestureEnd, { passive: false });
    element.addEventListener("touchstart", onTouchStart, { passive: false });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd);
    element.addEventListener("touchcancel", onTouchEnd);

    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("gesturestart", onGestureStart);
      element.removeEventListener("gesturechange", onGestureChange);
      element.removeEventListener("gestureend", onGestureEnd);
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [zoomTo]);

  return { scroller, content, box, scale, fit, zoomBy, zoomTo, chooseFit };
}

/**
 * The keys, on the pane rather than on the window.
 *
 * Zooming is bound to the plain keys rather than to ⌘/Ctrl + and −: those are
 * the browser's own, a student may well want them, and taking them would be the
 * same overreach in the other direction as the pinch bug.
 */
function useDocumentKeys(handlers: {
  onPrevious?: () => void;
  onNext?: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
}) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const keys = latest.current;

      if (event.key === "ArrowLeft") keys.onPrevious?.();
      if (event.key === "ArrowRight") keys.onNext?.();
      if (event.key === "+" || event.key === "=") keys.onZoomIn();
      if (event.key === "-" || event.key === "_") keys.onZoomOut();
      if (event.key === "0") keys.onFitWidth();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/* ---------------------------------- PDF ---------------------------------- */

function PdfViewer({
  url,
  title,
  onReachedEnd,
}: {
  url: string;
  title: string;
  onReachedEnd?: (atEnd: boolean) => void;
}) {
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [natural, setNatural] = useState<Natural | null>(null);
  const [failed, setFailed] = useState(false);

  const { scroller, content, box, scale, fit, zoomBy, zoomTo, chooseFit } =
    useDocumentZoom(natural);

  // One page at a time, not every page at once: a canvas per page would mean
  // a 200-page handout allocating 200 of them before anything is readable.
  const go = useCallback(
    (to: number) => setPage(Math.min(Math.max(to, 1), pages || 1)),
    [pages],
  );

  /**
   * Tell the caller when the last page is the one on screen.
   *
   * `pages > 0` guards the moment before the document has loaded, when `page`
   * and `pages` are both at their initial values and a one-page document would
   * otherwise read as finished before it had rendered. A single-page PDF is
   * legitimately "at the end" as soon as it opens, which is the same answer the
   * reading pane gives for text too short to scroll.
   */
  useEffect(() => {
    if (!onReachedEnd) return;
    onReachedEnd(pages > 0 && page >= pages);
  }, [onReachedEnd, page, pages]);

  useDocumentKeys({
    onPrevious: () => go(page - 1),
    onNext: () => go(page + 1),
    onZoomIn: () => zoomBy(SCALE_STEP),
    onZoomOut: () => zoomBy(1 / SCALE_STEP),
    onFitWidth: () => chooseFit("width"),
  });

  /**
   * Pages in one PDF are not all the same size, so this is read from the page
   * on screen rather than once from the document. `originalWidth` is the page
   * in points with its rotation applied; the rest of this file works in CSS
   * pixels, which is what `CSS_UNITS` converts it to.
   */
  const onPageLoad = useCallback(
    (loaded: { originalWidth: number; originalHeight: number }) => {
      const pageWidth = loaded.originalWidth * CSS_UNITS;
      const pageHeight = loaded.originalHeight * CSS_UNITS;

      setNatural((current) =>
        current &&
        Math.abs(current.pageWidth - pageWidth) < 0.5 &&
        Math.abs(current.pageHeight - pageHeight) < 0.5
          ? current
          : { pageWidth, pageHeight, contentHeight: pageHeight },
      );
    },
    [],
  );

  if (failed) return <ViewerError />;

  return (
    // `min-h-0 flex-1`, not `h-full`: this sits below the stage's heading, so
    // 100% of the stage would be the heading's height too much and the toolbar
    // at the bottom would be clipped by the pane's `overflow-hidden`.
    <div className="flex min-h-0 flex-1 flex-col">
      <DocumentPane ref={scroller}>
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setPages(numPages)}
          onLoadError={() => setFailed(true)}
          loading={<ViewerLoading />}
          error={<ViewerError />}
          // `min-w-max` and not `justify-center` alone: a flex item wider than
          // its centred container overflows on *both* sides, and the half that
          // goes off the left cannot be scrolled back to. Growing the container
          // to the content keeps the whole page reachable when zoomed in.
          className="flex min-w-max justify-center"
        >
          {/*
            The box is sized by us, and that is not decoration: changing the
            width unmounts the old canvas while pdf.js draws the new one, and
            for those frames the document has no height at all. The browser
            clamps the scroll to fit what is left, so every zoom step threw the
            reader back to the top of the page — the correction in
            `useDocumentZoom` had nothing left to correct. Holding the space
            the page is about to take keeps the scroll where it was.
          */}
          <div
            ref={content}
            style={
              natural
                ? {
                    width: natural.pageWidth * scale,
                    height: natural.pageHeight * scale,
                  }
                : undefined
            }
            className="overflow-hidden"
          >
            <Page
              pageNumber={page}
              // Until the page has been measured, the pane's width — which is
              // what the default fit is about to work out anyway, so the first
              // paint is the right size rather than a jump.
              width={natural ? natural.pageWidth * scale : box.width || undefined}
              onLoadSuccess={onPageLoad}
              loading={<ViewerLoading />}
              className="shadow-sm [&>canvas]:rounded-md"
              renderAnnotationLayer
              renderTextLayer
            />
          </div>
        </Document>
      </DocumentPane>

      <Toolbar
        scale={scale}
        fit={fit}
        onFit={chooseFit}
        onActualSize={() => zoomTo(1)}
        onZoomIn={() => zoomBy(SCALE_STEP)}
        onZoomOut={() => zoomBy(1 / SCALE_STEP)}
        pages={
          <>
            <ToolbarButton
              label="Previous page"
              onClick={() => go(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft size={16} aria-hidden />
            </ToolbarButton>

            <p
              className="min-w-24 text-center text-xs font-semibold tabular-nums text-ink-700"
              aria-live="polite"
            >
              {pages ? `Page ${page} of ${pages}` : "Loading…"}
            </p>

            <ToolbarButton
              label="Next page"
              onClick={() => go(page + 1)}
              disabled={!pages || page >= pages}
            >
              <ChevronRight size={16} aria-hidden />
            </ToolbarButton>
          </>
        }
      />

      <span className="sr-only">{title}</span>
    </div>
  );
}

/* ---------------------------------- DOCX --------------------------------- */

function DocxViewer({ url }: { url: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [natural, setNatural] = useState<Natural | null>(null);

  const { scroller, content, scale, fit, zoomBy, zoomTo, chooseFit } =
    useDocumentZoom(natural);

  useDocumentKeys({
    onZoomIn: () => zoomBy(SCALE_STEP),
    onZoomOut: () => zoomBy(1 / SCALE_STEP),
    onFitWidth: () => chooseFit("width"),
  });

  useEffect(() => {
    let cancelled = false;
    const element = host.current;
    if (!element) return;

    async function render() {
      try {
        // Imported here rather than at the top so the parser is fetched only by
        // the students who actually open a Word document.
        const { renderAsync } = await import("docx-preview");
        const response = await fetch(url);
        if (!response.ok) throw new Error(String(response.status));

        const blob = await response.blob();
        if (cancelled || !element) return;

        element.replaceChildren();
        await renderAsync(blob, element, undefined, {
          className: "docx",
          inWrapper: true,
          // The document's own page breaks, so it reads like the file rather
          // than one endless column.
          breakPages: true,
          ignoreHeight: false,
          ignoreWidth: false,
        });

        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [url]);

  /**
   * A Word page has a real size — 8.27 inches across for A4 — and
   * `docx-preview` writes it out in centimetres, so the rendered page already
   * *is* the document at 100%. Measuring it is what lets the fits and the
   * percentage mean the same thing here as they do for a PDF.
   *
   * Layout boxes, which a CSS transform does not touch, so this measures the
   * unscaled document however far it is currently zoomed. Observed rather than
   * read once because images and fonts land after the first paint.
   */
  useEffect(() => {
    const element = host.current;
    if (!element || state !== "ready") return;

    const measure = () => {
      const first = element.querySelector<HTMLElement>(".docx");
      if (!first || first.offsetWidth === 0) return;

      /**
       * A `.docx` element is one *section*, not one page: `breakPages` splits
       * on the breaks the document actually contains, so a file written
       * without any is a single section metres long. Its `min-height` is the
       * page height though — `docx-preview` writes the paper size there — so
       * that is what Fit page has to use. `offsetHeight` is the fallback for a
       * section that has somehow lost it.
       */
      const paper = parseFloat(getComputedStyle(first).minHeight);

      const next: Natural = {
        pageWidth: first.offsetWidth,
        pageHeight: Number.isFinite(paper) && paper > 0 ? paper : first.offsetHeight,
        contentHeight: element.offsetHeight,
      };

      setNatural((current) =>
        current &&
        current.pageWidth === next.pageWidth &&
        current.pageHeight === next.pageHeight &&
        current.contentHeight === next.contentHeight
          ? current
          : next,
      );
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [state]);

  const sized = useMemo(
    () =>
      natural
        ? {
            width: natural.pageWidth * scale,
            height: natural.contentHeight * scale,
          }
        : undefined,
    [natural, scale],
  );

  if (state === "failed") return <ViewerError />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DocumentPane ref={scroller}>
        {state === "loading" ? <ViewerLoading /> : null}

        {/* The sizer carries the scaled footprint so the pane has something to
            scroll; the host inside it is the document at its own size, drawn
            smaller or larger by one transform. Scaling the *rendered* markup
            rather than re-laying it out is what keeps the page breaks, the
            columns and the tables exactly where the document put them — and
            text stays sharp at any size, because it is still text. */}
        <div className="flex min-w-max justify-center">
          <div
            ref={content}
            style={sized}
            className={cn("relative", state !== "ready" && "hidden")}
          >
            {/* Absolutely positioned, because a transform does not change what
                an element occupies: left in flow, the unscaled document would
                still reserve its full height and leave a shrunk page scrolling
                past empty space. The sizer above carries the scaled footprint
                instead.

                `docx-preview` writes its own markup and injects its own
                stylesheet; `docx-host` is the hook the overrides in globals.css
                use to replace the library's grey page gutter. */}
            <div
              ref={host}
              className="docx-host absolute left-0 top-0 origin-top-left"
              style={{ width: "max-content", transform: `scale(${scale})` }}
            />
          </div>
        </div>
      </DocumentPane>

      <Toolbar
        scale={scale}
        fit={fit}
        onFit={chooseFit}
        onActualSize={() => zoomTo(1)}
        onZoomIn={() => zoomBy(SCALE_STEP)}
        onZoomOut={() => zoomBy(1 / SCALE_STEP)}
      />
    </div>
  );
}

/* --------------------------------- shared -------------------------------- */

/**
 * The one thing that scrolls.
 *
 * Zooming grows the content inside it and never the page, which is what keeps
 * the toolbar below in view — a document you have zoomed into is exactly when
 * you need the controls, and a taller page would push them off the bottom.
 */
function DocumentPane({
  ref,
  children,
}: {
  ref: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={ref}
      // `pan-x pan-y` leaves one-finger scrolling to the browser and takes the
      // pinch away from it, so a two-finger gesture on the document can no
      // longer zoom the whole window — see `useDocumentZoom`. Written here
      // rather than as two Tailwind utilities, which would each set the whole
      // property and so cancel one another.
      style={{ touchAction: "pan-x pan-y" }}
      // `overscroll-contain` so reaching the end of the document doesn't hand
      // the scroll to the page behind it.
      className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-xl border border-border bg-ink-50 p-3"
    >
      {children}
    </div>
  );
}

/** The toolbar is ours, which was the point of dropping the embed. */
function Toolbar({
  scale,
  fit,
  onFit,
  onActualSize,
  onZoomIn,
  onZoomOut,
  pages,
}: {
  scale: number;
  fit: Fit;
  onFit: (fit: Fit) => void;
  onActualSize: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** Page back / forward, for the viewer that pages. A Word file scrolls. */
  pages?: React.ReactNode;
}) {
  return (
    <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex items-center gap-1">{pages}</div>

      <div className="flex flex-wrap items-center gap-1">
        <FitButton
          active={fit === "width"}
          onClick={() => onFit("width")}
          icon={MoveHorizontal}
          label="Fit width"
        />
        <FitButton
          active={fit === "page"}
          onClick={() => onFit("page")}
          icon={Scan}
          label="Fit page"
        />

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        <ToolbarButton
          label="Zoom out"
          onClick={onZoomOut}
          disabled={scale <= SCALE_MIN}
        >
          <Minus size={16} aria-hidden />
        </ToolbarButton>

        {/* The readout is a button, because "100%" is a place a reader wants to
            go back to — the document at the size it prints. */}
        <button
          type="button"
          onClick={onActualSize}
          title="Actual size"
          className="min-w-14 rounded-md px-1 py-1 text-center text-xs font-semibold tabular-nums text-ink-700 transition-colors hover:bg-ink-100"
        >
          {Math.round(scale * 100)}%
        </button>

        <ToolbarButton
          label="Zoom in"
          onClick={onZoomIn}
          disabled={scale >= SCALE_MAX}
        >
          <Plus size={16} aria-hidden />
        </ToolbarButton>
      </div>
    </div>
  );
}

function FitButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof MoveHorizontal;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-brand-600 bg-brand-50 text-brand-700"
          : "border-border bg-surface text-ink-700 hover:bg-ink-50 hover:text-ink-900",
      )}
    >
      <Icon size={14} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </button>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-md border border-border bg-surface p-1.5 text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ViewerLoading() {
  return (
    <div className="flex h-full min-h-64 items-center justify-center gap-2 text-sm text-ink-500">
      <Loader2 size={16} aria-hidden className="animate-spin" />
      Opening the document…
    </div>
  );
}

/**
 * Never a dead end: the header above this always carries a download, so a
 * document the renderer cannot handle is still a document the student can read.
 */
function ViewerError() {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 px-6 text-center">
      <TriangleAlert size={20} aria-hidden className="text-warning-700" />
      <p className="text-sm font-semibold text-ink-900">
        This document couldn&apos;t be shown here.
      </p>
      <p className="text-xs text-ink-500">
        Download it with the link above — it will open on your computer.
      </p>
    </div>
  );
}
