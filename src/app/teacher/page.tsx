import { ClipboardCheck, Library, PencilLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeading, StatTile } from "@/components/staff/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireRole } from "@/lib/auth/guards";
import { programsForTeacher } from "@/lib/data/curriculum-staff";
import { pendingGradingCount } from "@/lib/data/grading";

/**
 * The teacher's landing screen: the programs they author, and how much of each
 * is still unpublished.
 *
 * Read from the database rather than the old static tree, and through
 * `programsForTeacher`, which scopes to their assignments in the query. Each
 * card is a way into the authoring screens — the previous version listed
 * courses that were not links, which is a list you can only look at.
 *
 * **Drafts is what is left to finish; Awaiting grading is somebody waiting.**
 * The second used to read an em dash with the hint "Grading lands with
 * submissions" — honest at the time, because a tile here is a real query or it
 * is nothing. It is a real query now (`pendingGradingCount`, scoped to this
 * teacher's cohorts like everything else) and it links to the queue, because a
 * count with no way to act on it is a nag rather than a tool.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Teacher" };

export default async function TeacherOverviewPage() {
  const user = await requireRole("teacher");
  const [programs, pendingCount] = await Promise.all([
    programsForTeacher(user),
    pendingGradingCount(user),
  ]);

  const courseCount = programs.reduce((sum, entry) => sum + entry.courses, 0);
  const draftCount = programs.reduce((sum, entry) => sum + entry.drafts, 0);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeading
        title={`Hi ${user.name.split(" ")[0]}`}
        description="The programs you author."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Courses"
          value={courseCount}
          hint={user.role === "admin" ? "All courses" : "In your programs"}
          icon={Library}
          href="/teacher/programs"
        />
        <StatTile
          label="Unpublished"
          value={draftCount}
          hint="Drafts students cannot see yet"
          icon={PencilLine}
          href="/teacher/programs"
        />
        {/* The number a teacher is judged on, and the one thing on this page
            that is somebody else waiting. It is a link because it is always
            actionable — the queue is one click, and a count with no way to it
            is a nag rather than a tool. */}
        <StatTile
          label="Awaiting grading"
          value={pendingCount}
          hint={
            pendingCount === 0
              ? "Nothing waiting"
              : `${pendingCount === 1 ? "Hand-in" : "Hand-ins"} to mark`
          }
          icon={ClipboardCheck}
          href="/teacher/grading"
        />
      </div>

      {programs.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No programs assigned yet"
          description="An admin or a program manager assigns teachers to a program. Once you have one, its courses appear here."
        />
      ) : (
        <section>
          <h2 className="text-base font-bold text-ink-900 md:text-lg">
            My programs
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {programs.map((program) => (
              <li key={program.slug}>
                <Link
                  href={`/teacher/programs/${program.slug}`}
                  className="block h-full rounded-xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong hover:bg-surface-muted"
                >
                  <h3 className="text-sm font-bold text-ink-900">
                    {program.title}
                  </h3>
                  <p className="mt-1 text-xs text-ink-500">
                    {count(program.courses, "course")} ·{" "}
                    {count(program.modules, "module")} ·{" "}
                    {count(program.subtopics, "subtopic")}
                  </p>
                  {program.drafts > 0 ? (
                    <p className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      {program.drafts} still draft
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}
