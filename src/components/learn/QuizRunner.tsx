"use client";

import { ClipboardCheck, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { markLessonComplete } from "@/lib/actions/progress";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { AuthoredQuestion, SubtopicView } from "@/lib/curriculum/types";

import { EmptyPane } from "./EmptyPane";

import {
  LearnFooterBar,
  STEP_ACTIVE,
  STEP_CLASS,
  STEP_INERT,
  StepIcon,
} from "./LearnFooterBar";

type Answer = { selected: string | null; submitted: boolean };

/**
 * A quiz owns the whole pane *and* the footer's Prev/Next, because inside a
 * quiz those words mean "previous question" and "next question", not "previous
 * video". The video pane passes `<SubtopicSteps>` into the same bar instead.
 *
 * The rules, in one place:
 *  - Next is dead until the current question has been submitted. You answer,
 *    then you move on.
 *  - Submit disappears once submitted; Next takes over as the live control.
 *  - Prev revisits earlier questions with the answer and explanation intact,
 *    but they stay locked — going back is for re-reading, not for changing your
 *    mind after seeing the answer.
 *
 * State resets when the quiz changes (`key` on the subtopic id in the page).
 */
export function QuizRunner({ subtopic }: { subtopic: SubtopicView }) {
  if (subtopic.questions.length === 0) {
    return (
      <EmptyPane
        title={subtopic.title}
        message="This quiz has no questions in it yet. Your teacher is still writing it."
      />
    );
  }

  return <Runner subtopic={subtopic} />;
}

function Runner({ subtopic }: { subtopic: SubtopicView }) {
  const questions = subtopic.questions;

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>(() =>
    questions.map(() => ({ selected: null, submitted: false })),
  );
  const [finished, setFinished] = useState(false);

  /**
   * A practice quiz is finished by working through it — the same rule the other
   * kinds follow, where reaching the end is what records completion rather than
   * declaring it. Answering every question *is* reaching the end.
   *
   * The score is deliberately not part of it: this is practice, it shows its
   * own explanations, and nothing is graded from it. Requiring a pass would
   * make a lesson a student had genuinely worked through count for nothing and
   * leave the gate behind it shut.
   */
  useEffect(() => {
    if (!finished) return;
    if (subtopic.status === "completed") return;
    void markLessonComplete(subtopic.id);
  }, [finished, subtopic.id, subtopic.status]);

  // A published quiz always has questions — the validator refuses to publish an
  // empty one. This is here because the author could publish it, then remove
  // them, and a student meeting that shouldn't meet a crash.
  const question = questions[index];
  const answer = answers[index];
  const isLast = index === questions.length - 1;
  const isCorrect = answer.submitted && answer.selected === question.correctOptionId;
  const correctCount = answers.filter(
    (item, i) => item.submitted && item.selected === questions[i].correctOptionId,
  ).length;

  function select(optionId: string) {
    if (answer.submitted) return;
    setAnswers((prev) =>
      prev.map((item, i) => (i === index ? { ...item, selected: optionId } : item)),
    );
  }

  function submit() {
    if (answer.selected === null || answer.submitted) return;
    setAnswers((prev) =>
      prev.map((item, i) => (i === index ? { ...item, submitted: true } : item)),
    );
  }

  function goPrev() {
    if (finished) {
      setFinished(false);
      return;
    }
    if (index > 0) setIndex(index - 1);
  }

  function goNext() {
    if (!answer.submitted) return;
    if (isLast) {
      setFinished(true);
      return;
    }
    setIndex(index + 1);
  }

  function restart() {
    setIndex(0);
    setAnswers(questions.map(() => ({ selected: null, submitted: false })));
    setFinished(false);
  }

  const canGoPrev = finished || index > 0;
  const canGoNext = !finished && answer.submitted;

  return (
    <>
      <div className="flex-1 px-4 py-6 md:px-6 lg:overflow-y-auto">
        {finished ? (
          <Result correct={correctCount} total={questions.length} onRestart={restart} />
        ) : (
          <div className="w-full max-w-5xl">
            <h1 className="flex items-center gap-2 text-lg font-bold text-ink-900">
              <ClipboardCheck size={20} aria-hidden className="text-ink-500" />
              {subtopic.title}
            </h1>

            <p className="mt-6 text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
              Question {index + 1} of {questions.length}
            </p>
            <div
              role="progressbar"
              aria-valuenow={index + 1}
              aria-valuemin={1}
              aria-valuemax={questions.length}
              aria-label="Quiz progress"
              className="mt-2 h-1 w-full max-w-sm overflow-hidden rounded-full bg-surface-sunken"
            >
              <div
                className="h-full rounded-full bg-brand-600 transition-[width] duration-[320ms] ease-out"
                style={{ width: `${((index + 1) / questions.length) * 100}%` }}
              />
            </div>

            <span className="mt-5 inline-flex h-[26px] items-center rounded-full border border-border px-3 text-xs font-medium text-ink-600">
              Multiple choice question
            </span>

            <fieldset className="mt-4">
              <legend className="text-lg font-semibold text-ink-900">
                {question.prompt}
              </legend>

              <div className="mt-4 space-y-3">
                {question.options.map((option, i) => (
                  <Option
                    key={option.id}
                    question={question}
                    option={option}
                    letter={String.fromCharCode(65 + i)}
                    checked={answer.selected === option.id}
                    submitted={answer.submitted}
                    onSelect={() => select(option.id)}
                  />
                ))}
              </div>
            </fieldset>

            {answer.submitted ? (
              <div className="mt-6">
                <h2
                  className={cn(
                    "text-sm font-bold",
                    isCorrect ? "text-success-700" : "text-danger-700",
                  )}
                >
                  {isCorrect ? "Correct" : "Incorrect"}
                </h2>
                <p className="mt-1 max-w-[68ch] text-sm text-ink-700">
                  {question.explanation}
                </p>
              </div>
            ) : (
              <div className="mt-6">
                <Button onClick={submit} disabled={answer.selected === null}>
                  Submit
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <LearnFooterBar>
        <Step direction="prev" label="Prev" enabled={canGoPrev} onClick={goPrev} />
        <Step
          direction="next"
          label={isLast && !finished ? "See result" : "Next"}
          enabled={canGoNext}
          onClick={goNext}
        />
      </LearnFooterBar>
    </>
  );
}

/** Same shape as the video pane's Prev/Next links, driven by state instead. */
function Step({
  direction,
  label,
  enabled,
  onClick,
}: {
  direction: "prev" | "next";
  label: string;
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      title={
        direction === "next" && !enabled ? "Answer this question to continue" : undefined
      }
      className={cn(
        STEP_CLASS,
        enabled ? STEP_ACTIVE : cn(STEP_INERT, "cursor-not-allowed"),
      )}
    >
      {direction === "prev" ? <StepIcon direction="prev" /> : null}
      {label}
      {direction === "next" ? <StepIcon direction="next" /> : null}
    </button>
  );
}

function Option({
  question,
  option,
  letter,
  checked,
  submitted,
  onSelect,
}: {
  question: AuthoredQuestion;
  option: { id: string; text: string };
  letter: string;
  checked: boolean;
  submitted: boolean;
  onSelect: () => void;
}) {
  const isAnswer = option.id === question.correctOptionId;

  // After submitting, mark the right answer green and only the *chosen* wrong
  // one red — colouring every other option red would read as four mistakes.
  const state = !submitted
    ? checked
      ? "border-brand-600 bg-brand-50"
      : "border-border bg-surface hover:border-border-strong"
    : isAnswer
      ? "border-success-500 bg-success-50"
      : checked
        ? "border-danger-500 bg-danger-50"
        : "border-border bg-surface opacity-70";

  return (
    <label
      className={cn(
        "flex min-h-14 cursor-pointer items-center gap-4 rounded-lg border px-4 py-3 transition-colors duration-[120ms]",
        state,
        submitted && "cursor-default",
      )}
    >
      <input
        type="radio"
        name={question.id}
        value={option.id}
        checked={checked}
        onChange={onSelect}
        disabled={submitted}
        className="size-4 accent-brand-600"
      />
      <span className="text-sm font-bold text-ink-700">{letter}.</span>
      <span className="text-sm text-ink-900">{option.text}</span>
    </label>
  );
}

function Result({
  correct,
  total,
  onRestart,
}: {
  correct: number;
  total: number;
  onRestart: () => void;
}) {
  const percent = Math.round((correct / total) * 100);
  const passed = percent >= 60;

  return (
    <div className="max-w-md">
      <span
        className={cn(
          "flex size-12 items-center justify-center rounded-full",
          passed ? "bg-success-50" : "bg-ink-100",
        )}
      >
        <ClipboardCheck
          size={22}
          aria-hidden
          className={passed ? "text-success-700" : "text-ink-600"}
        />
      </span>

      <h1 className="mt-4 text-xl font-extrabold text-ink-900">
        {correct} of {total} correct
      </h1>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-brand-600">
        {percent}%
      </p>
      <p className="mt-2 max-w-[48ch] text-sm text-ink-600">
        {passed
          ? "Nicely done. Move on to the next topic, or retake it to tighten the gaps."
          : "Worth another pass — rewatch the videos in this topic, then try again."}
      </p>

      <Button className="mt-5" variant="secondary" onClick={onRestart}>
        <RotateCcw size={16} aria-hidden />
        Retake quiz
      </Button>
    </div>
  );
}
