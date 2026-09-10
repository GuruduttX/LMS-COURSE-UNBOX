import { GraduationCap } from "lucide-react";
import Link from "next/link";

import { UserMenu } from "@/components/auth/UserMenu";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { CurrentUser } from "@/lib/auth/guards";
import { switchStaffView } from "@/lib/staff-view-actions";
import { getTheme } from "@/lib/theme-server";

import { StaffSidebarNav, StaffTabBar } from "./StaffNav";
import { areaSwitchesFor, navFor, AREA_HOME, AREA_LABEL, type Area } from "./nav";

/**
 * The app shell from design.md §5, finally worth building: left sidebar from
 * `lg`, bottom tab bar below, 64px top bar with the account menu.
 *
 * A server component — the nav is decided once per request from the user's
 * capabilities. Only the links themselves are a client island (StaffNav), which
 * needs `usePathname` to mark the active item; everything else, this file
 * included, stays out of the browser bundle.
 *
 * `area` is the shell the user is wearing, already resolved by StaffLayout —
 * not the URL prefix. An admin stays in the admin shell while working in
 * /manager or /teacher screens; the switcher at the foot of the rail is the
 * only thing that changes it.
 */
export async function StaffShell({
  user,
  area,
  children,
}: {
  user: CurrentUser;
  area: Area;
  children: React.ReactNode;
}) {
  const items = navFor(area, user);
  const switches = areaSwitchesFor(user, area);
  const tabs = items.filter((item) => item.primary).slice(0, 5);
  const theme = await getTheme();

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/*
        Sidebar — 17rem ≈ design.md's 272px.

        Sticky and exactly one viewport tall, so it is the *rail* that is fixed
        and the page that scrolls past it. Left as a plain flex child it took
        its height from the content beside it, which meant a long form dragged
        the nav down with it and you had to scroll back up to reach it.

        Height is pinned here, so anything inside that outgrows the viewport —
        a long nav on a small laptop — scrolls within the rail instead of
        pushing the footer blocks off the bottom.
      */}
      <aside className="hidden w-[17rem] shrink-0 border-r border-border bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
          <Link
            href={AREA_HOME[area]}
            className="flex items-center gap-2.5"
            aria-label="Course Unbox"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-solid text-white">
              <GraduationCap size={20} aria-hidden />
            </span>
            <span className="text-sm font-extrabold tracking-tight text-ink-900">
              COURSE <span className="text-brand-600">UNBOX</span>
            </span>
          </Link>
        </div>

        {/* The one part that may overflow, and therefore the only part that
            scrolls: the links. The logo above and the settings below stay put. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="px-5 pt-5 text-2xs font-bold uppercase tracking-wider text-ink-400">
            {AREA_LABEL[area]}
          </p>

          <nav aria-label={`${AREA_LABEL[area]} navigation`} className="p-3">
            <StaffSidebarNav items={items} />
          </nav>
        </div>

        {/* Appearance and the view switcher both live at the foot of the rail —
            settings-shaped things, below the navigation rather than inside it. */}
        <div className="shrink-0 border-t border-border p-3">
          <p className="px-2 pb-2 text-2xs font-bold uppercase tracking-wider text-ink-400">
            Appearance
          </p>
          <ThemeToggle value={theme} variant="full" />
        </div>

        {switches.length > 0 ? (
          <div className="shrink-0 border-t border-border p-3">
            <p className="px-2 pb-2 text-2xs font-bold uppercase tracking-wider text-ink-400">
              Switch view
            </p>
            <ul className="space-y-1">
              {switches.map((item) => (
                <li key={item.area}>
                  {/* A form, not a link: switching views writes a cookie, and a
                      GET Next might prefetch must not do that. */}
                  <form action={switchStaffView}>
                    <input type="hidden" name="area" value={item.area} />
                    <button
                      type="submit"
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
                    >
                      {item.label}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-6">
          <Link
            href={AREA_HOME[area]}
            className="flex items-center gap-2.5 lg:hidden"
            aria-label="Course Unbox"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-solid text-white">
              <GraduationCap size={20} aria-hidden />
            </span>
            <span className="text-sm font-extrabold tracking-tight text-ink-900">
              {AREA_LABEL[area]}
            </span>
          </Link>

          <p className="hidden text-sm font-semibold text-ink-500 lg:block">
            {AREA_LABEL[area]}
          </p>

          <div className="flex items-center gap-2">
            {/* The sidebar copy is lg-only, so mobile needs its own. */}
            <ThemeToggle value={theme} className="lg:hidden" />
            <UserMenu
              name={user.name}
              avatarUrl={user.avatarUrl}
              email={user.email}
              role={user.role}
            />
          </div>
        </header>

        {/* pb-20 below lg so the tab bar never covers the last card. */}
        <main
          id="main"
          className="flex-1 px-4 py-6 pb-24 md:px-6 md:py-8 lg:pb-8"
        >
          {children}
        </main>
      </div>

      <nav
        aria-label={`${AREA_LABEL[area]} navigation`}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <StaffTabBar items={tabs} />
      </nav>
    </div>
  );
}
