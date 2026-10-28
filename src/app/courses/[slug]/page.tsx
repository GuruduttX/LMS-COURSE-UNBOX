import {
  BookOpen,
  Check,
  Clock,
  GraduationCap,
  Layers,
  Library,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EnquiryButton } from "@/components/enquiry/EnquiryButton";
import { EnquiryProvider } from "@/components/enquiry/EnquiryProvider";
import { Advantage } from "@/components/home/Advantage";
import { CtaBand } from "@/components/home/CtaBand";
import { Educators } from "@/components/home/Educators";
import { Faq } from "@/components/home/Faq";
import { Testimonials } from "@/components/home/Testimonials";
import { CurriculumTimeline } from "@/components/site/CurriculumTimeline";
import { PublicHeader } from "@/components/site/SiteChrome";
import { SiteFooter } from "@/components/site/SiteFooter";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import {
  getPublicProgram,
  publicProgramTitles,
  type PublicProgramDetail,
} from "@/lib/data/public-programs";
import { formatPaise } from "@/lib/payments/money";

/**
 * One program's public page — what it teaches, month by month, and what it offers.
 *
 * Every link in the header, the footer and the home page cards has pointed here
 * since the marketing site was built; until now there was no route, so all of
 * them 404'd.
 *
 * ## Two rules the whole page follows
 *
 * **The curriculum is the real one.** The timeline is built from this program's
 * published courses and modules, and the counts in the hero are derived from the
 * same tree — so the "9 modules" at the top and the outline underneath cannot
 * disagree, and neither can go stale.
 *
 * **Every section removes itself when it has nothing to say.** A program whose
 * Details screen nobody has filled in still renders: title, summary, and the
 * syllabus. It does not render an empty "What you'll learn" heading, a
 * placeholder cover, or "Free" where a price would be. Rendering nothing is
 * always better than rendering a promise nobody made.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/courses/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const program = await getPublicProgram(slug);
  if (!program) return { title: "Program not found" };

  const description = program.tagline || program.summary || undefined;

  return {
    title: program.title,
    description,
    openGraph: {
      title: program.title,
      description,
      images: program.cover ? [program.cover.url] : [],
    },
  };
}

export default async function ProgramPage({
  params,
}: PageProps<"/courses/[slug]">) {
  const { slug } = await params;

  const [program, programs] = await Promise.all([
    getPublicProgram(slug),
    publicProgramTitles(),
  ]);
  // Null covers both "no such program" and "not published", which is the same
  // answer to a visitor either way and so leaks nothing about drafts.
  if (!program) notFound();

  return (
    <EnquiryProvider programs={programs} defaultProgram={program.title}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60 focus:rounded-lg focus:bg-brand-solid focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <PublicHeader />

      <main id="main" className="flex-1">
        <Hero program={program} />

        {program.description || program.summary ? (
          <section className="py-14 md:py-20">
            <Container>
              <SectionHeading
                eyebrow="About the program"
                title={`What ${program.title} is`}
              />
              <div className="mt-6 max-w-3xl space-y-4 pl-4 text-sm leading-relaxed text-ink-700 md:text-base">
                {paragraphs(program.description || program.summary).map(
                  (line, index) => (
                    <p key={index}>{line}</p>
                  ),
                )}
              </div>
            </Container>
          </section>
        ) : null}

        {program.highlights.length > 0 ? (
          <section className="bg-surface-muted py-14 md:py-20">
            <Container>
              <SectionHeading
                eyebrow="Outcomes"
                title="What you’ll be able to do"
              />
              <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                {program.highlights.map((point) => (
                  <li
                    key={point}
                    className="flex gap-3 rounded-xl border border-border bg-surface p-4 text-sm text-ink-700"
                  >
                    <Check
                      size={18}
                      className="mt-0.5 shrink-0 text-success-500"
                      aria-hidden
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </Container>
          </section>
        ) : null}

        <Offers program={program} />

        <Curriculum program={program} />

        {program.tools.length > 0 ? (
          <section className="bg-surface-muted py-14 md:py-20">
            <Container>
              <SectionHeading
                eyebrow="Toolkit"
                title="Tools you’ll work in"
                subtitle="The software you will come out able to use, not just to name."
              />
              <div className="mt-8 flex flex-wrap gap-2">
                {program.tools.map((tool) => (
                  <span
                    key={tool}
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-ink-700"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </Container>
          </section>
        ) : null}

        <Advantage />
        <Educators />
        <Testimonials />
        <Faq />
        <CtaBand />
      </main>

      <SiteFooter />
    </EnquiryProvider>
  );
}

/* ---------------------------------- hero ---------------------------------- */

const COVER_FALLBACK = "from-brand-solid to-brand-solid-active";

const LEVEL_LABEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

