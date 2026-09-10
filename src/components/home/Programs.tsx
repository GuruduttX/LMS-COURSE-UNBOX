import { ArrowRight, BookOpen, Check, Clock, Layers } from "lucide-react";
import Link from "next/link";

import { Container } from "@/components/ui/Container";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { COURSES, type Course } from "@/lib/data/home";

export function Programs() {
  return (
    <section id="programs" className="scroll-mt-20 py-14 md:py-20">
      <Container>
        <SectionHeading
          eyebrow="Our programs"
          title="Cohort courses with placement support"
          subtitle="Four tracks, each structured into modules and lessons with weekly assignments reviewed by your mentor."
        />

        <Reveal className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 md:mt-10">
          {COURSES.map((course) => (
            <RevealItem key={course.slug}>
              <CourseCard course={course} />
            </RevealItem>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}

function CourseCard({ course }: { course: Course }) {
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-within:-translate-y-0.5 focus-within:shadow-md">
      <div
        className={`relative flex h-28 items-end bg-linear-to-br p-4 ${course.cover}`}
      >
        <BookOpen
          size={64}
          strokeWidth={1.25}
          aria-hidden
          className="absolute right-3 top-3 text-white/20"
        />
        <span className="text-2xs font-semibold uppercase tracking-[0.12em] text-white/80">
          {course.level}
        </span>
        {course.isNew ? (
          <span className="absolute right-3 bottom-3 rounded-full bg-gold-400 px-2.5 py-1 text-2xs font-bold uppercase tracking-wide text-on-gold">
            New
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold leading-snug text-ink-900">
          {/* Whole card is one link target — design.md §5. */}
          <Link
            href={`/courses/${course.slug}`}
            className="after:absolute after:inset-0 after:content-['']"
          >
            {course.title}
          </Link>
        </h3>
        <p className="mt-1.5 text-sm text-ink-600">{course.tagline}</p>

        <ul className="mt-4 space-y-2">
          {course.highlights.map((point) => (
            <li key={point} className="flex gap-2 text-sm text-ink-700">
              <Check
                size={16}
                className="mt-0.5 shrink-0 text-success-500"
                aria-hidden
              />
              {point}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {course.tools.slice(0, 3).map((tool) => (
            <span
              key={tool}
              className="rounded-md bg-ink-100 px-2 py-1 text-2xs font-medium text-ink-600"
            >
              {tool}
            </span>
          ))}
          {course.tools.length > 3 ? (
            <span className="rounded-md px-1 py-1 text-2xs font-medium text-ink-500">
              +{course.tools.length - 3} more
            </span>
          ) : null}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-4 text-xs font-medium text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={14} aria-hidden />
            {course.durationWeeks} weeks
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Layers size={14} aria-hidden />
            {course.modules} modules · {course.lessons} lessons
          </span>
        </div>

        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition-colors group-hover:text-brand-700">
          View curriculum
          <ArrowRight
            size={16}
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </article>
  );
}
