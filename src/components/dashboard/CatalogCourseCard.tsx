import { ArrowRight, CalendarClock, Clock, Layers } from "lucide-react";

import { EnquiryButton } from "@/components/enquiry/EnquiryButton";
import { ButtonLink } from "@/components/ui/Button";
import type { Course } from "@/lib/data/home";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** A course the student has not enrolled in — shown under "All courses". */
export function CatalogCourseCard({ course }: { course: Course }) {
  return (
    <article className="flex flex-col rounded-xl border border-border bg-surface p-5 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold leading-snug text-ink-900">
            {course.title}
          </h3>
          <p className="mt-1 text-sm text-ink-600">{course.tagline}</p>
        </div>
        {course.isNew ? (
          <span className="shrink-0 rounded-full bg-gold-100 px-2.5 py-1 text-2xs font-bold uppercase tracking-wide text-gold-600">
            New
          </span>
        ) : null}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Meta icon={<Clock size={14} />} label="Duration">
          {course.durationWeeks} weeks
        </Meta>
        <Meta icon={<Layers size={14} />} label="Structure">
          {course.modules} modules
        </Meta>
        <Meta icon={<CalendarClock size={14} />} label="Starts" wide>
          {course.nextBatch.replace("Next batch starts ", "")}
        </Meta>
      </dl>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p>
          <span className="text-lg font-extrabold tabular-nums text-ink-900">
            {INR.format(course.fee)}
          </span>
          <span className="ml-1.5 text-xs text-ink-500">incl. taxes</span>
        </p>

        <div className="flex items-center gap-2">
          <ButtonLink href={`/courses/${course.slug}`} variant="secondary">
            Know more
          </ButtonLink>
          <EnquiryButton source={`dashboard-catalog-${course.slug}`}>
            Enrol
            <ArrowRight size={16} />
          </EnquiryButton>
        </div>
      </div>
    </article>
  );
}

function Meta({
  icon,
  label,
  children,
  wide,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="flex items-center gap-1.5 text-xs text-ink-500">
        <span aria-hidden>{icon}</span>
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink-800">{children}</dd>
    </div>
  );
}
