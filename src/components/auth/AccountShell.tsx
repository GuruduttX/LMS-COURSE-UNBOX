import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Container } from "@/components/ui/Container";
import { ROLE_HOME, type Role } from "@/lib/auth/roles";

/**
 * The frame around the account screens (profile, settings).
 *
 * These are reached from the avatar menu, which every role shares, so the shell
 * cannot be the student header or the staff sidebar — it is a plain page with
 * one way back, to wherever this role's home happens to be.
 */
export function AccountShell({
  role,
  title,
  description,
  width = "narrow",
  header,
  children,
}: {
  role: Role;
  title: string;
  description: string;
  /** "wide" for the profile's two-column layout; "narrow" for settings. */
  width?: "narrow" | "wide";
  /** Replaces the plain title block — the profile puts its hero card here. */
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main id="main" className="flex-1 py-8 md:py-10">
      <Container>
        <div className={width === "wide" ? "" : "mx-auto max-w-2xl"}>
          <Link
            href={ROLE_HOME[role]}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 transition-colors hover:text-ink-900"
          >
            <ArrowLeft size={15} aria-hidden />
            Back
          </Link>

          {header ?? (
            <>
              <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-ink-900">
                {title}
              </h1>
              <p className="mt-1 text-sm text-ink-600">{description}</p>
            </>
          )}

          <div className="mt-6">{children}</div>
        </div>
      </Container>
    </main>
  );
}

/** One bordered block inside the shell. */
export function AccountCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <h2 className="text-sm font-bold text-ink-900">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-ink-600">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
