import {
  ArrowLeft,
  Award,
  ClipboardCheck,
  GraduationCap,
  MonitorPlay,
  PlayCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { TESTIMONIALS } from "@/lib/data/home";

/**
 * The frame around the auth screens — sign in, and setting your own password.
 *
 * Desktop is split: a brand panel on the left telling a new student what is on
 * the other side of the form, the form on the right. Mobile drops the panel
 * entirely; on a phone the form is the whole job and nothing should push it
 * below the keyboard.
 *
 * The panel uses the fixed `night-*` and `brand-solid` tokens, not the themed
 * ones, so it is the same dark panel at every hour — design.md §2 allows the
 * auth screen its one gradient.
 */

const INSIDE: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: MonitorPlay,
    title: "Live classes, recorded",
    body: "Join from your dashboard; every session is there to rewatch.",
  },
  {
    icon: PlayCircle,
    title: "Modules and lessons",
    body: "Pick up exactly where you left off, on any device.",
  },
  {
    icon: ClipboardCheck,
    title: "Assignments and marks",
    body: "Submit work, get mentor feedback, track your marksheet.",
  },
  {
    icon: Award,
    title: "Your certificate",
    body: "Issued on completion, with a link recruiters can verify.",
  },
];

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  showBackLink = true,
}: {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Off when leaving is not allowed — the forced password change. */
  showBackLink?: boolean;
}) {
  const testimonial = TESTIMONIALS[0];

  return (
    <main
      id="main"
      className="grid min-h-dvh flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
    >
      <aside className="relative hidden overflow-hidden bg-linear-to-br from-night-900 via-night-800 to-brand-solid-active p-10 text-white lg:flex lg:flex-col xl:p-14">
        {/* Faint grid, the same texture as the home hero. Decorative only. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] bg-[linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] bg-size-[48px_48px] mask-[radial-gradient(ellipse_at_top_left,black,transparent_75%)]"
        />

        <Link
          href="/"
          className="relative flex w-fit items-center gap-2.5"
          aria-label="Course Unbox home"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-solid text-white">
            <GraduationCap size={22} aria-hidden />
          </span>
          <span className="text-base font-extrabold tracking-tight">
            COURSE <span className="text-brand-400">UNBOX</span>
          </span>
        </Link>

        <div className="relative my-auto py-12">
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-night-400">
            Student portal
          </p>
          <h2 className="mt-3 max-w-md text-3xl font-extrabold leading-[1.15] tracking-tight">
            Everything for your program, in one place.
          </h2>

          <ul className="mt-10 grid gap-6 xl:grid-cols-2">
            {INSIDE.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/10">
                  <Icon size={20} aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-night-300">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <figure className="relative rounded-2xl border border-white/10 bg-white/5 p-6">
          <blockquote className="text-sm leading-relaxed text-night-300">
            &ldquo;{testimonial.quote}&rdquo;
          </blockquote>
          <figcaption className="mt-4 flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-solid text-xs font-bold text-white"
            >
              {testimonial.name
                .split(" ")
                .map((part) => part[0])
                .join("")}
            </span>
            <span>
              <span className="block text-sm font-semibold">{testimonial.name}</span>
              <span className="block text-xs text-night-400">
                {testimonial.outcome}
              </span>
            </span>
          </figcaption>
        </figure>
      </aside>

      <section className="flex flex-col bg-surface px-4 py-6 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between gap-4">
          {/* The panel carries the logo on desktop; here it is the only one. */}
          <Link
            href="/"
            className="flex items-center gap-2.5 lg:invisible"
            aria-label="Course Unbox home"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-solid text-white">
              <GraduationCap size={20} aria-hidden />
            </span>
            <span className="text-sm font-extrabold tracking-tight text-ink-900">
              COURSE <span className="text-brand-600">UNBOX</span>
            </span>
          </Link>

          {showBackLink ? (
            <Link
              href="/"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              <ArrowLeft size={16} aria-hidden />
              Back to site
            </Link>
          ) : null}
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">
            {title}
          </h1>
          <div className="mt-2 text-sm leading-relaxed text-ink-600">{subtitle}</div>

          <div className="mt-8">{children}</div>
        </div>

        {footer ? (
          <div className="mx-auto w-full max-w-sm text-center text-xs text-ink-500">
            {footer}
          </div>
        ) : null}
      </section>
    </main>
  );
}
