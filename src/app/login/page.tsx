import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentUser } from "@/lib/auth/guards";
import { ROLE_HOME } from "@/lib/auth/roles";

/**
 * The only way into the app. There is no public sign-up: staff accounts are
 * created by an admin, student accounts by enrolment.
 *
 * Already signed in? Go home rather than showing a form that would only sign
 * you in as yourself again.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in · Course Unbox",
};

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) redirect(ROLE_HOME[user.role]);

  const query = await searchParams;
  const raw = query.next;
  const next = typeof raw === "string" ? raw : "";

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue your program — classes, lessons and assignments are waiting."
      footer={
        <div className="space-y-1.5">
          <p>
            Not enrolled yet?{" "}
            <Link
              href="/#programs"
              className="font-semibold text-brand-600 hover:text-brand-700"
            >
              Explore programs
            </Link>
          </p>
          <p>
            Trouble signing in? Email{" "}
            <a
              href="mailto:support@courseunbox.com"
              className="font-semibold text-brand-600 hover:text-brand-700"
            >
              support@courseunbox.com
            </a>
          </p>
        </div>
      }
    >
      <LoginForm next={next} />
    </AuthShell>
  );
}
