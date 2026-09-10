import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { ProgressRing } from "@/components/ui/ProgressRing";
import { cn } from "@/lib/cn";
import type { CourseOverview, Metric } from "@/lib/data/course-overview";

type MetricKey = "progress" | "score" | "attendance";

const ALL: MetricKey[] = ["progress", "score", "attendance"];

/**
 * The three numbers a student checks first: how far along, how well, how
 * present. One strip on desktop, stacked cards on mobile.
 *
 * `show` exists because the mobile tabs split them up — progress and score sit
 * with the work, attendance sits with the sessions it is measured from.
 */
export function MetricStrip({
  metrics,
  show = ALL,
  className,
}: {
  metrics: CourseOverview["metrics"];
  show?: MetricKey[];
  className?: string;
}) {
  return (
    <section
      aria-label="Your course metrics"
      className={cn(
        "grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border",
        show.length === 3 && "sm:grid-cols-3",
        show.length === 2 && "sm:grid-cols-2",
        className,
      )}
    >
      {/* Progress turns green once complete, matching the completed state elsewhere. */}
      {show.includes("progress") ? (
        <MetricTile
          label="Your progress"
          metric={metrics.progress}
          tone={metrics.progress.value >= 100 ? "success" : "brand"}
        />
      ) : null}
      {show.includes("score") ? (
        <MetricTile label="Current score" metric={metrics.score} tone="gold" />
      ) : null}
      {show.includes("attendance") ? (
        <MetricTile
          label="Session attendance"
          metric={metrics.attendance}
          tone="success"
        />
      ) : null}
    </section>
  );
}

function MetricTile({
  label,
  metric,
  tone,
}: {
  label: string;
  metric: Metric;
  tone: "brand" | "success" | "gold";
}) {
  return (
    <div className="flex items-center justify-between gap-4 bg-surface p-4 md:p-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-sm font-bold text-ink-900">{label}</h3>
          {metric.link ? (
            <Link
              href={metric.link.href}
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              {metric.link.label}
              <ChevronRight size={14} aria-hidden />
            </Link>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">{metric.note}</p>
      </div>

      <ProgressRing value={metric.value} tone={tone} label={label} />
    </div>
  );
}
