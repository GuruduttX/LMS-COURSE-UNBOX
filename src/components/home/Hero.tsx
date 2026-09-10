import { ArrowRight, Award, Sparkles, Star, Users } from "lucide-react";

import { EnquiryButton } from "@/components/enquiry/EnquiryButton";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { STATS } from "@/lib/data/home";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-brand-50 via-surface-muted to-surface-muted">
      {/* Faint grid, purely decorative — kept low contrast so text stays dominant. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,#dbe5ff_1px,transparent_1px),linear-gradient(to_bottom,#dbe5ff_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
      />

      <Container className="relative">
        <Reveal className="flex flex-col items-center pb-14 pt-14 text-center md:pb-20 md:pt-20">
          <RevealItem>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-surface px-4 py-1.5 text-xs font-semibold text-brand-700 shadow-xs">
              <Sparkles size={14} />
              Live cohorts start every month
            </p>
          </RevealItem>

          <RevealItem>
            <h1 className="mt-6 max-w-4xl text-3xl font-extrabold leading-[1.1] tracking-tight text-ink-900 md:text-4xl">
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
            <p className="mx-auto mt-7 max-w-2xl text-base leading-relaxed text-ink-600 md:text-lg">
              Cohort-based programs in performance marketing, SEO, AEO, GEO and AI —
              taught by working practitioners, built on real projects, from anywhere
              in the world.
            </p>
          </RevealItem>

          <RevealItem className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <ButtonLink href="#programs" size="lg" className="w-full sm:w-auto">
              Explore programs
              <ArrowRight size={18} />
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

          <RevealItem className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <Star size={14} className="text-gold-500" fill="currentColor" />
              4.7/5 student rating
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users size={14} className="text-brand-500" />
              40,000+ learners trained
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Award size={14} className="text-brand-500" />
              500+ hiring partners
            </span>
          </RevealItem>
        </Reveal>
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
