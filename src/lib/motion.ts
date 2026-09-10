/**
 * Shared motion variants. See design.md §6 — import these instead of writing
 * per-component transitions, so timing stays consistent across the app.
 */
import type { Variants } from "framer-motion";

export const EASE_OUT_SOFT = [0.22, 1, 0.36, 1] as const;
export const EASE_IN_SOFT = [0.4, 0, 1, 1] as const;

export const DURATION = {
  fast: 0.12,
  base: 0.2,
  slow: 0.32,
} as const;

/** Default entrance for cards, list rows, and panels. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE_OUT_SOFT },
  },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.base } },
};

/** Parent wrapper for lists. Cap the list at ~8 animated children. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};

/** Modal panel (desktop). Overlay uses `fade`. */
export const modalPanel: Variants = {
  hidden: { opacity: 0, scale: 0.98, y: 8 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: DURATION.slow, ease: EASE_OUT_SOFT },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: { duration: DURATION.fast, ease: EASE_IN_SOFT },
  },
};

/** Bottom sheet / mobile drawer. */
export const sheet: Variants = {
  hidden: { y: "100%" },
  show: { y: 0, transition: { duration: DURATION.slow, ease: EASE_OUT_SOFT } },
  exit: { y: "100%", transition: { duration: DURATION.base, ease: EASE_IN_SOFT } },
};

/** Accordion body (module expand/collapse). */
export const collapse: Variants = {
  hidden: { height: 0, opacity: 0 },
  show: {
    height: "auto",
    opacity: 1,
    transition: { duration: DURATION.base, ease: EASE_OUT_SOFT },
  },
};
