import { ArrowLeft, Clock3, FileCheck2, Lock, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { TestRunner } from "@/components/dashboard/tests/TestRunner";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { startAttempt } from "@/lib/actions/attempts";
import { courseDetailsHref } from "@/lib/curriculum/links";
import { FINAL_TEST_PASS_PERCENT, MIN_TERM_PERCENT } from "@/lib/curriculum/rules";
import { moduleTestLockReason } from "@/lib/curriculum/status";
import type { AssessmentView } from "@/lib/curriculum/types";
import { loadAttemptForStudent } from "@/lib/data/attempt";
import { getProgramCurriculum } from "@/lib/data/curriculum-db";
import { getStudent } from "@/lib/data/student";

/**
 * Sitting a paper — a course's final test, or a checkpoint's mid/end-term.
 *
 * One route for both, because to a student they are the same act: open the
 * paper, answer, submit, get the mark. What differs — how many attempts, what
 * the marks are worth, whether the score gates the next course — is data on the
 * paper, not a different screen.
 *
 * The route param is called `course` to match its sibling pages but holds the
 * **program** slug; `test` is the course (or checkpoint) whose paper this is.
 * `?a=` is the attempt in flight, which is what makes a reload land back in the
 * same sitting rather than on the cover page. `?m=` names a module, and then
 * the paper is that module's test rather than the course's final — same screen,
 * same runner, a narrower gate.
 *
 * Rendered per request, always: there is a clock running.
 */
export const dynamic = "force-dynamic";

type Params = PageProps<"/dashboard/[course]/tests/[test]">;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { test } = await params;
  return { title: `Test — ${test}` };
}

export default async function Page({ params, searchParams }: Params) {
  const { course: programSlug, test: courseKey } = await params;
  const query = await searchParams;

  const student = await getStudent();

  const curriculum = await getProgramCurriculum(programSlug, {
    studentId: student.id,
  });
  if (!curriculum) notFound();

  const course = curriculum.courses.find((row) => row.id === courseKey);
  if (!course) notFound();

  const moduleKey = typeof query.m === "string" ? query.m : "";
  const moduleView = moduleKey
    ? course.modules.find((row) => row.id === moduleKey)
    : undefined;
  if (moduleKey && !moduleView) notFound();

  // A module's test, a checkpoint's term paper, or a numbered course's final —
  // never more than one, and the rest of this screen does not care which.
  const paper = moduleView
    ? moduleView.test
    : (course.termTest ?? course.finalTest);
  if (!paper || paper.nodeStatus !== "published") notFound();

  /**
   * Which gate applies. A module test waits on its own module's lessons; the
   * course's final waits on the whole course. Resolved here so the cover below
   * has one question to answer rather than three.
   */
  const lockedReason = moduleView
    ? (course.locked ? course.lockedReason : moduleTestLockReason(moduleView))
    : course.locked
      ? course.lockedReason
      : course.finalTestLocked
        ? course.finalTestLockedReason
        : null;

  const backHref = courseDetailsHref(programSlug, courseKey);
  const attemptId = typeof query.a === "string" ? query.a : "";

  if (attemptId) {
    const attempt = await loadAttemptForStudent(attemptId, student.id);

    return (
      <>
        <DashboardHeader />
        <TestRunner
          attempt={attempt}
          title={paper.title}
          backHref={backHref}
          proctored={paper.proctored}
        />
      </>
    );
  }

  return (
    <>
      <DashboardHeader />
      <main className="py-8">
        <Container size="wide">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
          >
            <ArrowLeft size={16} aria-hidden />
            Back to the curriculum
          </Link>

          <Cover
            paper={paper}
            programSlug={programSlug}
            courseKey={courseKey}
            moduleKey={moduleKey}
            context={moduleView ? moduleView.title : course.title}
            lockedReason={lockedReason}
            error={typeof query.e === "string" ? query.e : ""}
          />
        </Container>
      </main>
    </>
  );
}

/**
 * The page before the clock starts.
 *
 * Everything a student needs to decide whether to begin *now* — how long, how
 * many marks, how many attempts are left, and what happens if they switch away
 * — because once they press the button the clock is the server's and there is
 * no pausing it. Telling them afterwards would be too late to be a warning.
 */
