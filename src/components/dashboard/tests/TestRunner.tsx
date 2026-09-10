"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { recordViolation, saveAnswer, submitAttempt } from "@/lib/actions/attempts";
import { cn } from "@/lib/cn";
import {
  EMPTY_ANSWER,
  isAnswered,
  type AnswerValue,
} from "@/lib/curriculum/question-kinds";
import { MAX_PROCTOR_WARNINGS } from "@/lib/curriculum/rules";
import type { RunnerQuestion } from "@/lib/curriculum/types";
import type { AttemptResult, RunnerAttempt } from "@/lib/data/attempt";
import { VIOLATION_LABEL, type ViolationType } from "@/lib/validation/attempt";

/**
 * The paper, as a student sits it.
 *
 * One question at a time with a navigator, rather than a long scroll: on a
 * phone a fifty-question scroll makes "have I answered everything?" impossible
 * to answer, and the navigator turns that into a glance.
 *
 * **Answers are saved as they are given**, not gathered up for the end. The end
 * may never come — a flat battery, a dropped connection, a deadline reached
 * while the tab is asleep — and the server marks whatever it has stored. Saving
 * is fire-and-forget on purpose: a student should never be blocked from moving
 * to question 12 because the write for question 11 is slow.
 *
 * The countdown here is **display only**. It is drawn from the server's
 * `deadlineAt`, and running it out does not submit anything — the server
 * decides that, when the submit lands or when the next read notices. A clock a
 * student could put back by changing their system time would be no clock at all.
 *
 * Proctoring is the same shape: this reports events, the server counts them.
 */
export function TestRunner({
  attempt,
  title,
  backHref,
  proctored,
}: {
  attempt: RunnerAttempt;
  title: string;
  backHref: string;
  proctored: boolean;
}) {
  if (attempt.result) {
    return (
      <Result
        result={attempt.result}
        title={title}
        backHref={backHref}
        questions={attempt.questions}
      />
    );
  }

  return (
    <Sitting
      attempt={attempt}
      title={title}
      backHref={backHref}
      proctored={proctored}
    />
  );
}

type Phase = "sitting" | "grading" | "done";

