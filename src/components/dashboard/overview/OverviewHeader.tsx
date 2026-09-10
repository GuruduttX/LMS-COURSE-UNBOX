import { ChevronRight, Download } from "lucide-react";
import Link from "next/link";

import { BackLink } from "@/components/ui/BackLink";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/curriculum/format";


/**
 * Breadcrumb, greeting, course title, and the completion line when finished.
 *
 * Below `lg` the breadcrumb gives way to a back arrow. Same destination, but a
 * 14px trail is a poor tap target and reads as decoration on a phone, where an
 * arrow reads as the way out.
 */
export function OverviewHeader({
  studentFirstName,
  title,
  isComplete,
  deadline,
}: {
  studentFirstName: string;
  title: string;
  isComplete: boolean;
  /** ISO end date of the student's own batch, when it has one. */
  deadline?: string | null;
}) {
  return (
    <header>
      <BackLink href="/dashboard" className="lg:hidden">
        Dashboard
      </BackLink>

      <nav aria-label="Breadcrumb" className="hidden lg:block">
        <ol className="flex items-center gap-1 text-xs font-medium text-ink-500">
          <li>
            <Link href="/dashboard" className="hover:text-ink-800">
              Dashboard
            </Link>
          </li>
          <ChevronRight size={14} aria-hidden className="text-ink-400" />
          <li aria-current="page" className="text-ink-700">
            {title}
          </li>
        </ol>
      </nav>

      <p className="mt-4 text-sm text-ink-600">Welcome {studentFirstName}</p>
      {/* The deadline sits beside the title, small: it is context for the
          course name, not a heading of its own. It wraps under on narrow
          screens rather than squeezing the title. */}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 md:text-3xl">
          {title}
        </h1>
        {deadline ? (
          <p className="text-xs font-medium text-ink-500">
            Deadline {formatDate(deadline)}
          </p>
        ) : null}
      </div>

      {isComplete ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm text-ink-600">
            Congratulations on graduating from the course.
          </p>
          <Button variant="gold" size="sm">
            <Download size={16} aria-hidden />
            Download certificate
          </Button>
        </div>
      ) : null}
    </header>
  );
}
