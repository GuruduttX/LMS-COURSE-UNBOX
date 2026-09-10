import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Section header: optional uppercase eyebrow, title with the brand accent bar
 * (borrowed from the reference sites), optional one-line subtitle.
 */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {eyebrow ? (
        <p className="mb-3 text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
          {eyebrow}
        </p>
      ) : null}

      <h2 className="flex items-start gap-3 text-xl font-bold leading-tight text-ink-900 md:text-2xl">
        <span
          aria-hidden
          className="mt-1 h-6 w-1 shrink-0 rounded-full bg-brand-500 md:mt-1.5 md:h-7"
        />
        <span>{title}</span>
      </h2>

      {subtitle ? (
        <p className="mt-3 pl-4 text-sm leading-relaxed text-ink-600 md:text-base">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
