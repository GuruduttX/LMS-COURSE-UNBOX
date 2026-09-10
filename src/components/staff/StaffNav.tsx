"use client";

import {
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  Inbox,
  Layers,
  LayoutDashboard,
  Library,
  ScrollText,
  Settings,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

import type { IconName, NavItem } from "./nav";

/**
 * The staff nav's links, sidebar and mobile tab bar both.
 *
 * A client component for exactly one reason: the active item. This used to be
 * matched against a pathname the proxy set as a request header and the layout
 * read — which is wrong, because a layout does not re-render when you navigate
 * between its own pages. The header's value was whatever the last *full* page
 * load saw, so the highlight only moved when you reloaded. `usePathname` always
 * has the current path.
 *
 * The items still come from the server, already filtered by capability, so the
 * client is never handed a nav entry the user may not see. Icons travel as
 * names because a component reference cannot cross the boundary.
 */
const ICONS: Record<IconName, LucideIcon> = {
  overview: LayoutDashboard,
  people: UsersRound,
  programs: Library,
  students: GraduationCap,
  tasks: ClipboardList,
  batches: Layers,
  sessions: CalendarClock,
  enquiries: Inbox,
  audit: ScrollText,
  settings: Settings,
  grading: ClipboardCheck,
};

export function StaffSidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.href}>
          <SidebarItem item={item} isActive={isActive(item, pathname)} />
        </li>
      ))}
    </ul>
  );
}

export function StaffTabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <ul className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
      {items.map((item) => (
        <li key={item.href}>
          <TabItem item={item} isActive={isActive(item, pathname)} />
        </li>
      ))}
    </ul>
  );
}

function SidebarItem({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = ICONS[item.icon];

  const content = (
    <>
      <Icon
        size={17}
        aria-hidden
        className={isActive ? undefined : "text-ink-400"}
      />
      {item.label}
      {item.soon ? (
        <span className="ml-auto rounded-full bg-ink-100 px-1.5 py-0.5 text-2xs font-semibold text-ink-500">
          Soon
        </span>
      ) : null}
    </>
  );

  // Not built yet: shown, disabled, and honest about why. Never a link to a 404.
  if (item.soon) {
    return (
      <span
        aria-disabled
        title="Not built yet"
        className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-400"
      >
        {content}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "border-l-[3px] border-brand-600 bg-brand-50 pl-[9px] font-semibold text-brand-700"
          : "text-ink-700 hover:bg-ink-100 hover:text-ink-900",
      )}
    >
      {content}
    </Link>
  );
}

function TabItem({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = ICONS[item.icon];

  const inner = (
    <>
      <Icon size={19} aria-hidden />
      <span className="text-[11px] font-medium leading-none">{item.label}</span>
    </>
  );

  if (item.soon) {
    return (
      <span
        aria-disabled
        className="flex h-14 cursor-not-allowed flex-col items-center justify-center gap-1 text-ink-300"
      >
        {inner}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex h-14 flex-col items-center justify-center gap-1",
        isActive ? "text-brand-700" : "text-ink-500",
      )}
    >
      {inner}
    </Link>
  );
}

/**
 * The area's landing page matches only exactly; every other item matches its
 * subtree, so /admin/people/new still lights up "People".
 */
function isActive(item: NavItem, pathname: string): boolean {
  const isLanding = item.href.split("/").length === 2;
  return isLanding
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
