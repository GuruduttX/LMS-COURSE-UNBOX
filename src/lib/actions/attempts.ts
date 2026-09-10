"use server";

/**
 * Sitting a paper: start, answer, report, submit.
 *
 * These four are the whole student side of testing, and they are written on the
 * assumption that **the browser is hostile**. Everything the runner detects can
 * be suppressed by anyone who opens devtools, so nothing here trusts a number
 * from the client:
 *
 * - the clock is the server's (`deadlineAt`, set at start, never re-read from a
 *   request);
 * - the warning count is incremented here, never sent;
 * - the answers are written one at a time as they are given, so a paper that
 *   never gets a final submit is still marked on real work;
 * - the score is computed from the frozen snapshot in `finaliseAttempt`, and no
 *   code path reads a score out of a request body.
 *
 * The client-side proctoring is deterrence. This file is the enforcement.
 *
 * Actions take typed arguments rather than `FormData`: the runner is a client
 * component calling them directly, not a form posting, and an option id is not
 * something a `<form>` was ever going to carry more safely.
 */
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { Types } from "mongoose";

import { writeAudit } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/guards";
import {
  isQuestionKind,
  shuffledRightIds,
  toAuthoredQuestion,
  type AnswerValue,
} from "@/lib/curriculum/question-kinds";
import {
  MAX_FINAL_ATTEMPTS,
  MAX_PROCTOR_WARNINGS,
  MAX_TERM_ATTEMPTS,
} from "@/lib/curriculum/rules";
import { moduleTestLockReason } from "@/lib/curriculum/status";
import { getProgramCurriculum } from "@/lib/data/curriculum-db";
import {
  finaliseAttempt,
  toRunnerAttempt,
  type RunnerAttempt,
} from "@/lib/data/attempt";
import { connectToDatabase } from "@/lib/db";
import { isViolationType } from "@/lib/validation/attempt";
import { Assessment } from "@/models/Assessment";
import { Attempt, type AttemptDocument } from "@/models/Attempt";

/**
 * Open a paper, or return to the one already open.
 *
 * Deliberately **not** "create an attempt": a student who reloads, loses their
 * connection or opens a second tab must land back in the same sitting, not
 * start a fresh one with the clock reset. The partial unique index on
 * `(studentId, targetId)` for in-progress attempts is what makes that a
 * guarantee rather than a hope, and this looks first so the common case is not
 * an index violation.
 *
 * Redirects into the runner, so the caller is a plain form button and the URL
 * ends up right for a reload.
 */
export async function startAttempt(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "student") notFound();

  const programSlug = String(formData.get("programSlug") ?? "");
  const courseKey = String(formData.get("courseKey") ?? "");
  const moduleKey = String(formData.get("moduleKey") ?? "");

  const { assessment } = await findPaper(user.id, programSlug, courseKey, moduleKey);

  /** The paper's own URL — a module's test hangs off its module. */
  const here = `/dashboard/${programSlug}/tests/${courseKey}${
    moduleKey ? `?m=${encodeURIComponent(moduleKey)}` : ""
  }`;
  const join = moduleKey ? "&" : "?";

  await connectToDatabase();
  const studentId = new Types.ObjectId(user.id);

  const open = await Attempt.findOne({
    studentId,
    targetId: assessment._id,
    status: "in-progress",
  })
    .select("_id")
    .lean();

  if (open) redirect(`${here}${join}a=${String(open._id)}`);

  // Retakes are counted from finished attempts, expired ones included: walking
  // away from a paper must not be a free look at the questions.
  const used = await Attempt.countDocuments({
    studentId,
    targetId: assessment._id,
    status: { $ne: "in-progress" },
  });

  const allowed = maxAttemptsFor(assessment.scope);
  if (used >= allowed) redirect(`${here}${join}e=no-attempts-left`);

  /**
   * The paper, frozen. A matching question's right-hand list is shuffled once,
   * here, and the order stored — so it is different per student and stable for
   * the whole sitting.
   */
  const snapshot = (assessment.questions ?? []).map((raw) => {
    const question = toAuthoredQuestion(raw);
    return {
      ...question,
      choiceOrder:
        question.kind === "matching" ? shuffledRightIds(question.pairs) : [],
    };
  });

  const startedAt = new Date();
  const created = await Attempt.create({
    studentId,
    programId: assessment.programId,
    courseId: assessment.courseId,
    moduleId: assessment.moduleId ?? null,
    targetType: assessment.scope,
    targetId: assessment._id,
    version: assessment.version ?? 1,
    marksPerQuestion: assessment.marksPerQuestion,
    snapshot,
    answers: [],
    status: "in-progress",
    startedAt,
    // The server's clock, and the only clock that counts.
    deadlineAt: new Date(
      startedAt.getTime() + assessment.durationMinutes * 60_000,
    ),
  });

  await writeAudit(user, {
    action: "attempt.start",
    targetType: "Attempt",
    targetId: String(created._id),
    summary: `Started ${assessment.title}`,
    meta: {
      programSlug,
      courseKey,
      attemptNumber: used + 1,
      of: allowed,
    },
  });

  revalidatePath(`/dashboard/${programSlug}/course_details`);
  redirect(`${here}${join}a=${String(created._id)}`);
}

