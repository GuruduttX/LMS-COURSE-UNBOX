import { LogOut, Settings, UserRound } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/auth/Avatar";
import { signOut } from "@/app/login/actions";
import { ROLE_LABEL, type Role } from "@/lib/auth/roles";

/** Same destinations for every role — the account screens are role-agnostic. */
const LINKS = [
  { href: "/account/profile", label: "Profile", Icon: UserRound },
  { href: "/account/settings", label: "Settings", Icon: Settings },
];

/**
 * Avatar → who you are → profile, settings, sign out. Used by both the student header and the
 * staff shell, so signing out is in the same place everywhere.
 *
 * A native `<details>`, not a client component: the app's one hydrated island
 * per screen is worth spending on the screen's actual work, and this menu has
 * to work whether or not JavaScript has arrived. Sign out is a form posting a
 * server action — never a GET link, which a link prefetcher would happily
 * "click" on the user's behalf.
 */
export function UserMenu({
  name,
  avatarUrl,
  email,
  role,
}: {
  name: string;
  avatarUrl?: string | null;
  email?: string;
  role?: Role;
}) {
  return (
    <details className="relative">
      <summary
        className="cursor-pointer list-none rounded-full marker:hidden hover:opacity-90"
        aria-label={`Account menu for ${name}`}
      >
        <Avatar name={name} src={avatarUrl} />
      </summary>

      <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
        <div className="border-b border-border p-3">
          <p className="truncate text-sm font-bold text-ink-900">{name}</p>
          {email ? (
            <p className="truncate text-xs text-ink-500">{email}</p>
          ) : null}
          {role ? (
            <p className="mt-1.5 inline-flex rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-semibold text-ink-600">
              {ROLE_LABEL[role]}
            </p>
          ) : null}
        </div>

        <div className="border-b border-border py-1">
          {LINKS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900"
            >
              <Icon size={15} aria-hidden className="text-ink-400" />
              {label}
            </Link>
          ))}
        </div>

        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            <LogOut size={15} aria-hidden className="text-ink-400" />
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
