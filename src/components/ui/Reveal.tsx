"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

import { fadeUp, stagger } from "@/lib/motion";

/**
 * Entrance animation for a section or list. design.md §6 — 200ms fade + 8px rise,
 * once, on scroll into view. With reduced motion the children render immediately.
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
  const reduced = useReducedMotion();
  const MotionTag = motion[as];

  if (reduced) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <MotionTag
      className={className}
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15, margin: "0px 0px -80px 0px" }}
    >
      {children}
    </MotionTag>
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
  const reduced = useReducedMotion();

  if (reduced) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  const MotionTag = motion[as];
  return (
    <MotionTag className={className} variants={fadeUp}>
      {children}
    </MotionTag>
  );
}
