import { cn } from "@/lib/cn";

/**
 * Circular progress. Used for the dashboard metric strip only — reading
 * progress inside a course is a bar plus a number (design.md §5).
 */
export function ProgressRing({
  value,
  size = 56,
  tone = "brand",
  label,
  className,
}: {
  /** 0–100. */
  value: number;
  size?: number;
  tone?: "brand" | "success" | "gold";
  /** Screen-reader label; the visible number is the percentage itself. */
  label: string;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  const strokeColor = {
    brand: "stroke-brand-600",
    success: "stroke-success-500",
    gold: "stroke-gold-500",
  }[tone];

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${clamped}%`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-sunken"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={strokeColor}
        />
      </svg>
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-ink-900"
      >
        {clamped}%
      </span>
    </div>
  );
}