/**
 * Record one answer, immediately.
 *
 * Written per question rather than batched at the end, because the end may
 * never arrive — a closed laptop, a dead connection, a deadline reached in
 * another tab. Whatever is stored when the paper closes is what gets marked, so
 * an answer given is an answer counted.
 *
 * Everything is checked against the frozen snapshot: a question id that is not
 * on this paper, or an option id that is not on that question, is dropped
 * rather than stored. Nothing here can widen what a student may answer.
 */
export async function saveAnswer(
  attemptId: string,
  questionId: string,
  answer: AnswerValue,
): Promise<{ ok: boolean }> {
  const attempt = await liveAttempt(attemptId);
  if (!attempt) return { ok: false };

  const question = (attempt.snapshot ?? [])
    .map(toAuthoredQuestion)
    .find((row) => row.id === questionId);
  if (!question) return { ok: false };

  const narrowed = narrowAnswer(question, answer);

  await connectToDatabase();

  // Remove then push, so one question can never end up with two answer rows.
  await Attempt.updateOne(
    { _id: attempt._id, status: "in-progress" },
    { $pull: { answers: { questionId } } },
  );
  await Attempt.updateOne(
    { _id: attempt._id, status: "in-progress" },
    {
      $push: {
        answers: {
          questionId,
          optionIds: narrowed.optionIds,
          pairs: narrowed.pairs,
          answeredAt: new Date(),
        },
      },
    },
  );

  return { ok: true };
}

/**
 * The client saw something it was told to report.
 *
 * It reports the *event*; the count is ours. Passing the total up from the
 * browser would make the whole proctoring theatre — a client that can suppress
 * an event can just as easily report zero.
 *
 * Returns the count and whether the paper is now over, because the runner needs
 * to show the warning banner and stop.
 */
export async function recordViolation(
  attemptId: string,
  type: string,
): Promise<{ count: number; ended: boolean }> {
  if (!isViolationType(type)) return { count: 0, ended: false };

  const attempt = await liveAttempt(attemptId);
  if (!attempt) return { count: 0, ended: true };

  await connectToDatabase();

  const updated = await Attempt.findOneAndUpdate(
    { _id: attempt._id, status: "in-progress" },
    {
      $inc: { violationCount: 1 },
      $push: { violations: { type, at: new Date() } },
    },
    { returnDocument: "after" },
  ).lean();

  if (!updated) return { count: 0, ended: true };

  const count = updated.violationCount ?? 0;

  // Every flag, not just the one that ends the paper: "left the tab nine times"
  // is the pattern a teacher wants to see when a result is queried later.
  const student = await requireUser();
  await writeAudit(student, {
    action: "attempt.violation",
    targetType: "Attempt",
    targetId: attemptId,
    summary: `Proctoring flag during a test: ${type} (${count} so far)`,
    meta: { type, count },
  });

  // The eleventh ends it: ten warnings, then the paper goes in as it stands.
  if (count > MAX_PROCTOR_WARNINGS) {
    await finaliseAttempt(
      updated as AttemptDocument & { _id: Types.ObjectId },
      { status: "auto-submitted", reason: "violations" },
    );
    return { count, ended: true };
  }

  return { count, ended: false };
}

/**
 * Finish, and mark.
 *
 * The whole "calculating your marks" moment on the client resolves to this one
 * call. It returns the finished attempt — the score, and right-or-wrong per
 * question — because that is the point of an auto-marked paper: nobody is
 * waiting on a teacher.
 */
export async function submitAttempt(attemptId: string): Promise<RunnerAttempt> {
  const user = await requireUser();
  if (user.role !== "student") notFound();

  await connectToDatabase();
  if (!Types.ObjectId.isValid(attemptId)) notFound();

  const attempt = (await Attempt.findOne({
    _id: attemptId,
    studentId: user.id,
  }).lean()) as (AttemptDocument & { _id: Types.ObjectId }) | null;
  if (!attempt) notFound();

  // A paper submitted after its deadline is still marked — on the answers it
  // had — but recorded as the server ending it, not the student.
  const late = attempt.deadlineAt <= new Date();
  const finished = await finaliseAttempt(attempt, {
    status: late ? "auto-submitted" : "submitted",
    reason: late ? "deadline" : null,
  });

  await writeAudit(user, {
    action: "attempt.submit",
    targetType: "Attempt",
    targetId: attemptId,
    summary: late
      ? `Test closed on the deadline — scored ${finished.scored ?? 0}/${finished.maxScore ?? 0}`
      : `Submitted a test — scored ${finished.scored ?? 0}/${finished.maxScore ?? 0}`,
    meta: {
      scored: finished.scored,
      maxScore: finished.maxScore,
      percent: finished.percent,
      passed: finished.passed,
      violations: finished.violationCount ?? 0,
      autoSubmitted: late,
    },
  });

  return toRunnerAttempt(finished);
}

