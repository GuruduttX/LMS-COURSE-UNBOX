import { ArrowRight, BookOpen, Check, Clock, Layers } from "lucide-react";
import Link from "next/link";

import { formatPaise } from "@/lib/payments/money";
import type { PublicProgramCard } from "@/lib/data/public-programs";

/**
 * One program, as a card.
 *
 * Extracted from `Programs.tsx` when the home page started reading the database:
 * the dashboard catalogue wants the same card, and two copies of it would be two
 * places for "what do we show when there is no cover" to be answered differently.
 *
 * **Every field here is optional and every one of them hides on its own.** A
 * program whose Details screen nobody has filled in still renders — title,
 * tagline from the summary, and the real course and lesson counts — rather than
 * showing a placeholder. That is the whole reason there is no default cover
 * image and no "Free" for a program with no fee.
 */

/**
 * The band behind a program with no cover.
 *
 * A constant here rather than a stored field: the old static array kept Tailwind
 * classes in its data (`cover: "from-brand-solid to-…"`), which is both an
 * injection surface and invisible to Tailwind's JIT — it purges classes it
 * cannot find in source, so a gradient that only ever existed in the database
 * would not survive a production build.
 */
const COVER_FALLBACK = "from-brand-solid to-brand-solid-active";

const LEVEL_LABEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export function ProgramCard({ program }: { program: PublicProgramCard }) {
  const meta = metaLine(program);

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-within:-translate-y-0.5 focus-within:shadow-md">
      <div
        className={`relative flex h-28 items-end bg-linear-to-br p-4 ${COVER_FALLBACK}`}
      >
        {program.cover ? (
          /* eslint-disable-next-line @next/next/no-img-element -- Cloudinary is
             not a configured next/image host, and lib/uploads/cloudinary.ts
             serves the exact bytes that were uploaded; there is nothing for the
             optimiser to do. Same call as components/auth/Avatar.tsx. */
          <img
            src={program.cover.url}
            alt={program.cover.alt}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <BookOpen
            size={64}
            strokeWidth={1.25}
            aria-hidden
            className="absolute right-3 top-3 text-white/20"
          />
        )}

        {program.level ? (
          <span className="relative text-2xs font-semibold uppercase tracking-[0.12em] text-white/90 drop-shadow-sm">
            {LEVEL_LABEL[program.level]}
          </span>
        ) : null}

        {program.isNew ? (
          <span className="absolute right-3 bottom-3 rounded-full bg-gold-400 px-2.5 py-1 text-2xs font-bold uppercase tracking-wide text-on-gold">
            New
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold leading-snug text-ink-900">
          {/* Whole card is one link target — design.md §5. */}
          <Link
            href={`/courses/${program.slug}`}
            className="after:absolute after:inset-0 after:content-['']"
          >
            {program.title}
          </Link>
        </h3>

        {program.tagline ? (
          <p className="mt-1.5 text-sm text-ink-600">{program.tagline}</p>
        ) : null}

        {program.placementGuarantee ? (
          <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-gold-50 px-2.5 py-1 text-2xs font-bold uppercase tracking-wide text-gold-600">
            <Check size={13} strokeWidth={3} aria-hidden />
            Placement guarantee
          </p>
        ) : null}

        {program.highlights.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {program.highlights.slice(0, 3).map((point) => (
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
        ) : null}

        {program.tools.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {program.tools.slice(0, 3).map((tool) => (
              <span
                key={tool}
                className="rounded-md bg-ink-100 px-2 py-1 text-2xs font-medium text-ink-600"
              >
                {tool}
              </span>
            ))}
            {program.tools.length > 3 ? (
              <span className="rounded-md px-1 py-1 text-2xs font-medium text-ink-500">
                +{program.tools.length - 3} more
              </span>
            ) : null}
          </div>
        ) : null}

        {meta.months || meta.contents ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-4 text-xs font-medium text-ink-500">
            {meta.months ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock size={14} aria-hidden />
                {meta.months}
              </span>
            ) : null}
            {meta.contents ? (
              <span className="inline-flex items-center gap-1.5">
                <Layers size={14} aria-hidden />
                {meta.contents}
              </span>
            ) : null}
          </div>
        ) : null}

        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition-colors group-hover:text-brand-700">
          View curriculum
          <ArrowRight
            size={16}
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </span>

        {program.feeAmount !== null ? (
          <p className="mt-3 flex items-baseline gap-2">
            <span className="text-base font-bold text-ink-900">
              {formatPaise(program.feeAmount)}
            </span>
            {/* Only ever struck through, and only when it is genuinely higher —
                see the note on `listAmount` in models/Program.ts. */}
            {program.listAmount !== null &&
            program.listAmount > program.feeAmount ? (
              <span className="text-xs font-medium text-ink-400 line-through">
                {formatPaise(program.listAmount)}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    </article>
  );
}

/** The two footer chips, each empty when there is nothing honest to put in it. */
function metaLine(program: PublicProgramCard): {
  months: string;
  contents: string;
} {
  const months =
    program.durationMonths === null
      ? ""
      : `${program.durationMonths} ${program.durationMonths === 1 ? "month" : "months"}`;

  const parts: string[] = [];
  if (program.moduleCount > 0) {
    parts.push(
      `${program.moduleCount} ${program.moduleCount === 1 ? "module" : "modules"}`,
    );
  }
  if (program.lessonCount > 0) {
    parts.push(
      `${program.lessonCount} ${program.lessonCount === 1 ? "lesson" : "lessons"}`,
    );
  }

  return { months, contents: parts.join(" · ") };
}
