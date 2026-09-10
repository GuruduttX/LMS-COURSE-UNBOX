/**
 * The publish state of a piece of content, and the icons that go with a row.
 *
 * A draft badge is the most important thing on an authoring screen: it is the
 * difference between "students are reading this" and "students cannot see this
 * at all". So it is a filled pill rather than a subtle outline, and published
 * content carries **no** badge — the normal state should be the quiet one, or
 * every row shouts.
 */
import { CircleDashed } from "lucide-react";

import { SUBTOPIC_KIND_ICON, type SubtopicKind } from "@/lib/curriculum/kinds";
import type { NodeStatus } from "@/lib/curriculum/rules";

export function NodeBadge({ status }: { status: NodeStatus }) {
  if (status === "published") return null;

  const label = status === "draft" ? "Draft" : "Archived";
  const tone =
    status === "draft"
      ? "bg-amber-100 text-amber-800"
      : "bg-ink-100 text-ink-600";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}

/** "Not ready" — a test that exists but has no questions in it yet. */
export function EmptyTestBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-600">
      <CircleDashed size={12} aria-hidden />
      No questions yet
    </span>
  );
}

export function KindIcon({
  kind,
  className = "",
}: {
  kind: SubtopicKind;
  className?: string;
}) {
  // One icon map, in kinds.ts. A second one here drifted the moment a fourth
  // kind was added.
  const Icon = SUBTOPIC_KIND_ICON[kind];
  return <Icon size={16} aria-hidden className={className} />;
}
