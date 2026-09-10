import Link from "next/link";

import { cn } from "@/lib/cn";

export type OverviewTab = "overview" | "live";

/**
 * Mobile-only split of the page into two tabs: the work, and the schedule.
 *
 * Below `lg` the two-column layout stacks, which puts the live sessions rail
 * far below the fold — a student checking whether a session is on today would
 * have to scroll past everything else. Tabs put both one tap away.
 *
 * The tab is a URL (`?tab=live`), not client state: the page stays a server
 * component, a tab is linkable, and Back returns to the previous tab. From `lg`
 * up the tabs disappear and both columns are visible at once, so the URL simply
 * stops mattering.
 */
export function OverviewTabs({
  slug,
  active,
}: {
  slug: string;
  active: OverviewTab;
}) {
  return (
    <nav
      aria-label="Overview sections"
      className="-mx-4 mt-5 border-b border-border px-4 sm:-mx-5 sm:px-5 lg:hidden"
    >
      <ul className="flex gap-6">
        <Tab
          href={`/dashboard/${slug}/overview`}
          label="Overview"
          isActive={active === "overview"}
        />
        <Tab
          href={`/dashboard/${slug}/overview?tab=live`}
          label="Live sessions"
          isActive={active === "live"}
        />
      </ul>
    </nav>
  );
}

function Tab({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        aria-current={isActive ? "true" : undefined}
        className={cn(
          "-mb-px flex h-11 items-center border-b-2 px-1 text-sm font-semibold transition-colors duration-[120ms]",
          isActive
            ? "border-brand-600 text-brand-700"
            : "border-transparent text-ink-600 hover:text-ink-900",
        )}
      >
        {label}
      </Link>
    </li>
  );
}
