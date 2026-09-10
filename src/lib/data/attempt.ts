import "server-only";

import { notFound } from "next/navigation";
import { Types } from "mongoose";

import {
  gradeAnswer,
  toAuthoredQuestion,
  type AnswerValue,
} from "@/lib/curriculum/question-kinds";
import { FINAL_TEST_PASS_PERCENT } from "@/lib/curriculum/rules";
import { toRunnerQuestions, type RunnerQuestion } from "@/lib/curriculum/types";
import { connectToDatabase } from "@/lib/db";
import { Attempt, type AttemptDocument } from "@/models/Attempt";

/**
 * Reading an attempt, and finishing one.
 *
 * These two belong together because **every read finishes an overdue attempt**.
 * There is no cron job and no queue: a paper whose deadline has passed is
 * graded by whatever next looks at it — the student reopening it, the runner
 * polling, the marksheet totting up. That is the lazy sweep the `Attempt`
 * model describes, and it means an abandoned paper cannot sit unmarked forever
 * waiting for infrastructure this project does not have.
 *
 * The other rule this module holds: **grading reads the snapshot and nothing
 * else.** Not the live `Assessment` — a teacher may have edited it since — and
 * never anything from a request. The client cannot send a score because there
 * is no code path that would read one.
 */

/** What the runner needs, with every answer stripped out of it. */
export type RunnerAttempt = {
  id: string;
  status: AttemptDocument["status"];
  /** ISO. The server's deadline; the client counts down to it, nothing more. */
  deadlineAt: string;
  startedAt: string;
  questions: RunnerQuestion[];
  /** What this student has answered so far, by question id. */
  answers: Record<string, AnswerValue>;
  violationCount: number;
  proctored: boolean;
  title: string;
  marksPerQuestion: number;
  /** Set once finished. */
  result: AttemptResult | null;
};

export type AttemptResult = {
  scored: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  correctCount: number;
  questionCount: number;
  autoSubmitted: boolean;
  autoSubmitReason: "violations" | "deadline" | null;
  /** Per question, right or wrong — never which answer was right. */
  breakdown: { questionId: string; prompt: string; correct: boolean }[];
};

/* -------------------------------- finishing ------------------------------- */

/**
 * Mark an attempt and close it.
 *
 * Called from three places — the student submitting, the warning count running
 * out, and the deadline passing — so the marking itself lives here once. An
 * already-finished attempt is returned untouched rather than re-marked: a
 * double submit, or two tabs racing, must not produce two different scores for
 * the same paper.
 */
export async function finaliseAttempt(
  attempt: AttemptDocument & { _id: Types.ObjectId },
  ending: {
    status: "submitted" | "auto-submitted" | "expired";
    reason?: "violations" | "deadline" | null;
  },
): Promise<AttemptDocument & { _id: Types.ObjectId }> {
  if (attempt.status !== "in-progress") return attempt;

  const questions = (attempt.snapshot ?? []).map(toAuthoredQuestion);
  const answers = answerMap(attempt);

  const correct = questions.filter((question) =>
    gradeAnswer(question, answers[question.id] ?? { optionIds: [], pairs: [] }),
  ).length;

  const marksPerQuestion = attempt.marksPerQuestion || 1;
  const maxScore = questions.length * marksPerQuestion;
  const scored = correct * marksPerQuestion;
  // A paper with no questions would divide by zero. It cannot be published in
  // that state, but an archived one can end up here, and 0% is the honest read.
  const percent = maxScore > 0 ? Math.round((scored / maxScore) * 1000) / 10 : 0;

  const updated = await Attempt.findOneAndUpdate(
    // The status guard is the concurrency control: whichever caller gets here
    // first marks the paper, and the loser's write matches nothing.
    { _id: attempt._id, status: "in-progress" },
    {
      $set: {
        status: ending.status,
        submittedAt: new Date(),
        scored,
        maxScore,
        percent,
        passed: percent >= FINAL_TEST_PASS_PERCENT,
        autoSubmitReason: ending.reason ?? null,
      },
    },
    { returnDocument: "after" },
  ).lean();

  // Null means somebody else finalised it a moment ago. Their result stands.
  return (updated ?? (await Attempt.findById(attempt._id).lean()))! as
    AttemptDocument & { _id: Types.ObjectId };
}

