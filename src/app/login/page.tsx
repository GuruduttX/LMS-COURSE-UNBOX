import { GraduationCap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

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
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center px-4 py-10"
    >
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mx-auto flex w-fit items-center gap-2.5"
          aria-label="Course Unbox home"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-solid text-white">
            <GraduationCap size={22} aria-hidden />
          </span>
          <span className="text-base font-extrabold tracking-tight text-ink-900">
            COURSE <span className="text-brand-600">UNBOX</span>
          </span>
        </Link>

        <div className="mt-8 rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-extrabold tracking-tight text-ink-900">
            Sign in
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Use the account your program team set up for you.
          </p>

          <div className="mt-6">
            <LoginForm next={next} />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-ink-500">
          Trouble signing in? Email{" "}
          <a
            href="mailto:support@courseunbox.com"
            className="font-semibold text-brand-600 hover:text-brand-700"
          >
            support@courseunbox.com
          </a>
        </p>
      </div>
    </main>
  );
}
