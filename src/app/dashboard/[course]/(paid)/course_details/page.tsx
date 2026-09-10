import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { CourseCards } from "@/components/dashboard/curriculum/CourseCards";
import { CoursePanel } from "@/components/dashboard/curriculum/CoursePanel";
import { CourseRail } from "@/components/dashboard/curriculum/CourseRail";
import { BackLink } from "@/components/ui/BackLink";
import { Container } from "@/components/ui/Container";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { getStudent } from "@/lib/data/student";
import { formatDate } from "@/lib/curriculum/format";
import { defaultCourseId } from "@/lib/curriculum/status";
import { getProgramCurriculum } from "@/lib/data/curriculum-db";

/**
 * The courses inside one program, and how far the student has got in each.
 * Course rail on the left, the selected course's detail on the right.
 *
 * Note the route param is called `course` for historical reasons but holds the
 * *program* slug; the selected course is `?c=`. Renaming the segment would
 * break the overview and dashboard links for no user-visible gain.
 *
 * Per request for the same reasons as the overview page — the data is
 * per-student and deadlines are read against today.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/dashboard/[course]/course_details">): Promise<Metadata> {
  const { course } = await params;
  const curriculum = await getProgramCurriculum(course);

  return {
    title: curriculum
      ? `Curriculum · ${curriculum.program.title}`
      : "Program not found",
  };
}

export default async function CourseDetailsPage({
  params,
  searchParams,
}: PageProps<"/dashboard/[course]/course_details">) {
  const { course } = await params;
  const { c } = await searchParams;

  const student = await getStudent();

  // Published content only, joined to this student's progress. Both are the
  // point of the seam: a draft must never reach a student, and a status is
  // theirs rather than something stored on the shared syllabus.
  const curriculum = await getProgramCurriculum(course, {
    studentId: student.id,
  });

  // Not enrolled, or no such program — same answer either way.
  if (!curriculum) notFound();
  if (curriculum.courses.length === 0) notFound();

  const { program, courses, totals, deadline } = curriculum;

  // An unknown ?c= falls back rather than 404s: the course list is right there,
  // and a stale link should still land somewhere useful.
  const requested = typeof c === "string" ? c : undefined;
  const active =
    courses.find((item) => item.id === requested) ??
    courses.find((item) => item.id === defaultCourseId(courses)) ??
    courses[0];

  return (
    <>
      <DashboardHeader />

      <main id="main" className="flex-1 py-8 md:py-10">
        <Container size="wide">
          {/* Below lg, an arrow instead of the trail. It always points at the
              overview now: the mobile list is one screen, so there is no longer
              an "out of this course" step above it. */}
          <BackLink
            href={`/dashboard/${program.slug}/overview`}
            className="lg:hidden"
          >
            Overview
          </BackLink>

          <nav aria-label="Breadcrumb" className="hidden lg:block">
            <ol className="flex flex-wrap items-center gap-1 text-xs font-medium text-ink-500">
              <li>
                <Link href="/dashboard" className="hover:text-ink-800">
                  Dashboard
                </Link>
              </li>
              <ChevronRight size={14} aria-hidden className="text-ink-400" />
              <li>
                <Link
                  href={`/dashboard/${program.slug}/overview`}
                  className="hover:text-ink-800"
                >
                  {program.title}
                </Link>
              </li>
              <ChevronRight size={14} aria-hidden className="text-ink-400" />
              <li aria-current="page" className="text-ink-700">
                Curriculum
              </li>
            </ol>
          </nav>

          <header className="mt-4">
            <p className="text-sm text-ink-600">
              Hi {student.firstName}, this is your {program.title} program
            </p>
            <h1 className="mt-1 text-xl font-extrabold tracking-tight text-ink-900 md:text-2xl">
              Curriculum
            </h1>
            {deadline ? (
              <p className="mt-2 text-sm text-ink-600">
                Program deadline:{" "}
                <span className="font-semibold text-ink-800">
                  {formatDate(deadline)}
                </span>
              </p>
            ) : null}

            <ProgressBar
              className="mt-4 max-w-md"
              value={totals.percent}
              tone={totals.percent === 100 ? "success" : "brand"}
              label={`${totals.done} of ${totals.total} items complete`}
            />
          </header>

          {/* Two different shapes for the same curriculum. Below lg it is one
              list of expandable course cards. From lg it is the rail beside the
              selected course's panel, unchanged — course titles run to two
              lines, so the rail gets real width rather than the minimum that
              fits, and the panel takes the rest. */}
          <div className="mt-6 grid items-start gap-6 lg:mt-8 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[24rem_minmax(0,1fr)]">
            <div className="lg:hidden">
              {/* `requested`, not `active.id`: only a link that actually named
                  a course should open one. The fallback selection exists for
                  the desktop panel, which must always show something — here it
                  would open a card the student did not ask for. */}
              <CourseCards curriculum={curriculum} openId={requested} />
            </div>

            <div className="hidden lg:block">
              <CourseRail
                programSlug={program.slug}
                courses={courses}
                activeId={active.id}
              />
            </div>

            <div className="hidden lg:block">
              <CoursePanel curriculum={curriculum} course={active} />
            </div>
          </div>
        </Container>
      </main>
    </>
  );
}
