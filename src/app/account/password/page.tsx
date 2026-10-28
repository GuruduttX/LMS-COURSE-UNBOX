import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/AuthShell";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { requireUser } from "@/lib/auth/guards";

/**
 * Change your own password. Two ways in: chosen from the account menu, or sent
 * here by the gate in `requireUser` because the account still carries the
 * password an admin set.
 *
 * In the second case there is no way out but through — no cancel, no nav — so
 * the temporary password cannot quietly stay in use. For a new student this is
 * the second screen they ever see, so it shares the sign-in frame.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Change password",
};

export default async function ChangePasswordPage() {
  const user = await requireUser({ skipPasswordGate: true });
  const forced = user.mustChangePassword;

  return (
    <AuthShell
      title={forced ? "Set your own password" : "Change password"}
      subtitle={
        forced
          ? "One quick step before you start: replace the temporary password you were given with one only you know."
          : `Signed in as ${user.email}.`
      }
      showBackLink={false}
    >
      <ChangePasswordForm canCancel={!forced} />
    </AuthShell>
  );
}
