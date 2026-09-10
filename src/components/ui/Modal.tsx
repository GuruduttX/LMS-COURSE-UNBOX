"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";
import { fade, modalPanel, sheet } from "@/lib/motion";
import { useMediaQuery } from "@/lib/useMediaQuery";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * design.md §5 — Modal: centred panel at `md+`, bottom sheet below, max 480px,
 * only for confirms and short focused content. Anything longer is a page.
 *
 * Carries the four things a dialog must do and is easy to forget: lock the page
 * behind it, trap Tab inside it, close on Escape, and hand focus back to
 * whatever opened it.
 *
 * (`EnquiryDialog` predates this and still has its own copy of the mechanics —
 * worth migrating when that form is next touched.)
 */
export function Modal({
  isOpen,
  onClose,
  labelledBy,
  className,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** id of the element naming the dialog — usually its heading. */
  labelledBy: string;
  className?: string;
  children: React.ReactNode;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const reduced = useReducedMotion();

  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
          <motion.div
            aria-hidden
            onClick={onClose}
            variants={reduced ? undefined : fade}
            initial="hidden"
            animate="show"
            exit="hidden"
            className="absolute inset-0 bg-night-900/60 backdrop-blur-[2px]"
          />

          <motion.div
            variants={reduced ? undefined : isDesktop ? modalPanel : sheet}
            initial="hidden"
            animate="show"
            exit="exit"
            className={cn(
              "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-lg md:max-w-lg md:rounded-2xl",
              className,
            )}
          >
            <Panel onClose={onClose} labelledBy={labelledBy}>
              {children}
            </Panel>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Split out so the effects mount with the open dialog and unmount with it —
 * that is what makes "restore focus on close" work without extra bookkeeping.
 */
function Panel({
  onClose,
  labelledBy,
  children,
}: {
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Lock the page, move focus in, and hand it back to the trigger on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const timer = window.setTimeout(
      () => panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus(),
      60,
    );

    return () => {
      document.body.style.overflow = overflow;
      window.clearTimeout(timer);
      previouslyFocused?.focus?.();
    };
  }, []);

  // Escape closes; Tab cycles inside the panel.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className="flex min-h-0 flex-col overflow-y-auto"
    >
      {children}
    </div>
  );
}