function Sitting({
  attempt,
  title,
  backHref,
  proctored,
}: {
  attempt: RunnerAttempt;
  title: string;
  backHref: string;
  proctored: boolean;
}) {
  const questions = attempt.questions;

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(
    () => attempt.answers,
  );
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("sitting");
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [warnings, setWarnings] = useState(attempt.violationCount);
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(attempt.deadlineAt).getTime() - Date.now()),
  );

  const question = questions[index];
  const answered = questions.filter((row) =>
    isAnswered(row.kind, answers[row.id] ?? EMPTY_ANSWER),
  ).length;

  /** Guards every path into submission, so a double click cannot double-grade. */
  const submitting = useRef(false);

  const finish = useCallback(async () => {
    if (submitting.current) return;
    submitting.current = true;
    setPhase("grading");

    // The message is the point of this screen, so it gets long enough to read.
    // Marking a fifty-question paper takes milliseconds; a result that flashed
    // past would leave a student wondering whether anything was checked.
    const [finished] = await Promise.all([
      submitAttempt(attempt.id),
      new Promise((resolve) => setTimeout(resolve, 1800)),
    ]);

    setResult(finished.result);
    setPhase("done");
  }, [attempt.id]);

  /* ------------------------------ the clock ------------------------------ */

  useEffect(() => {
    const deadline = new Date(attempt.deadlineAt).getTime();

    const tick = window.setInterval(() => {
      const left = Math.max(0, deadline - Date.now());
      setRemaining(left);
      // Out of time: hand in what there is. The server would end it anyway on
      // the next read; doing it here means the student sees their mark rather
      // than a frozen page.
      if (left === 0) void finish();
    }, 1000);

    return () => window.clearInterval(tick);
  }, [attempt.deadlineAt, finish]);

  /* ----------------------------- proctoring ------------------------------ */

  useEffect(() => {
    if (!proctored || phase !== "sitting") return;

    const report = async (type: ViolationType) => {
      const outcome = await recordViolation(attempt.id, type);
      if (outcome.count > 0) setWarnings(outcome.count);
      if (outcome.ended) {
        void finish();
        return;
      }
      setWarning(VIOLATION_LABEL[type]);
    };

    const onHidden = () => {
      if (document.hidden) void report("hidden");
    };
    const onBlur = () => void report("blur");
    const onCopy = () => void report("copy");
    const onPaste = () => void report("paste");
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      void report("contextmenu");
    };

    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContextMenu);

    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [attempt.id, finish, phase, proctored]);

  /* ------------------------------ answering ------------------------------ */

  function answer(next: AnswerValue) {
    setAnswers((current) => ({ ...current, [question.id]: next }));
    // Fire and forget: the student's next click must not wait on a round trip,
    // and a failed save is recoverable by answering again — the server keeps
    // whatever it last stored.
    void saveAnswer(attempt.id, question.id, next);
  }

  if (phase === "grading") return <Calculating />;

  if (phase === "done" && result) {
    return (
      <Result
        result={result}
        title={title}
        backHref={backHref}
        questions={questions}
      />
    );
  }

  return (
    <main className="py-6">
      <Container size="wide">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-ink-900">{title}</h1>
            <p className="text-2xs font-medium text-ink-500">
              {answered} of {questions.length} answered
            </p>
          </div>

          <div className="flex items-center gap-4">
            {proctored && warnings > 0 ? (
              <p className="text-2xs font-semibold text-warning-700">
                {warnings} / {MAX_PROCTOR_WARNINGS} warnings
              </p>
            ) : null}
            <p
              className={cn(
                "inline-flex items-center gap-1.5 text-sm font-extrabold tabular-nums",
                remaining < 60_000 ? "text-danger-700" : "text-ink-900",
              )}
              // A minute left is worth announcing to a screen reader; every
              // second is not.
              aria-live={remaining < 60_000 ? "polite" : "off"}
            >
              <Clock3 size={16} aria-hidden />
              {formatClock(remaining)}
            </p>
          </div>
        </header>

        {warning ? (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg border border-warning-500 bg-warning-50 p-3 text-sm font-medium text-warning-700"
          >
            <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
            {warning}. This is recorded — after {MAX_PROCTOR_WARNINGS} warnings
            the paper submits itself.
          </p>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_14rem]">
          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm md:p-6">
            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
              Question {index + 1} of {questions.length}
            </p>
            <h2 className="mt-1.5 text-base font-bold text-ink-900 md:text-lg">
              {question.prompt}
            </h2>

            <div className="mt-5">
              <QuestionBody
                question={question}
                answer={answers[question.id] ?? EMPTY_ANSWER}
                onChange={answer}
              />
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIndex((at) => Math.max(0, at - 1))}
                disabled={index === 0}
              >
                <ArrowLeft size={16} aria-hidden />
                Previous
              </Button>

              {index === questions.length - 1 ? (
                <Button type="button" onClick={() => void finish()}>
                  Submit the paper
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() =>
                    setIndex((at) => Math.min(questions.length - 1, at + 1))
                  }
                >
                  Next
                  <ArrowRight size={16} aria-hidden />
                </Button>
              )}
            </div>
          </section>

          {/*
            The navigator, not a progress bar: on a long paper the question a
            student wants is "which ones have I skipped", and only a grid of
            every question answers it.
          */}
          <aside className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
              Questions
            </p>
            <ol className="mt-3 grid grid-cols-8 gap-1.5 lg:grid-cols-5">
              {questions.map((row, at) => {
                const done = isAnswered(row.kind, answers[row.id] ?? EMPTY_ANSWER);
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setIndex(at)}
                      aria-label={`Question ${at + 1}${done ? ", answered" : ", not answered"}`}
                      aria-current={at === index ? "true" : undefined}
                      className={cn(
                        "flex h-8 w-full items-center justify-center rounded-md text-xs font-bold tabular-nums transition-colors",
                        at === index
                          ? "bg-brand-solid text-white"
                          : done
                            ? "bg-brand-50 text-brand-700 hover:bg-brand-100"
                            : "bg-ink-100 text-ink-600 hover:bg-ink-200",
                      )}
                    >
                      {at + 1}
                    </button>
                  </li>
                );
              })}
            </ol>

            <Button
              type="button"
              className="mt-4 w-full"
              onClick={() => void finish()}
            >
              Submit the paper
            </Button>
            {answered < questions.length ? (
              <p className="mt-2 text-2xs text-ink-500">
                {questions.length - answered} still unanswered. Unanswered
                questions score zero.
              </p>
            ) : null}
          </aside>
        </div>
      </Container>
    </main>
  );
}

