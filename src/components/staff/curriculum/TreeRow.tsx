/**
 * One row of the authoring tree.
 *
 * The row itself is the link, not a chevron at the end of it — the whole point
 * of the screen is walking down the tree, so the target should be as large as
 * the thing you are aiming at. Rows that lead nowhere render as plain
 * containers rather than dead links, which is the same rule the staff sidebar
 * follows for its unbuilt screens.
 */
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

export function TreeRow({
  href,
  icon: Icon,
  eyebrow,
  title,
  meta,
  badges,
  trailing,
  aside,
}: {
  href?: string;
  icon?: LucideIcon;
  /** Small label above the title — "Module 2", "Course 4". */
  eyebrow?: string;
  title: string;
  /** The quiet line under the title: counts, duration, due date. */
  meta?: React.ReactNode;
  badges?: React.ReactNode;
  trailing?: React.ReactNode;
  /**
   * Controls that act on the row — move, edit — rendered *beside* the link
   * rather than inside it. A button nested in an anchor is invalid markup and
   * behaves differently in every browser, so the row splits instead.
   */
  aside?: React.ReactNode;
}) {
  const body = (
    <>
      {Icon ? (
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon size={16} aria-hidden />
        </span>
      ) : null}

      <span className="min-w-0 flex-1">
        {eyebrow ? (
          <span className="block text-xs font-semibold uppercase tracking-wide text-ink-500">
            {eyebrow}
          </span>
        ) : null}

        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink-900">{title}</span>
          {badges}
        </span>

        {meta ? (
          <span className="mt-1 block text-sm text-ink-600">{meta}</span>
        ) : null}
      </span>

      {trailing ? (
        <span className="shrink-0 self-center text-sm text-ink-600">
          {trailing}
        </span>
      ) : null}

      {href ? (
        <ChevronRight
          size={16}
          aria-hidden
          className="shrink-0 self-center text-ink-400"
        />
      ) : null}
    </>
  );

  const className =
    "flex w-full gap-3 rounded-xl border border-border bg-surface p-4 text-left shadow-sm";

  const row = href ? (
    <Link
      href={href}
      className={`${className} transition-colors hover:border-border-strong hover:bg-surface-muted`}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );

  if (!aside) return row;

  return (
    <div className="flex items-stretch gap-2">
      <div className="min-w-0 flex-1">{row}</div>
      {aside}
    </div>
  );
}

/** The stack every tree screen puts its rows in. */
export function TreeList({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

/** A labelled group of rows — "Modules", "Assignments", "Final test". */
export function TreeSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink-900">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-ink-600">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
