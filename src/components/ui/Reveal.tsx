"use client";

import { MotionConfig, motion } from "framer-motion";
import type { ReactNode } from "react";

import { fadeUp, stagger } from "@/lib/motion";

/**
 * Entrance animation for a section or list. design.md §6 — 200ms fade + 8px rise,
 * once, on scroll into view.
 *
 * Always renders the motion element, never a plain-tag branch for reduced
 * motion. The server cannot know the visitor's setting, so it renders the
 * motion version at `opacity: 0`; a client that then rendered a plain tag
 * instead was an attribute mismatch React does not patch, and the content
 * stayed invisible for every reduced-motion visitor. `reducedMotion="user"`
 * does the reducing instead: the rise is dropped, only the short fade remains.
 */
export function Reveal({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "ul";
}) {
  const MotionTag = motion[as];

  return (
    <MotionConfig reducedMotion="user">
      <MotionTag
        className={className}
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.15, margin: "0px 0px -80px 0px" }}
      >
        {children}
      </MotionTag>
    </MotionConfig>
  );
}

/** A child of <Reveal>. Inherits the parent's stagger. */
export function RevealItem({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li";
}) {
  const MotionTag = motion[as];
  return (
    <MotionTag className={className} variants={fadeUp}>
      {children}
    </MotionTag>
  );
}
