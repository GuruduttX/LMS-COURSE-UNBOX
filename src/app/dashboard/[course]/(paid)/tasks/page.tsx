import { CheckCircle2, ClipboardList, Timer } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { StudentTaskCard } from "@/components/dashboard/tasks/StudentTaskCard";
import { BackLink } from "@/components/ui/BackLink";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";
import { getStudent } from "@/lib/data/student";
import { getStudentTasks } from "@/lib/data/tasks";

/**
 * Everything a student has been told to do on one program.
 *
 * Two sections, and the order is the point: **tasks set for them by name come
 * first**, then the ones their whole cohort got. A task addressed to one person
 * is usually a correction or a catch-up, and burying it under six cohort-wide
 * notices is how it gets missed.
 *
 * The route param is called `course` to match the sibling pages, but it holds
 * the *program* slug — renaming the segment would break the dashboard and
 * overview links for no user-visible gain.
 *
 * Rendered per request: the list is per-student and changes the moment a
 * teacher sets one.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/dashboard/[course]/tasks">): Promise<Metadata> {
  const { course } = await params;
  const student = await getStudent();
  const tasks = await getStudentTasks(course, student.id);

  return {
    title: tasks ? `Tasks · ${tasks.program.title}` : "Program not found",
  };
}

export default async function TasksPage({
  params,
}: PageProps<"/dashboard/[course]/tasks">) {
  const { course } = await params;
  const student = await getStudent();
  const data = await getStudentTasks(course, student.id);

  // Not enrolled, or no such program — same answer either way.
  if (!data) notFound();

  const all = [...data.mine, ...data.everyone];
  const nothing = all.length === 0;

  /**
   * Pending by the same rule `TaskStatusPill` uses — a task wanting a hand-in
   * counts until *this* student submits, and one wanting nothing counts until
   * staff close it. Kept in step with the pill by hand, which is fine for one
   * expression and would not be for two.
   */
  const pending = all.filter((task) =>
    task.submission.kinds.length > 0 ? !task.mySubmission : !task.completedAt,
  ).length;

  return (
    <>
      <DashboardHeader />

      <main id="main" className="flex-1 py-8 md:py-10">
        <Container size="wide">
          <BackLink href={`/dashboard/${data.program.slug}/overview`}>
            Back to overview
          </BackLink>

          <header className="mt-5">
            <p className="text-sm text-ink-600">
              Hi {student.firstName}, this is your {data.program.title} program
            </p>
            <h1 className="mt-1 text-xl font-extrabold tracking-tight text-ink-900 md:text-2xl">
              Tasks
            </h1>

            {/* The count is the headline answer — "two left" is what someone
                came to find out, before they read a single card. */}
            {pending > 0 ? (
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-semibold text-warning-700">
                <Timer size={15} aria-hidden />
                {pending} pending
              </p>
            ) : nothing ? null : (
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-semibold text-success-700">
                <CheckCircle2 size={15} aria-hidden />
                All done
              </p>
            )}
          </header>

          <div className="mt-6 space-y-8 lg:mt-8">
            {nothing ? (
              <EmptyState
                icon={ClipboardList}
                title="No tasks right now"
                description="When a teacher sets you something to do outside your lessons, it appears here."
              />
            ) : (
              <>
                <TaskSection
                  title="For you"
                  description="Set for you by name."
                  tasks={data.mine}
                  programSlug={data.program.slug}
                />
                <TaskSection
                  title="For your program"
                  description="Set for everyone on the program."
                  tasks={data.everyone}
                  programSlug={data.program.slug}
                />
              </>
            )}
          </div>
        </Container>
      </main>
    </>
  );
}

/** Renders nothing when the section is empty — an empty "For you" heading tells
 *  a student nothing, the same call the sessions screen makes per kind. */
function TaskSection({
  title,
  description,
  tasks,
  programSlug,
}: {
  title: string;
  description: string;
  tasks: Parameters<typeof StudentTaskCard>[0]["task"][];
  programSlug: string;
}) {
  if (tasks.length === 0) return null;

  return (
    <section>
      <h2 className="text-base font-bold text-ink-900 md:text-lg">{title}</h2>
      <p className="mt-0.5 text-sm text-ink-600">{description}</p>

      {/* Two columns from `sm` up: a task card is a summary, and stretching one
          across a desktop screen made a line of text nobody wants to read. */}
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tasks.map((task) => (
          <StudentTaskCard key={task.id} task={task} programSlug={programSlug} />
        ))}
      </ul>
    </section>
  );
}
