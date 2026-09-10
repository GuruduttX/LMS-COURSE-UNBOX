import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * One number a staff member opens the app to check.
 *
 * Every tile on these screens is a real query. A hard-coded staff metric is
 * worse than no metric at all — staff act on these numbers, so a plausible
 * invented one is a lie with consequences. If the model doesn't exist yet, the
 * tile doesn't either.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  href,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: LucideIcon;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-600">{label}</p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon size={16} aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-ink-900">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </>
  );

  const className =
    "block rounded-xl border border-border bg-surface p-4 shadow-sm transition-colors";

  return href ? (
    <Link href={href} className={`${className} hover:border-border-strong`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Page title + optional lead-in, used at the top of every staff screen. */
export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-ink-900 md:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-ink-600">{description}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}
