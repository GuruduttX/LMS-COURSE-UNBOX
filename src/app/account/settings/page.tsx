import { KeyRound, LogOut } from "lucide-react";
import type { Metadata } from "next";

import { signOut } from "@/app/login/actions";
import { AccountCard, AccountShell } from "@/components/auth/AccountShell";
import { ButtonLink } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { requireUser } from "@/lib/auth/guards";
import { getTheme } from "@/lib/theme-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
};

/**
 * Preferences and account safety. Everything here is about *this device or this
 * login*, not about who you are — that is `/account/profile`.
 *
 * The theme control is the same component the headers use, in its labelled
 * variant: one implementation, so the setting cannot drift between the header
 * toggle and this screen.
 */
export default async function SettingsPage() {
  const [user, theme] = await Promise.all([requireUser(), getTheme()]);

  return (
    <AccountShell
      role={user.role}
      title="Settings"
      description="How the app looks, and how you get into it."
    >
      <div className="space-y-6">
        <AccountCard
          title="Appearance"
          description="System follows whatever your device is set to."
        >
          <ThemeToggle value={theme} variant="full" className="max-w-sm" />
        </AccountCard>

        <AccountCard
          title="Password"
          description="Change the password you use to sign in."
        >
          <ButtonLink href="/account/password" variant="secondary">
            <KeyRound size={15} aria-hidden />
            Change password
          </ButtonLink>
        </AccountCard>

        <AccountCard
          title="Sign out"
          description={`Ends this session for ${user.email} on this device.`}
        >
          {/* A form posting a server action — never a GET link, which a link
            prefetcher would happily "click" on the user's behalf. */}
          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-ink-800 transition-colors hover:border-danger-500 hover:text-danger-700"
            >
              <LogOut size={15} aria-hidden />
              Sign out
            </button>
          </form>
        </AccountCard>
      </div>
    </AccountShell>
  );
}
