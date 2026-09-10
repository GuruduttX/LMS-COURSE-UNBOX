import type { LucideIcon } from "lucide-react";

/**
 * Nothing here — and why. An empty state that only says "no data" makes the
 * reader wonder whether it is broken; one that names the reason and the next
 * step doesn't.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-muted px-6 py-12 text-center">
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface text-ink-400">
        <Icon size={20} aria-hidden />
      </span>
      <p className="text-sm font-semibold text-ink-900">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-sm text-sm text-ink-600">{description}</p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
