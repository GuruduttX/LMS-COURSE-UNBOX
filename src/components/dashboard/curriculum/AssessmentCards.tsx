import { Award, Download, Lock } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { finalTestHref } from "@/lib/curriculum/links";
import type { AssessmentView, CourseView } from "@/lib/curriculum/types";

/**
 * What sits below a course's contents: its test, and its certificate.
 *
 * Lifted out of CoursePanel so the mobile course cards can render them too.
 * They are not desktop furniture — the final test is the thing that unlocks the
 * next course, so a phone that showed the modules but not the test would leave
 * a student unable to finish the program on the device most of them use.
 */

/**
 * The final test — the thing that opens the next course.
 *
 * Three states, and each says what to do next: not yet reachable (with the
 * reason), reachable (with the way in), or sat (with the best score and whether
 * that was a pass). The score is the **best** attempt, which is the one the
 * gate reads.
 */
export function FinalTestCard({
  programSlug,
  course,
  test,
}: {
  programSlug: string;
  course: CourseView;
  test: AssessmentView;
}) {
  const best = test.best;

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-ink-900">{test.title}</h3>
          <p className="mt-1 text-sm text-ink-600">
            {test.questionCount}{" "}
            {test.questionCount === 1 ? "question" : "questions"} ·{" "}
            {test.durationMinutes} min
            {test.proctored ? " · proctored" : ""} · covers this course only.
          </p>
          {course.finalTestLocked && !best ? (
            <p className="mt-2 inline-flex items-start gap-1.5 text-sm text-ink-600">
              <Lock size={14} aria-hidden className="mt-0.5 shrink-0 text-ink-400" />
              {course.finalTestLockedReason}
            </p>
          ) : null}
        </div>

        {best ? (
          <div className="text-right">
            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
              Best score
            </p>
            <p
              className={cn(
                "text-xl font-extrabold tabular-nums",
                best.passed ? "text-success-600" : "text-danger-600",
              )}
            >
              {best.percent}%
            </p>
            <p className="text-2xs font-medium text-ink-500">
              {best.passed ? "Passed" : "Not passed yet"}
            </p>
          </div>
        ) : course.finalTestLocked ? null : (
          <ButtonLink
            href={finalTestHref(programSlug, course.id)}
            variant="secondary"
          >
            Attempt test
          </ButtonLink>
        )}
      </div>
    </section>
  );
}

/**
 * A checkpoint's mid- or end-term paper.
 *
 * Its own card rather than reusing the final test's, because almost everything
 * it has to say is different: one attempt instead of three, so "Best score"
 * would be a lie and there is no second go to offer; and it gates nothing —
 * a checkpoint is reached by finishing what comes before it, and the mark it
 * produces is spent on the aggregate and the combined term rule.
 */
export function TermPaperCard({
  programSlug,
  course,
  test,
}: {
  programSlug: string;
  course: CourseView;
  test: AssessmentView;
}) {
  const sat = test.best;
  const marks = test.questionCount * test.marksPerQuestion;

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-ink-900">{test.title}</h3>
          <p className="mt-1 text-sm text-ink-600">
            {test.term === "mid" ? "Mid-term" : "End-term"} ·{" "}
            {test.questionCount}{" "}
            {test.questionCount === 1 ? "question" : "questions"} · {marks} marks
            · {test.durationMinutes} min · proctored, one attempt.
          </p>
          {course.locked ? (
            <p className="mt-2 inline-flex items-start gap-1.5 text-sm text-ink-600">
              <Lock size={14} aria-hidden className="mt-0.5 shrink-0 text-ink-400" />
              {course.lockedReason}
            </p>
          ) : null}
        </div>

        {sat ? (
          <div className="text-right">
            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
              Your score
            </p>
            <p className="text-xl font-extrabold tabular-nums text-ink-900">
              {sat.percent}%
            </p>
            <p className="text-2xs font-medium text-ink-500">
              {sat.scored}/{sat.maxScore}
            </p>
          </div>
        ) : course.locked ? null : (
          <ButtonLink href={finalTestHref(programSlug, course.id)}>
            Sit the paper
          </ButtonLink>
        )}
      </div>
    </section>
  );
}

/** Gold appears only here: earned, never as an action colour elsewhere. */
export function CertificateCard({ title }: { title: string }) {
  return (
    <section className="rounded-xl border border-gold-200 bg-gold-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <Award size={20} aria-hidden className="mt-0.5 shrink-0 text-gold-600" />
          <div>
            <h3 className="text-base font-bold text-ink-900">
              Course certificate
            </h3>
            <p className="mt-1 text-sm text-ink-700">
              You completed {title}. Download the certificate for your profile.
            </p>
          </div>
        </div>

        <Button variant="gold" size="sm">
          <Download size={16} aria-hidden />
          Download
        </Button>
      </div>
    </section>
  );
}