/** Every stored answer, keyed by question, in the shape the grader wants. */
function answerMap(attempt: AttemptDocument): Record<string, AnswerValue> {
  const map: Record<string, AnswerValue> = {};

  for (const answer of attempt.answers ?? []) {
    map[answer.questionId] = {
      optionIds: [...(answer.optionIds ?? [])],
      pairs: (answer.pairs ?? []).map((pair) => ({
        leftId: pair.leftId,
        rightId: pair.rightId,
      })),
    };
  }

  return map;
}

/* --------------------------------- reading -------------------------------- */

/**
 * One attempt, for the person sitting it.
 *
 * Scoped by `studentId` in the query rather than fetched and then checked, so
 * another student's attempt id simply matches nothing — the same reasoning as
 * `assertScope` calling `notFound()`: "not yours" and "not there" should be
 * indistinguishable.
 */
export async function loadAttemptForStudent(
  attemptId: string,
  studentId: string,
): Promise<RunnerAttempt> {
  await connectToDatabase();

  if (!Types.ObjectId.isValid(attemptId)) notFound();

  let attempt = (await Attempt.findOne({
    _id: attemptId,
    studentId,
  }).lean()) as (AttemptDocument & { _id: Types.ObjectId }) | null;

  if (!attempt) notFound();

  // The lazy sweep. A paper found past its deadline is marked here and now.
  if (attempt.status === "in-progress" && attempt.deadlineAt <= new Date()) {
    attempt = await finaliseAttempt(attempt, {
      status: "auto-submitted",
      reason: "deadline",
    });
  }

  return toRunnerAttempt(attempt);
}

export function toRunnerAttempt(
  attempt: AttemptDocument & { _id: Types.ObjectId },
): RunnerAttempt {
  const questions = (attempt.snapshot ?? []).map(toAuthoredQuestion);
  const finished = attempt.status !== "in-progress";

  return {
    id: String(attempt._id),
    status: attempt.status,
    deadlineAt: attempt.deadlineAt.toISOString(),
    startedAt: attempt.startedAt.toISOString(),
    // The one call that keeps the answers out of the browser.
    questions: toRunnerQuestions(questions),
    answers: answerMap(attempt),
    violationCount: attempt.violationCount ?? 0,
    proctored: attempt.targetType !== "module_test",
    title: "",
    marksPerQuestion: attempt.marksPerQuestion || 1,
    result: finished ? resultOf(attempt, questions) : null,
  };
}

/**
 * The result, once there is one.
 *
 * The breakdown says right or wrong per question and **never which answer was
 * right**. A term paper is sat once and its questions are reused for the next
 * cohort; handing back a full answer key at the end would publish the paper.
 */
function resultOf(
  attempt: AttemptDocument,
  questions: ReturnType<typeof toAuthoredQuestion>[],
): AttemptResult {
  const answers = answerMap(attempt);

  const breakdown = questions.map((question) => ({
    questionId: question.id,
    prompt: question.prompt,
    correct: gradeAnswer(
      question,
      answers[question.id] ?? { optionIds: [], pairs: [] },
    ),
  }));

  return {
    scored: attempt.scored ?? 0,
    maxScore: attempt.maxScore ?? 0,
    percent: attempt.percent ?? 0,
    passed: attempt.passed ?? false,
    correctCount: breakdown.filter((row) => row.correct).length,
    questionCount: questions.length,
    autoSubmitted: attempt.status === "auto-submitted",
    autoSubmitReason:
      (attempt.autoSubmitReason as "violations" | "deadline" | null) ?? null,
    breakdown,
  };
}
