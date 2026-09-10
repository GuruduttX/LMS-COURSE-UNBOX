import { cn } from "@/lib/cn";

/**
 * How full a batch is — one indicator, used wherever fullness is a decision.
 *
 * design.md §5: **a bar is always paired with a number.** "Full" on its own
 * tells somebody they cannot enrol; "18 / 18 seats" tells them why, and
 * "16 / 18" tells them to hurry. So the seat count is the label and the bar is
 * the glance, never the bar alone.
 *
 * Three states rather than a percentage gradient, because there are exactly
 * three decisions: enrol into it, enrol but know it is nearly gone, or pick
 * another cohort.
 */
export function fillTone(
  enrolled: number,
  capacity: number,
): "open" | "filling" | "full" {
  if (enrolled >= capacity) return "full";
  // Within two seats, or the last tenth — whichever bites first on a small
  // cohort, which is what most of these are.
  if (capacity - enrolled <= Math.max(2, Math.round(capacity * 0.1))) {
    return "filling";
  }
  return "open";
}

export function BatchFillBadge({
  enrolled,
  capacity,
  className,
}: {
  enrolled: number;
  capacity: number;
  className?: string;
}) {
  const tone = fillTone(enrolled, capacity);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide",
        tone === "full" && "bg-danger-50 text-danger-700",
        tone === "filling" && "bg-warning-50 text-warning-700",
        tone === "open" && "bg-success-50 text-success-700",
        className,
      )}
    >
      {tone === "full"
        ? "Full"
        : tone === "filling"
          ? `${capacity - enrolled} left`
          : "Open"}
    </span>
  );
}

/** The badge plus the seat count and a bar. Used where there is room for it. */
export function BatchFillBar({
  enrolled,
  capacity,
}: {
  enrolled: number;
  capacity: number;
}) {
  const tone = fillTone(enrolled, capacity);
  const percent = Math.min(100, Math.round((enrolled / capacity) * 100));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium tabular-nums text-ink-600">
          {enrolled} / {capacity} seats
        </span>
        <BatchFillBadge enrolled={enrolled} capacity={capacity} />
      </div>
      <div
        role="progressbar"
        aria-valuenow={enrolled}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-label={`${enrolled} of ${capacity} seats taken`}
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-[320ms] ease-out",
            tone === "full" && "bg-danger-500",
            tone === "filling" && "bg-warning-500",
            tone === "open" && "bg-success-500",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The picker's one-line version: "Aug 2026 · Evening — 4 seats left".
 *
 * A `<option>` can hold text and nothing else, so the indicator has to *be*
 * the text there. Kept next to the visual badge so the two never say different
 * things about the same batch.
 */
export function batchOptionLabel(
  name: string,
  enrolled: number,
  capacity: number,
): string {
  const tone = fillTone(enrolled, capacity);
  if (tone === "full") return `${name} — full (${enrolled}/${capacity})`;
  const left = capacity - enrolled;
  return `${name} — ${left} ${left === 1 ? "seat" : "seats"} left`;
}
