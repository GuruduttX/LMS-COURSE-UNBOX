import { CalendarDays, ChevronRight, Layers, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  BatchFillBar,
} from "@/components/staff/batches/BatchFill";
import {
  CreateBatchForm,
  EditBatchButton,
} from "@/components/staff/batches/BatchControls";
import { PageHeading } from "@/components/staff/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireRole } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { listBatches, type BatchRow } from "@/lib/data/batches";
import { programsWithStudents } from "@/lib/data/students";
import { formatDate } from "@/lib/curriculum/format";

/**
 * Cohorts, per program, with how full each one is.
 *
 * One screen for both areas: the admin nav links here too, exactly as it does
 * for sessions, because `requireRole("program_manager")` admits an admin and
 * the scope the list is built from widens to every program for them. A second
 * copy under /admin would be a second place for a scope check to drift.
 *
 * Rendered per request — occupancy is a count of live enrolments, and a cached
 * "2 seats left" is the one number on this page that must never be stale.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Batches" };

export default async function BatchesPage() {
  const user = await requireRole("program_manager");

  // Capability, not role: the nav derives from the same map, so a role that
  // loses `batch.manage` later loses the screen rather than keeping a page
  // whose every control refuses.
  if (!can(user, "batch.view")) notFound();

  // From the Program collection rather than the marketing list in data/home.ts:
  // a batch needs a real program row to be enrolled into, so offering a slug
  // that has no row would only fail at the write.
  const programs = await programsWithStudents(user);
  const batches = await listBatches(user);
  const mayManage = can(user, "batch.manage");

  const byProgram = programs
    .map((program) => ({
      ...program,
      rows: batches.filter((row) => row.programSlug === program.slug),
    }))
    .filter((group) => group.rows.length > 0 || mayManage);

  return (
    <div className="space-y-6">
      <PageHeading
        title="Batches"
        description="The cohorts students are enrolled into, and how many seats are left in each."
      />

      {mayManage && programs.length > 0 ? (
        <CreateBatchForm programs={programs} />
      ) : null}

      {programs.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No programs assigned to you"
          description="Batches belong to a program, and you aren't on one yet. An admin assigns programs from the people screen."
        />
      ) : (
        <div className="space-y-8">
          {byProgram.map((group) => (
            <section key={group.slug} className="space-y-3">
              <h2 className="text-sm font-bold text-ink-900">{group.title}</h2>

              {group.rows.length === 0 ? (
                <EmptyState
                  icon={Layers}
                  title="No batches on this program yet"
                  description="Create one above and it becomes pickable when enrolling a student."
                />
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {group.rows.map((batch) => (
                    <BatchCard
                      key={batch.id}
                      batch={batch}
                      mayManage={mayManage}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function BatchCard({
  batch,
  mayManage,
}: {
  batch: BatchRow;
  mayManage: boolean;
}) {
  return (
    <li className="group relative flex flex-col rounded-xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong hover:bg-ink-50">
      <div className="flex items-start justify-between gap-3">
        {/* One link, stretched over the whole card by the `after` overlay, so
            the card is clickable without nesting the edit control inside an
            anchor. The controls below sit above it on `z-10`. */}
        <h3 className="text-sm font-bold text-ink-900 group-hover:text-brand-700">
          <Link
            href={`/manager/batches/${batch.programSlug}/${encodeURIComponent(batch.name)}`}
            className="after:absolute after:inset-0 after:rounded-xl after:content-['']"
          >
            {batch.name}
          </Link>
        </h3>
        {batch.status === "closed" ? (
          <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-ink-600">
            Closed
          </span>
        ) : null}
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
        <span className="flex items-center gap-1.5">
          <UsersRound size={13} aria-hidden className="text-ink-400" />
          {batch.enrolled} enrolled
        </span>
        {/* One line for the run: both dates when both are set, because "Aug 4 —
            Nov 30" is the thing staff read, not two separate facts. */}
        {batch.startsOn || batch.endsOn ? (
          <span className="flex items-center gap-1.5">
            <CalendarDays size={13} aria-hidden className="text-ink-400" />
            {batch.startsOn && batch.endsOn
              ? `${formatDate(batch.startsOn)} — ${formatDate(batch.endsOn)}`
              : batch.startsOn
                ? `Starts ${formatDate(batch.startsOn)}`
                : `Ends ${formatDate(batch.endsOn!)}`}
          </span>
        ) : null}
      </p>

      <div className="mt-4">
        <BatchFillBar enrolled={batch.enrolled} capacity={batch.capacity} />
      </div>

      {/* Says what the card leads to. The bar and the count above are the
          cohort's size; this is the way in to the people in it. */}
      <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 group-hover:text-brand-700">
        View students
        <ChevronRight size={14} aria-hidden />
      </p>

      {mayManage ? (
        <div className="relative z-10 mt-4 border-t border-border pt-3">
          <EditBatchButton batch={batch} />
        </div>
      ) : null}
    </li>
  );
}