/**
 * The moment between finishing and knowing.
 *
 * It says what is actually happening — the answers are being checked against
 * the ones stored with the paper — because "Loading…" during the ten seconds a
 * student cares about most is the kind of silence that reads as a failure.
 */
function Calculating() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center py-10">
      <div className="text-center">
        <Loader2
          size={32}
          aria-hidden
          className="mx-auto animate-spin text-brand-600"
        />
        <p
          role="status"
          className="mt-4 text-lg font-extrabold text-ink-900"
        >
          Calculating your final marks
        </p>
        <p className="mt-1 text-sm text-ink-600">
          Checking every answer against the paper. This takes a moment — please
          don&apos;t close the tab.
        </p>
      </div>
    </main>
  );
}

/**
 * The mark.
 *
 * Right or wrong per question, and **never the right answer**: a term paper is
 * sat once and its questions are reused for the next cohort, so handing back a
 * full answer key would publish it. A practice quiz does show the explanation —
 * that is the difference between practice and an examination.
 */
function Result({
  result,
  title,
  backHref,
  questions,
}: {
  result: AttemptResult;
  title: string;
  backHref: string;
  questions: RunnerQuestion[];
}) {
  const prompts = useMemo(
    () => new Map(questions.map((row) => [row.id, row.prompt])),
    [questions],
  );

  return (
    <main className="py-8">
      <Container size="wide">
        <section className="mx-auto max-w-2xl rounded-xl border border-border bg-surface p-6 shadow-sm md:p-8">
          <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
            Result
          </p>
          <h1 className="mt-1 text-xl font-extrabold text-ink-900">{title}</h1>

          <div className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-2">
            <p
              className={cn(
                "text-4xl font-extrabold tabular-nums",
                result.passed ? "text-success-700" : "text-danger-700",
              )}
            >
              {result.scored}
              <span className="text-2xl text-ink-500">/{result.maxScore}</span>
            </p>
            <p className="text-lg font-bold tabular-nums text-ink-700">
              {result.percent}%
            </p>
            <p className="text-sm font-medium text-ink-600">
              {result.correctCount} of {result.questionCount} correct
            </p>
          </div>

          {result.autoSubmitted ? (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-warning-500 bg-warning-50 p-3 text-sm font-medium text-warning-700">
              <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
              {result.autoSubmitReason === "violations"
                ? "The paper submitted itself after too many warnings."
                : "Time ran out, so the paper went in as it stood."}
            </p>
          ) : null}

          <ol className="mt-6 divide-y divide-border border-y border-border">
            {result.breakdown.map((row, at) => (
              <li key={row.questionId} className="flex items-start gap-3 py-3">
                {row.correct ? (
                  <CheckCircle2
                    size={16}
                    aria-hidden
                    className="mt-0.5 shrink-0 text-success-500"
                  />
                ) : (
                  <XCircle
                    size={16}
                    aria-hidden
                    className="mt-0.5 shrink-0 text-danger-500"
                  />
                )}
                <span className="min-w-0 flex-1 text-sm text-ink-700">
                  <span className="font-semibold text-ink-500">{at + 1}. </span>
                  {prompts.get(row.questionId) ?? row.prompt}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-2xs font-bold uppercase tracking-wide",
                    row.correct ? "text-success-700" : "text-danger-700",
                  )}
                >
                  {row.correct ? "Correct" : "Wrong"}
                </span>
              </li>
            ))}
          </ol>

          <p className="mt-4 text-xs text-ink-500">
            Your marksheet has been updated.
          </p>

          <ButtonLink href={backHref} className="mt-6">
            <ArrowLeft size={16} aria-hidden />
            Back to the curriculum
          </ButtonLink>
        </section>
      </Container>
    </main>
  );
}

