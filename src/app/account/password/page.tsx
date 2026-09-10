import { KeyRound } from "lucide-react";
import type { Metadata } from "next";

import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { requireUser } from "@/lib/auth/guards";

/**
 * Change your own password. Two ways in: chosen from the account menu, or sent
 * here by the gate in `requireUser` because the account still carries the
 * password an admin set.
 *
 * In the second case there is no way out but through — no cancel, no nav — so
 * the temporary password cannot quietly stay in use.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Change password",
};

export default async function ChangePasswordPage() {
  const user = await requireUser({ skipPasswordGate: true });
  const forced = user.mustChangePassword;

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center px-4 py-10"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <KeyRound size={20} aria-hidden />
        </span>

        <h1 className="mt-4 text-xl font-extrabold tracking-tight text-ink-900">
          {forced ? "Set your own password" : "Change password"}
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          {forced
            ? "This account still uses the password someone set up for you. Choose your own before carrying on."
            : "Signed in as " + user.email + "."}
        </p>

        <div className="mt-6">
          <ChangePasswordForm canCancel={!forced} />
        </div>
      </div>
    </main>
  );
}
