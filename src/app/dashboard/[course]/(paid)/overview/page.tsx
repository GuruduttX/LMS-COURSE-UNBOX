import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { CommunityCard } from "@/components/dashboard/overview/CommunityCard";
import { ContinueCard } from "@/components/dashboard/overview/ContinueCard";
import { MetricStrip } from "@/components/dashboard/overview/MetricStrip";
import { OverviewHeader } from "@/components/dashboard/overview/OverviewHeader";
import {
  OverviewTabs,
  type OverviewTab,
} from "@/components/dashboard/overview/OverviewTabs";
import { PlacementCard } from "@/components/dashboard/overview/PlacementCard";
import { SessionsCard } from "@/components/dashboard/overview/SessionsCard";
import { TasksCard } from "@/components/dashboard/overview/TasksCard";
import { getStudent } from "@/lib/data/student";
import { getRecentStudentTasks } from "@/lib/data/tasks";
import { SupportCard } from "@/components/dashboard/overview/SupportCard";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/cn";
import { getCourseOverview } from "@/lib/data/course-overview";
import { studentBatchDeadline } from "@/lib/data/batches";
import { getCourseSessions } from "@/lib/data/sessions";
import { courseDetailsHref, resumeHref } from "@/lib/curriculum/links";
import { getProgramCurriculum } from "@/lib/data/curriculum-db";

/**
 * Per-course overview. Every block is its own component under
 * components/dashboard/overview — this file only fetches once and lays out.
 *
 * Rendered per request: the data is per-student and the schedule is relative to
 * "today", neither of which can be cached across users or across days.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/dashboard/[course]/overview">): Promise<Metadata> {
  const { course } = await params;
  const student = await getStudent();
  const overview = await getCourseOverview(course, student.id);

  return { title: overview ? overview.course.title : "Course not found" };
}

export default async function CourseOverviewPage({
  params,
  searchParams,
}: PageProps<"/dashboard/[course]/overview">) {
  const { course } = await params;
  const { tab } = await searchParams;
  const student = await getStudent();
  const overview = await getCourseOverview(course, student.id);

  // Not enrolled, or no such course — same answer either way.
  if (!overview) notFound();

  // Only Resume needs the tree, but it needs the *whole* tree: "where was I"
  // is a question about the program, not about this card. `resumeHref` takes
  // the loaded curriculum rather than reading the database itself, which is
  // what keeps lib/curriculum/links.ts pure and client-safe.
  const curriculum = await getProgramCurriculum(course, {
    studentId: student.id,
  });

  // The rail only wants the top of the list; the full schedule lives at
  // /dashboard/[course]/sessions, which reads the same source. A null return
  // means "no such program or not enrolled" — already handled by the notFound
  // above, so here it is simply an empty rail.
  const courseSessions = await getCourseSessions(course, student.id);
  const upcoming = courseSessions?.upcoming.slice(0, 3) ?? [];

  // Same arrangement as the schedule above: the card shows the top of the list
  // and /dashboard/[course]/tasks reads the same source for the whole of it.
  const tasks = await getRecentStudentTasks(course, student.id);

  // Their own cohort's end date, not the program's — see studentBatchDeadline.
  const deadline = await studentBatchDeadline(student.id, course);

  const { course: courseData, metrics, current, assessment } = overview;

  // Only meaningful below lg, where the columns stack; anything unrecognised
  // reads as the default tab rather than 404ing.
  const activeTab: OverviewTab = tab === "live" ? "live" : "overview";
  const isLive = activeTab === "live";

  return (
    <>
      <DashboardHeader />

      <main id="main" className="flex-1 py-8 md:py-10">
        <Container size="wide">
          <OverviewHeader
            studentFirstName={student.firstName}
            title={courseData.title}
            isComplete={overview.isComplete}
            deadline={deadline}
          />

          <OverviewTabs slug={courseData.slug} active={activeTab} />

          {/* From lg the three metrics ride together above both columns; below
              it each tab carries the ones it is about. */}
          <div className="mt-6 hidden lg:mt-8 lg:block">
            <MetricStrip metrics={metrics} />
          </div>

          {/* Main column carries the work; the rail carries the schedule. The
              rail grows a little on xl so the extra width is shared, not all
              dumped into the main column. */}
          <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div
              className={cn(
                "space-y-6 lg:space-y-8",
                isLive && "hidden lg:block",
              )}
            >
              <MetricStrip
                metrics={metrics}
                show={["progress", "score"]}
                className="lg:hidden"
              />
              <ContinueCard
                current={current}
                assessment={assessment}
                resumeHref={
                  curriculum
                    ? resumeHref(curriculum)
                    : courseDetailsHref(courseData.slug)
                }
                detailsHref={courseDetailsHref(courseData.slug)}
              />
              <TasksCard slug={courseData.slug} tasks={tasks} />
              <PlacementCard />
              <SupportCard />
            </div>

            <aside
              className={cn(
                "space-y-6 lg:space-y-8",
                !isLive && "hidden lg:block",
              )}
              aria-label="Schedule and community"
            >
              <MetricStrip
                metrics={metrics}
                show={["attendance"]}
                className="lg:hidden"
              />
              <SessionsCard slug={courseData.slug} sessions={upcoming} />
              <CommunityCard />
            </aside>
          </div>
        </Container>
      </main>
    </>
  );
}