function Cover({
  paper,
  programSlug,
  courseKey,
  moduleKey,
  context,
  lockedReason,
  error,
}: {
  paper: AssessmentView;
  programSlug: string;
  courseKey: string;
  /** Non-empty when this is a module's test rather than the course's paper. */
  moduleKey: string;
  /** What the paper is *of* — the module for a module test, else the course. */
  context: string;
  /** Why it cannot be started, already resolved by the caller. */
  lockedReason: string | null;
  error: string;
}) {
  const term = paper.scope === "term_test";
  const attemptsLeft = paper.maxAttempts - paper.attemptsUsed;
  const exhausted = attemptsLeft <= 0;
  const marks = paper.questionCount * paper.marksPerQuestion;

  return (
    <section className="mx-auto mt-6 max-w-2xl rounded-xl border border-border bg-surface p-6 shadow-sm md:p-8">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-brand-50">
        <FileCheck2 size={24} aria-hidden className="text-brand-600" />
      </span>

      <h1 className="mt-4 text-xl font-extrabold text-ink-900 md:text-2xl">
        {paper.title}
      </h1>
      <p className="mt-1 text-sm text-ink-600">
        {term
          ? `${paper.term === "mid" ? "Mid-term" : "End-term"} assessment · ${context}`
          : moduleKey
            ? `Module test · ${context}`
            : `Final test · ${context}`}
      </p>

      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        <Fact label="Questions" value={String(paper.questionCount)} />
        <Fact label="Marks" value={String(marks)} />
        <Fact label="Time" value={`${paper.durationMinutes} min`} />
      </dl>

      <ul className="mt-6 space-y-2 text-sm text-ink-700">
        <Rule icon={Clock3}>
          The clock starts when you begin and does not pause. When it runs out
          the paper goes in as it stands, marked on what you have answered.
        </Rule>
        {paper.proctored ? (
          <Rule icon={ShieldAlert}>
            Switching tabs, leaving the window or copying is recorded. After ten
            warnings the paper submits itself.
          </Rule>
        ) : null}
        <Rule icon={Lock}>
          {term
            ? `One attempt only. It counts toward your aggregate, and you need ${MIN_TERM_PERCENT}% across the mid-term and end-term together to graduate.`
            : `${paper.maxAttempts} attempts, best score counts. You need ${FINAL_TEST_PASS_PERCENT}% to open the next course.`}
        </Rule>
      </ul>

      {paper.best ? (
        <p className="mt-6 rounded-lg border border-border bg-ink-50 p-3 text-sm text-ink-700">
          You scored{" "}
          <span className="font-extrabold tabular-nums text-ink-900">
            {paper.best.scored}/{paper.best.maxScore}
          </span>{" "}
          ({paper.best.percent}%)
          {paper.maxAttempts > 1 ? " — your best so far." : "."}
        </p>
      ) : null}

      {/*
        A locked paper is refused by `startAttempt`, so without this the button
        would be a control that renders and does not work — the one thing the
        capability rules exist to prevent. The reason is shown rather than the
        button being quietly hidden: "why can't I start?" is the only question a
        student has on this screen.

        **Two locks, and both have to be checked.** `course.locked` is whether
        the course is open at all — the previous course's assignments and final
        test. `finalTestLocked` is whether *this paper* is open, which is a
        different question with a different answer: the course can be wide open
        and its final still shut because a lesson, a module test or an
        assignment inside it is outstanding. `findPaper` refuses on the second
        as well as the first, so checking only the first is how the curriculum
        came to say "Locked" while this screen offered "Start the paper" and the
        press landed on a 404.

        A checkpoint has no `finalTestLocked` of its own — its gate is the
        checkpoint itself, already answered by `course.locked` above — so the
        term-paper case is unaffected.
      */}
      {lockedReason ? (
        <p className="mt-6 flex items-start gap-2 rounded-lg border border-border bg-ink-50 p-3 text-sm text-ink-700">
          <Lock size={16} aria-hidden className="mt-0.5 shrink-0 text-ink-400" />
          {lockedReason}
        </p>
      ) : error === "no-attempts-left" || exhausted ? (
        <p className="mt-6 rounded-lg border border-danger-500 bg-danger-50 p-3 text-sm font-medium text-danger-700">
          {paper.maxAttempts === 1
            ? "You have sat this paper. It allows one attempt."
            : `You have used all ${paper.maxAttempts} attempts.`}
        </p>
      ) : (
        <form action={startAttempt} className="mt-6">
          <input type="hidden" name="programSlug" value={programSlug} />
          <input type="hidden" name="courseKey" value={courseKey} />
          {moduleKey ? (
            <input type="hidden" name="moduleKey" value={moduleKey} />
          ) : null}
          <Button type="submit" size="lg">
            {paper.openAttemptId ? "Resume the paper" : "Start the paper"}
          </Button>
          {paper.maxAttempts > 1 && !paper.openAttemptId ? (
            <p className="mt-2 text-xs text-ink-500">
              {attemptsLeft} of {paper.maxAttempts} attempts left.
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dt className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-extrabold tabular-nums text-ink-900">
        {value}
      </dd>
    </div>
  );
}

function Rule({
  icon: Icon,
  children,
}: {
  icon: typeof Clock3;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-2">
      <Icon size={16} aria-hidden className="mt-0.5 shrink-0 text-ink-400" />
      <span>{children}</span>
    </li>
  );
}
