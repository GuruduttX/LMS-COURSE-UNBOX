import { cn } from "@/lib/cn";

/**
 * design.md §5 — a bar is always paired with a number. A bar on its own is
 * decoration, so `label` is required, not optional.
 */
export function ProgressBar({
  value,
  label,
  tone = "brand",
  className,
}: {
  /** 0–100. */
  value: number;
  label: string;
  tone?: "brand" | "success";
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-ink-600">{label}</span>
        <span className="text-xs font-bold tabular-nums text-ink-900">
          {clamped}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-[320ms] ease-out",
            tone === "success" ? "bg-success-500" : "bg-brand-600",
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
