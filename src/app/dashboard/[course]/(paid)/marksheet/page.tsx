import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import {
  AssessmentMarksTable,
  CourseMarksTable,
} from "@/components/dashboard/marksheet/MarksTable";
import { ModuleBreakdown } from "@/components/dashboard/marksheet/ModuleBreakdown";
import { ScoreBand } from "@/components/dashboard/marksheet/ScoreBand";
import { BackLink } from "@/components/ui/BackLink";
import { Container } from "@/components/ui/Container";
import { getStudent } from "@/lib/data/student";
import { getMarksheet } from "@/lib/data/marksheet-db";

/**
 * Every mark a student has earned in one program: the two headline scores, a
 * row per course, the term assessments, then the module-level detail.
 *
 * The route param is called `course` to match the sibling pages, but it holds
 * the *program* slug.
 *
 * Rendered per request — marks are per-student and change as work is graded.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/dashboard/[course]/marksheet">): Promise<Metadata> {
  const { course } = await params;
  const student = await getStudent();
  const marksheet = await getMarksheet(course, student.id);

  return {
    title: marksheet ? `Marksheet · ${marksheet.program.title}` : "Program not found",
  };
}

export default async function MarksheetPage({
  params,
}: PageProps<"/dashboard/[course]/marksheet">) {
  const { course } = await params;
  const student = await getStudent();
  const marksheet = await getMarksheet(course, student.id);

  // Not enrolled, or no such program — same answer either way.
  if (!marksheet) notFound();

  const {
    program,
    criteria,
    current,
    aggregate,
    courses,
    courseTotal,
    assessments,
    assessmentTotal,
    modules,
  } = marksheet;

  return (
    <>
      <DashboardHeader />

      <main id="main" className="flex-1 py-8 md:py-10">
        <Container size="wide">
          <BackLink href={`/dashboard/${program.slug}/overview`}>
            Back to overview
          </BackLink>

          <header className="mt-5">
            <p className="text-sm text-ink-600">
              Hi {student.firstName}, this is your {program.title} program
            </p>
            <h1 className="mt-1 text-xl font-extrabold tracking-tight text-ink-900 md:text-2xl">
              Marksheet
            </h1>
          </header>

          <div className="mt-6 space-y-6 lg:mt-8 lg:space-y-8">
            <ScoreBand
              current={current}
              aggregate={aggregate}
              criteria={criteria}
            />

            <CourseMarksTable rows={courses} total={courseTotal} />

            {/* Only shown when the program actually has term assessments. */}
            {assessments.length > 0 ? (
              <AssessmentMarksTable rows={assessments} total={assessmentTotal} />
            ) : null}

            <ModuleBreakdown courses={modules} />
          </div>
        </Container>
      </main>
    </>
  );
}