function Hero({ program }: { program: PublicProgramDetail }) {
  const chips = heroChips(program);

  return (
    <section className="border-b border-border bg-linear-to-b from-brand-50 via-surface-muted to-surface-muted">
      <Container>
        <div className="grid items-center gap-8 py-12 md:py-16 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-12">
          <div>
            {program.level ? (
              <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-brand-700">
                {LEVEL_LABEL[program.level]}
              </p>
            ) : null}

            <h1 className="mt-3 text-3xl font-extrabold leading-[1.1] tracking-tight text-ink-900 md:text-4xl">
              {program.title}
            </h1>

            {program.tagline ? (
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-600 md:text-lg">
                {program.tagline}
              </p>
            ) : null}

            {chips.length > 0 ? (
              <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-ink-600">
                {chips.map((chip) => (
                  <li key={chip.label} className="inline-flex items-center gap-1.5">
                    <chip.icon size={16} aria-hidden />
                    {chip.label}
                  </li>
                ))}
              </ul>
            ) : null}

            {program.feeAmount !== null ? (
              <p className="mt-6 flex items-baseline gap-3">
                <span className="text-2xl font-extrabold text-ink-900">
                  {formatPaise(program.feeAmount)}
                </span>
                {program.listAmount !== null &&
                program.listAmount > program.feeAmount ? (
                  <span className="text-sm font-medium text-ink-400 line-through">
                    {formatPaise(program.listAmount)}
                  </span>
                ) : null}
              </p>
            ) : null}

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <EnquiryButton
                source={`course-${program.slug}`}
                size="lg"
                className="w-full sm:w-auto"
              >
                Apply now
              </EnquiryButton>
              <ButtonLink
                href="/login"
                size="lg"
                variant="secondary"
                className="w-full sm:w-auto"
              >
                I’m already enrolled
              </ButtonLink>
            </div>
          </div>

          <div
            className={`relative flex aspect-16/9 items-end overflow-hidden rounded-2xl bg-linear-to-br shadow-sm ${COVER_FALLBACK}`}
          >
            {program.cover ? (
              /* eslint-disable-next-line @next/next/no-img-element -- Cloudinary
                 is not a configured next/image host, and lib/uploads/cloudinary.ts
                 serves the exact bytes uploaded; there is nothing for the
                 optimiser to do. Same call as components/auth/Avatar.tsx. */
              <img
                src={program.cover.url}
                alt={program.cover.alt}
                // The LCP element on this page, so it is fetched eagerly.
                fetchPriority="high"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <GraduationCap
                size={96}
                strokeWidth={1}
                aria-hidden
                className="absolute right-6 top-6 text-white/20"
              />
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}

function heroChips(program: PublicProgramDetail) {
  const chips: { icon: typeof Clock; label: string }[] = [];

  if (program.durationMonths !== null) {
    chips.push({
      icon: Clock,
      label: `${program.durationMonths} ${program.durationMonths === 1 ? "month" : "months"}`,
    });
  }
  if (program.courseCount > 0) {
    chips.push({
      icon: Library,
      label: `${program.courseCount} ${program.courseCount === 1 ? "course" : "courses"}`,
    });
  }
  if (program.moduleCount > 0) {
    chips.push({
      icon: Layers,
      label: `${program.moduleCount} ${program.moduleCount === 1 ? "module" : "modules"}`,
    });
  }
  if (program.lessonCount > 0) {
    chips.push({
      icon: BookOpen,
      label: `${program.lessonCount} ${program.lessonCount === 1 ? "lesson" : "lessons"}`,
    });
  }
  if (program.nextBatch) {
    chips.push({ icon: Clock, label: program.nextBatch });
  }

  return chips;
}

/* --------------------------------- offers --------------------------------- */

function Offers({ program }: { program: PublicProgramDetail }) {
  if (!program.placementGuarantee && program.offers.length === 0) return null;

  return (
    <section className="py-14 md:py-20">
      <Container>
        <SectionHeading
          eyebrow="What you get"
          title="What this program offers"
        />

        {program.placementGuarantee ? (
          // Gold, and a card of its own: design.md §2 reserves gold for
          // achievement, and this is the one line on the page that is a promise
          // rather than a description.
          <div className="mt-8 flex items-start gap-4 rounded-2xl border border-gold-300 bg-gold-50 p-5 md:p-6">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-400 text-on-gold">
              <ShieldCheck size={22} aria-hidden />
            </span>
            <div>
              <p className="text-base font-bold text-ink-900">
                Placement guarantee
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-700">
                Finish the program and meet its graduation criteria, and our
                placement team works with you until you are placed.
              </p>
            </div>
          </div>
        ) : null}

        {program.offers.length > 0 ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {program.offers.map((offer) => (
              <li
                key={offer}
                className="flex gap-3 rounded-xl border border-border bg-surface p-4 text-sm text-ink-700"
              >
                <Check
                  size={18}
                  className="mt-0.5 shrink-0 text-success-500"
                  aria-hidden
                />
                {offer}
              </li>
            ))}
          </ul>
        ) : null}
      </Container>
    </section>
  );
}

/* ------------------------------- curriculum ------------------------------- */

function Curriculum({ program }: { program: PublicProgramDetail }) {
  const timed = program.courses.some((course) => course.startMonth !== null);

  return (
    <section id="curriculum" className="scroll-mt-20 py-14 md:py-20">
      <Container>
        <SectionHeading
          eyebrow="Curriculum"
          title="What you’ll cover, month by month"
          subtitle={
            timed
              ? "Every course below, in the order you meet it, against the month it runs in."
              : "Every course below, in the order you meet it."
          }
        />

        <div className="mt-8 md:mt-10">
          {program.courses.length > 0 ? (
            <CurriculumTimeline courses={program.courses} />
          ) : (
            // Never an empty timeline: a curriculum section with no rows reads
            // as a broken page, where a sentence reads as a program still being
            // written — which is what it is.
            <div className="rounded-xl border border-dashed border-border bg-surface-muted px-6 py-12 text-center">
              <p className="text-sm font-semibold text-ink-900">
                The curriculum for this program is being finalised
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-600">
                Talk to a counsellor and we will walk you through what it covers
                and when the next batch starts.
              </p>
              <div className="mt-5 flex justify-center">
                <EnquiryButton source={`course-${program.slug}-curriculum`}>
                  Talk to a counsellor
                </EnquiryButton>
              </div>
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}

/** Blank-line-separated prose. Plain text — the field is not markdown. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
