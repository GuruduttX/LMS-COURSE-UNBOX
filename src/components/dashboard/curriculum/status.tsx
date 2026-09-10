import {
  BookOpen,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  ClipboardList,
  FileCheck2,
  Lock,
} from "lucide-react";

import { cn } from "@/lib/cn";
import type { CourseItem, Status } from "@/lib/curriculum/types";

/**
 * A course row is a module or an assignment. Tests are no longer rows — a
 * module test belongs to its module and a final test to the course, so both
 * have their own place on the panel rather than a line in the list.
 */
export type ItemType = CourseItem["type"];

/**
 * Status vocabulary shared by every row and card in the curriculum tree.
 * design.md §5 — Badge: tinted background, darker text, one word.
 */
const BADGE: Record<Status, { label: string; className: string }> = {
  completed: { label: "Completed", className: "bg-success-50 text-success-700" },
  evaluated: { label: "Evaluated", className: "bg-success-50 text-success-700" },
  submitted: { label: "Submitted", className: "bg-brand-50 text-brand-700" },
  "in-progress": { label: "In progress", className: "bg-brand-50 text-brand-700" },
  "not-started": { label: "Not started", className: "bg-ink-100 text-ink-600" },
  locked: { label: "Locked", className: "bg-ink-100 text-ink-500" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  const badge = BADGE[status];

  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-2xs font-semibold",
        badge.className,
        className,
      )}
    >
      {status === "locked" ? <Lock size={11} aria-hidden /> : null}
      {badge.label}
    </span>
  );
}

/**
 * The left-hand marker on a row. design.md: dashed circle (not started),
 * half-filled (in progress), check (done), lock (locked).
 */
export function StatusIcon({ status }: { status: Status }) {
  const size = 18;

  switch (status) {
    case "completed":
    case "evaluated":
      return <CheckCircle2 size={size} aria-hidden className="text-success-500" />;
    case "submitted":
    case "in-progress":
      return <CircleDot size={size} aria-hidden className="text-brand-600" />;
    case "locked":
      return <Lock size={size} aria-hidden className="text-ink-400" />;
    default:
      return <CircleDashed size={size} aria-hidden className="text-ink-400" />;
  }
}

/** Type marker, so a module is distinguishable from graded work at a glance. */
export function TypeIcon({
  type,
  className,
}: {
  type: ItemType;
  className?: string;
}) {
  const props = { size: 14, "aria-hidden": true, className };

  if (type === "assignment") return <ClipboardList {...props} />;
  return <BookOpen {...props} />;
}

export const TYPE_LABEL: Record<ItemType, string> = {
  module: "Module",
  assignment: "Assignment",
};

/** The marker a test row uses, wherever a test is shown on its own. */
export function TestIcon({ className }: { className?: string }) {
  return <FileCheck2 size={14} aria-hidden className={className} />;
}
