import { Bell, GraduationCap } from "lucide-react";
import Link from "next/link";

import { Container } from "@/components/ui/Container";
import { UserMenu } from "@/components/auth/UserMenu";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { getStudent } from "@/lib/data/student";
import { getTheme } from "@/lib/theme-server";

const NAV = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "My courses", href: "/dashboard" },
  { label: "Certificates", href: "/dashboard" },
];

/**
 * Signed-in top bar — deliberately minimal for now. The full app shell from
 * design.md §5 (left sidebar on desktop, bottom tab bar on mobile) lands with
 * the lesson player, when there is more than one destination worth navigating to.
 */
export async function DashboardHeader() {
  const [student, theme] = await Promise.all([getStudent(), getTheme()]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface">
      <Container>
        <div className="flex h-16 items-center justify-between gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5"
            aria-label="Course Unbox dashboard"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-solid text-white">
              <GraduationCap size={20} aria-hidden />
            </span>
            <span className="hidden text-sm font-extrabold tracking-tight text-ink-900 sm:block">
              COURSE <span className="text-brand-600">UNBOX</span>
            </span>
          </Link>

          <nav aria-label="Dashboard" className="hidden items-center gap-1 md:flex">
            {NAV.map((item, index) => (
              <Link
                key={item.label}
                href={item.href}
                aria-current={index === 0 ? "page" : undefined}
                className={
                  index === 0
                    ? "inline-flex h-10 items-center rounded-lg bg-brand-50 px-3 text-sm font-semibold text-brand-700"
                    : "inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-900"
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle value={theme} />
            <button
              type="button"
              aria-label="Notifications"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              <Bell size={20} />
            </button>
            <UserMenu
              name={student.name}
              avatarUrl={student.avatarUrl}
              role="student"
            />
          </div>
        </div>
      </Container>
    </header>
  );
}
