import "server-only";

import { CalendarClock, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeading } from "@/components/staff/StatTile";
import { Breadcrumb } from "@/components/staff/curriculum/Breadcrumb";
import { ProgramDetailsForm } from "@/components/staff/curriculum/forms/ProgramDetailsForm";
import { ButtonLink } from "@/components/ui/Button";
import { assertScope, requireRole } from "@/lib/auth/guards";
import { EMPTY_PROGRAM_DETAILS_STATE } from "@/lib/actions/curriculum-state";
import type { ProgramDetailsFormState } from "@/lib/actions/curriculum-state";
import { connectToDatabase } from "@/lib/db";
import { Course } from "@/models/Course";
import { Program } from "@/models/Program";

/**
 * The Details screen, once, for both areas that reach it.
 *
 * Its own component rather than one more export of `editors.tsx`, because that
 * module's `StaffArea` is admin-or-teacher and this screen is
 * admin-or-**manager**. Widening that union so one screen could join it would
 * hand every curriculum editor a third area to be wrong about; the guard here
 * is three lines, and they say plainly who this screen is for.
 *
 * A teacher is deliberately absent. A teacher authors content — what a program
 * *claims*, and the placement guarantee in particular, is a promise made on
 * behalf of the institution, which is the same reasoning that keeps `/fees`
 * away from them.
 */
export async function ProgramDetailsEditor({
  area,
  programSlug,
}: {
  area: "admin" | "manager";
  programSlug: string;
}) {
  const user =
    area === "admin"
      ? await requireRole("admin")
      : await requireRole("program_manager");

  // An admin is in scope everywhere; a manager only on the programs they run.
  assertScope(user, { program: programSlug });

  await connectToDatabase();

  const program = await Program.findOne({ slug: programSlug })
    .select("slug title status marketing")
    .lean();
  if (!program) notFound();

  // The nudge below. Counted rather than listed: the point is "some of your
  // courses will print no month", and the fix is on the course screens.
  const undated = await Course.countDocuments({
    programId: program._id,
    startMonth: null,
  });

  const root = area === "admin" ? "/admin/programs" : "/manager/programs";
  const programHref = `${root}/${programSlug}`;
  const published = program.status === "published";

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Programs", href: root },
          { label: program.title, href: programHref },
          { label: "Details" },
        ]}
      />

      <PageHeading
        title="Public details"
        description="What someone who has not enrolled sees — on the home page, and on this program's own page."
        action={
          published ? (
            <ButtonLink
              href={`/courses/${programSlug}`}
              variant="secondary"
              target="_blank"
            >
              <ExternalLink size={16} aria-hidden />
              View the public page
            </ButtonLink>
          ) : undefined
        }
      />

      {published ? null : (
        <p className="rounded-lg border border-border bg-ink-50 p-3 text-sm text-ink-700">
          This program is a{" "}
          <span className="font-semibold">{program.status}</span>, so none of
          this is on the site yet. Publish it from{" "}
          <Link href={programHref} className="font-semibold underline">
            the program screen
          </Link>{" "}
          when it is ready.
        </p>
      )}

      {undated > 0 ? (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-ink-50 p-3 text-sm text-ink-700">
          <CalendarClock size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">
              {undated} {undated === 1 ? "course has" : "courses have"} no
              starting month
            </span>{" "}
            — they appear on the public curriculum with no “Month 1” beside
            them. The month is set on each course’s own screen, from{" "}
            <Link href={programHref} className="font-semibold underline">
              the program screen
            </Link>
            .
          </span>
        </p>
      ) : null}

      <ProgramDetailsForm
        programSlug={programSlug}
        initial={seedState(program.marketing)}
        cancelHref={programHref}
        context={[
          { label: "Program", value: program.title },
          { label: "Slug", value: programSlug },
        ]}
      />
    </div>
  );
}

type StoredMarketing = NonNullable<
  Awaited<ReturnType<typeof Program.findOne>>
>["marketing"];

/**
 * The saved copy as the form's all-string seed.
 *
 * Null marketing is the seed state, not an error: it is what every program that
 * predates this screen looks like, and an empty form is the right thing to show
 * somebody who has not written the copy yet.
 */
function seedState(marketing: StoredMarketing): ProgramDetailsFormState {
  if (!marketing) return EMPTY_PROGRAM_DETAILS_STATE;

  return {
    ok: false,
    errors: {},
    values: {
      tagline: marketing.tagline ?? "",
      description: marketing.description ?? "",
      level: marketing.level ?? "",
      // Checkboxes speak "on" or nothing, so the seed has to as well — the form
      // reads these back with `values.x === "on"`.
      placementGuarantee: marketing.placementGuarantee ? "on" : "",
      nextBatch: marketing.nextBatch ?? "",
      newBadge: marketing.newBadge ? "on" : "",
    },
    cover: marketing.cover ?? null,
    highlights: marketing.highlights ?? [],
    tools: marketing.tools ?? [],
    offers: marketing.offers ?? [],
  };
}