/* ------------------------------ the four kinds ----------------------------- */

function QuestionBody({
  question,
  answer,
  onChange,
}: {
  question: RunnerQuestion;
  answer: AnswerValue;
  onChange: (next: AnswerValue) => void;
}) {
  if (question.kind === "matching") {
    return <Matching question={question} answer={answer} onChange={onChange} />;
  }

  const multi = question.kind === "multi";

  return (
    <>
      {multi ? (
        <p className="mb-2 text-xs font-medium text-ink-500">
          Pick all that apply — a part-right answer scores nothing.
        </p>
      ) : null}

      <ul className="space-y-2">
        {question.options.map((option) => {
          const picked = answer.optionIds.includes(option.id);

          return (
            <li key={option.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors",
                  picked
                    ? "border-brand-600 bg-brand-50 text-ink-900"
                    : "border-border bg-surface text-ink-700 hover:border-border-strong",
                )}
              >
                <input
                  type={multi ? "checkbox" : "radio"}
                  name={question.id}
                  checked={picked}
                  onChange={() =>
                    onChange({
                      optionIds: multi
                        ? picked
                          ? answer.optionIds.filter((id) => id !== option.id)
                          : [...answer.optionIds, option.id]
                        : [option.id],
                      pairs: [],
                    })
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
                />
                {option.text}
              </label>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * Matching, as a select per row.
 *
 * Drag-and-drop is the obvious design and the wrong one here: it does not work
 * from a keyboard, it is miserable on a phone, and this is an examination — the
 * interaction must never be the thing that costs someone a mark. A select says
 * the same thing and works everywhere.
 *
 * The same right-hand item cannot be used twice; picking one that is already
 * taken moves it, rather than silently leaving a duplicate the grader would
 * mark wrong.
 */
function Matching({
  question,
  answer,
  onChange,
}: {
  question: RunnerQuestion;
  answer: AnswerValue;
  onChange: (next: AnswerValue) => void;
}) {
  const chosen = new Map(answer.pairs.map((pair) => [pair.leftId, pair.rightId]));

  function pick(leftId: string, rightId: string) {
    const pairs = answer.pairs.filter(
      (pair) => pair.leftId !== leftId && pair.rightId !== rightId,
    );
    if (rightId) pairs.push({ leftId, rightId });
    onChange({ optionIds: [], pairs });
  }

  return (
    <ul className="space-y-2">
      {question.prompts.map((item, at) => (
        <li
          key={item.id}
          className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center"
        >
          <span className="min-w-0 flex-1 text-sm text-ink-800">
            <span className="font-semibold text-ink-500">{at + 1}. </span>
            {item.text}
          </span>

          <label className="sr-only" htmlFor={`${question.id}-${item.id}`}>
            Match for {item.text}
          </label>
          <select
            id={`${question.id}-${item.id}`}
            value={chosen.get(item.id) ?? ""}
            onChange={(event) => pick(item.id, event.target.value)}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink-900 outline-none hover:border-border-strong focus:border-brand-600 sm:w-56"
          >
            <option value="">Choose a match</option>
            {question.choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.text}
              </option>
            ))}
          </select>
        </li>
      ))}
    </ul>
  );
}

/** mm:ss, and hh:mm:ss only when there is an hour to show. */
function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const pad = (value: number) => String(value).padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}
