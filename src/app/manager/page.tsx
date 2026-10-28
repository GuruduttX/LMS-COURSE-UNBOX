import { CalendarClock, Library } from "lucide-react";
import type { Metadata } from "next";

import { PageHeading, StatTile } from "@/components/staff/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireRole } from "@/lib/auth/guards";
import { programsFor } from "@/lib/data/programs";

/**
 * The program manager's landing screen: the programs they run.
 *
 * Deliberately thin for now. The numbers a manager actually opens this for —
 * sessions today, unmarked attendance, attendance below threshold — all need
 * the LiveSession and Attendance models, which land in the next phase. Showing
 * plausible placeholders instead would be worse than showing nothing: staff act
 * on these numbers.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Program manager" };

export default async function ManagerOverviewPage() {
  const user = await requireRole("program_manager");

  // `programsFor` already answers "admin runs everything, everyone else runs
  // what they are assigned to", filtered against what actually exists. This used
  // to filter the static home-page array, which held only the four launch
  // programs — so a manager assigned to anything created since saw nothing.
  const programs = await programsFor(user);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeading
        title={`Hi ${user.name.split(" ")[0]}`}
        description={
          user.role === "admin"
            ? "Every program, as the program manager sees them."
            : "The programs you run."
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Programs"
          value={programs.length}
          hint={user.role === "admin" ? "All programs" : "Assigned to you"}
          icon={Library}
        />
        <StatTile
          label="Sessions"
          value="—"
          hint="Scheduling lands next"
          icon={CalendarClock}
        />
      </div>

      {programs.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No programs assigned yet"
          description="An admin assigns programs to program managers. Until then there is nothing here to run."
        />
      ) : (
        <section>
          <h2 className="text-base font-bold text-ink-900 md:text-lg">
            Your programs
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {programs.map((program) => (
              <li
                key={program.slug}
                className="rounded-xl border border-border bg-surface p-4 shadow-sm"
              >
                <h3 className="text-sm font-bold text-ink-900">
                  {program.title}
                </h3>
                <p className="mt-3 text-sm text-ink-600">
                  Scheduling, attendance and enrolments for this program appear
                  here as they are built.
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
