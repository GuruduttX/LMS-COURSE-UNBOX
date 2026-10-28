import {
  ArrowRight,
  Award,
  CalendarClock,
  CheckCircle2,
  PlayCircle,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import Link from "next/link";

import { EnquiryButton } from "@/components/enquiry/EnquiryButton";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { STATS } from "@/lib/data/home";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-brand-50 via-surface-muted to-surface-muted">
      {/* Faint grid, purely decorative — kept low contrast so text stays dominant. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] bg-[linear-gradient(to_right,var(--color-brand-100)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-brand-100)_1px,transparent_1px)] bg-size-[56px_56px] mask-[radial-gradient(ellipse_at_top,black,transparent_70%)]"
      />

      <Container className="relative">
        <div className="grid items-center gap-12 pb-14 pt-12 md:pb-20 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-16">
          <Reveal>
            <RevealItem>
              <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-surface px-4 py-1.5 text-xs font-semibold text-brand-700 shadow-xs">
                <Sparkles size={14} aria-hidden />
                Live cohorts start every month
              </p>
            </RevealItem>

            <RevealItem>
              <h1 className="mt-6 text-3xl font-extrabold leading-[1.1] tracking-tight text-ink-900 md:text-4xl">
                Live online AI marketing courses{" "}
                <span className="relative whitespace-nowrap text-brand-600">
                  with certificate
                  <span
                    aria-hidden
                    className="absolute inset-x-0 -bottom-1 h-[6px] rounded-full bg-gold-400 md:-bottom-2"
                  />
                </span>
              </h1>
            </RevealItem>

            <RevealItem>
              <p className="mt-7 max-w-xl text-base leading-relaxed text-ink-600 md:text-lg">
                Cohort-based programs in performance marketing, SEO, AEO, GEO and
                AI — taught by working practitioners, built on real projects, from
                anywhere in the world.
              </p>
            </RevealItem>

            <RevealItem className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="#programs" size="lg" className="w-full sm:w-auto">
                Explore programs
                <ArrowRight size={18} aria-hidden />
              </ButtonLink>
              <EnquiryButton
                source="hero"
                size="lg"
                variant="secondary"
                className="w-full sm:w-auto"
              >
                Talk to a counsellor
              </EnquiryButton>
            </RevealItem>

            {/* For the visitor who has already enrolled — the home page is
                where most of them land first. */}
            <RevealItem>
              <p className="mt-5 text-sm text-ink-600">
                Already enrolled?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-brand-600 hover:text-brand-700"
                >
                  Sign in to your dashboard
                </Link>{" "}
                or{" "}
                <Link
                  href="#get-started"
                  className="font-semibold text-brand-600 hover:text-brand-700"
                >
                  see how to get started
                </Link>
                .
              </p>
            </RevealItem>

            <RevealItem className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-6 text-xs font-medium text-ink-500">
              <span className="inline-flex items-center gap-1.5">
                <Star size={14} className="text-gold-500" fill="currentColor" aria-hidden />
                4.7/5 student rating
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users size={14} className="text-brand-500" aria-hidden />
                40,000+ learners trained
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Award size={14} className="text-brand-500" aria-hidden />
                500+ hiring partners
              </span>
            </RevealItem>
          </Reveal>

          <Reveal>
            <RevealItem>
              <DashboardPreview />
            </RevealItem>
          </Reveal>
        </div>
      </Container>

      {/* Stats band — overlaps the section edge so it reads as one unit with the hero. */}
      <Container className="relative">
        <Reveal className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-sm md:grid-cols-4">
          {STATS.map((stat) => (
            <RevealItem
              key={stat.label}
              className="bg-surface px-4 py-6 text-center md:py-7"
            >
              <p className="text-2xl font-extrabold tabular-nums text-brand-600 md:text-3xl">
                {stat.value}
              </p>
              <p className="mt-1 text-xs font-medium text-ink-600 md:text-sm">
                {stat.label}
              </p>
            </RevealItem>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}

/**
 * A still of the student dashboard, so a visitor can see what they are signing
 * up to use. Illustrative content, not live data — hence `role="img"`, which
 * also keeps the progress bar inside from being announced as a real one.
 */
function DashboardPreview() {
  return (
    <div
      role="img"
      aria-label="Preview of the student dashboard: continue your current lesson, see your next live class and your latest assignment mark."
      className="relative mx-auto w-full max-w-md lg:max-w-none"
    >
      {/* Soft glow behind the card. Decorative. */}
      <div
        aria-hidden
        className="absolute -inset-6 rounded-[2rem] bg-linear-to-tr from-brand-200/60 via-transparent to-gold-200/50 blur-2xl"
      />

      <div className="relative rounded-2xl border border-border bg-surface p-5 shadow-lg sm:p-6">
        <div className="flex items-center justify-between">
          <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
            Continue where you left off
          </p>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-2xs font-semibold text-brand-700">
            In progress
          </span>
        </div>

        <p className="mt-3 text-lg font-semibold text-ink-900">
          Module 3: Keyword Research
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-600">
          <PlayCircle size={16} className="text-brand-600" />
          Lesson 7 · Search intent in practice
        </p>

        <ProgressBar value={43} label="6 of 14 lessons" className="mt-5" />

        <span className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-solid text-sm font-semibold text-white">
          Resume lesson
          <ArrowRight size={16} />
        </span>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-surface-muted p-3.5">
            <CalendarClock size={18} className="text-brand-600" />
            <p className="mt-2 text-xs text-ink-500">Next live class</p>
            <p className="text-sm font-semibold text-ink-900">Today, 7:00 PM</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-muted p-3.5">
            <CheckCircle2 size={18} className="text-success-500" />
            <p className="mt-2 text-xs text-ink-500">Assignment reviewed</p>
            <p className="text-sm font-semibold tabular-nums text-ink-900">
              18 / 20
            </p>
          </div>
        </div>
      </div>

      {/* The one gold moment: what the program ends in. */}
      <div className="absolute -right-3 -top-4 hidden items-center gap-2 rounded-full border border-gold-200 bg-surface py-1.5 pl-1.5 pr-3.5 shadow-md sm:flex">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-400 text-on-gold">
          <Award size={14} />
        </span>
        <span className="text-xs font-semibold text-ink-900">
          Certificate on completion
        </span>
      </div>
    </div>
  );
}