/* --------------------------------- helpers -------------------------------- */

/**
 * The signed-in student's own in-flight attempt, or null.
 *
 * Scoped by `studentId` in the query, so another student's attempt id matches
 * nothing rather than being fetched and then refused.
 */
async function liveAttempt(
  attemptId: string,
): Promise<(AttemptDocument & { _id: Types.ObjectId }) | null> {
  const user = await requireUser();
  if (user.role !== "student") return null;

  await connectToDatabase();
  if (!Types.ObjectId.isValid(attemptId)) return null;

  const attempt = (await Attempt.findOne({
    _id: attemptId,
    studentId: user.id,
    status: "in-progress",
  }).lean()) as (AttemptDocument & { _id: Types.ObjectId }) | null;

  // Past its deadline is not live, whatever the status field says. Answers
  // arriving after time is up are ignored rather than quietly accepted.
  if (!attempt || attempt.deadlineAt <= new Date()) return null;

  return attempt;
}

/**
 * The paper for this course, and the gate in front of it.
 *
 * The tree answers both questions at once — is the program published, does the
 * course exist, is it locked for this student, and is there a published paper —
 * so the gate a student was shown and the gate enforced here are the same code.
 */
async function findPaper(
  studentId: string,
  programSlug: string,
  courseKey: string,
  moduleKey = "",
) {
  const curriculum = await getProgramCurriculum(programSlug, { studentId });
  if (!curriculum) notFound();

  const course = curriculum.courses.find((row) => row.id === courseKey);
  if (!course || course.locked) notFound();

  /**
   * A module's test, when one is named. Its gate is the module's own lessons —
   * see `moduleTestLockReason` — rather than the course's, which is what the
   * final waits on. Everything below this is shared: the same runner, the same
   * grading, the same freeze.
   */
  if (moduleKey) {
    const moduleView = course.modules.find((row) => row.id === moduleKey);
    if (!moduleView?.test) notFound();
    if (moduleTestLockReason(moduleView)) notFound();

    await connectToDatabase();
    const paper = await Assessment.findOne({
      _id: moduleView.test.id,
      status: "published",
    }).lean();
    if (!paper) notFound();

    return { assessment: paper };
  }

  const view = course.termTest ?? course.finalTest;
  if (!view) notFound();

  // A course final test additionally waits for the course's own work to be
  // done; a checkpoint's gate is the checkpoint itself, already checked above.
  if (course.finalTest && !course.termTest && course.finalTestLocked) notFound();

  await connectToDatabase();
  const assessment = await Assessment.findOne({
    _id: view.id,
    status: "published",
  }).lean();
  if (!assessment) notFound();

  return { assessment };
}

function maxAttemptsFor(scope: string): number {
  if (scope === "term_test") return MAX_TERM_ATTEMPTS;
  if (scope === "final_test") return MAX_FINAL_ATTEMPTS;
  return Number.POSITIVE_INFINITY;
}

/**
 * Keep only what this question could legitimately be answered with.
 *
 * A single-choice question gets at most one option id; a multi-select gets only
 * ids that are on it; a matching answer keeps only rows whose left and right
 * ids both exist on the paper. Anything else is discarded — not rejected with
 * an error, because a stale client sending a removed option is a race, not an
 * attack, and the student's other answers should still save.
 */
function narrowAnswer(
  question: ReturnType<typeof toAuthoredQuestion>,
  answer: AnswerValue,
): AnswerValue {
  if (!isQuestionKind(question.kind)) return { optionIds: [], pairs: [] };

  if (question.kind === "matching") {
    const lefts = new Set(question.pairs.map((pair) => pair.id));
    const rights = new Set(question.pairs.map((pair) => pair.rightId));

    const seen = new Set<string>();
    const pairs = (answer.pairs ?? []).filter((pair) => {
      if (!lefts.has(pair.leftId) || !rights.has(pair.rightId)) return false;
      // One match per left-hand item; a duplicate would make the answer
      // ambiguous and the grader's `size` check reject the lot.
      if (seen.has(pair.leftId)) return false;
      seen.add(pair.leftId);
      return true;
    });

    return { optionIds: [], pairs };
  }

  const valid = new Set(question.options.map((option) => option.id));
  const optionIds = [...new Set(answer.optionIds ?? [])].filter((id) =>
    valid.has(id),
  );

  return {
    optionIds: question.kind === "multi" ? optionIds : optionIds.slice(0, 1),
    pairs: [],
  };
}
