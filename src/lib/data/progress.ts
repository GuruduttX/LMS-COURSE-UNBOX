/**
 * One student's history with one program, loaded in three queries.
 *
 * Progress, attempts and submissions are three collections, but a curriculum
 * screen needs all of them for the whole program at once — a per-node lookup
 * would be hundreds of round trips. So each is fetched in a single query and
 * turned into a Map the tree assembly reads synchronously.
 *
 * Attempts are reduced to the **best** one per target on the way in, because
 * that is the only one any screen asks about: the gate reads it, the marksheet
 * prints it, and the intro screen counts how many were used getting there.
 */
import "server-only";
import { Types } from "mongoose";

import { Attempt } from "@/models/Attempt";
import { Submission, type SubmissionDocument } from "@/models/Submission";
import { SubtopicProgress } from "@/models/SubtopicProgress";
import { FINAL_TEST_PASS_PERCENT } from "@/lib/curriculum/rules";
import type {
  AttemptSummary,
  SubmissionVersionView,
  SubmissionView,
} from "@/lib/curriculum/types";
import type { SubmissionFormat } from "@/lib/curriculum/submission-formats";
import type { SubmissionStatus } from "@/lib/curriculum/submission-status";

export type ProgressState = "in-progress" | "completed";

/** Keyed by `Subtopic._id` as a string. */
export type ProgressIndex = Map<string, ProgressState>;

export type TargetAttempts = {
  best: AttemptSummary | null;
  used: number;
  /** An attempt still in flight, which the student resumes rather than restarts. */
  openId: string | null;
  /** When the most recent attempt finished — the retake cooldown counts from here. */
  lastFinishedAt: Date | null;
};

/** Keyed by `Assessment._id` (or `Subtopic._id`, for a practice quiz). */
export type AttemptIndex = Map<string, TargetAttempts>;

/** Keyed by `Assignment._id`. */
export type SubmissionIndex = Map<string, SubmissionView>;

export async function loadProgress(
  studentId: Types.ObjectId,
  programId: Types.ObjectId,
): Promise<ProgressIndex> {
  const rows = await SubtopicProgress.find({ studentId, programId })
    .select("subtopicId state")
    .lean();

  return new Map(
    rows.map((row) => [String(row.subtopicId), row.state as ProgressState]),
  );
}

export async function loadAttempts(
  studentId: Types.ObjectId,
  programId: Types.ObjectId,
): Promise<AttemptIndex> {
  const rows = await Attempt.find({ studentId, programId })
    .select(
      "targetId status scored maxScore percent passed submittedAt startedAt autoSubmitReason",
    )
    .sort({ startedAt: -1 })
    .lean();

  const index: AttemptIndex = new Map();

  for (const row of rows) {
    const key = String(row.targetId);
    const entry = index.get(key) ?? {
      best: null,
      used: 0,
      openId: null,
      lastFinishedAt: null,
    };

    if (row.status === "in-progress") {
      // There can only be one, by the partial unique index.
      entry.openId = String(row._id);
    } else {
      // An expired attempt still burns a try — otherwise walking away from a
      // paper would be a free look at the questions.
      entry.used += 1;

      if (row.submittedAt && !entry.lastFinishedAt) {
        entry.lastFinishedAt = row.submittedAt;
      }

      const percent = row.percent ?? 0;
      if (row.scored !== null && (!entry.best || percent > entry.best.percent)) {
        entry.best = {
          id: String(row._id),
          scored: row.scored ?? 0,
          maxScore: row.maxScore ?? 0,
          percent,
          passed: row.passed ?? percent >= FINAL_TEST_PASS_PERCENT,
          submittedAt: (row.submittedAt ?? row.startedAt).toISOString(),
          autoSubmitted: row.status === "auto-submitted",
        };
      }
    }

    index.set(key, entry);
  }

  return index;
}

export async function loadSubmissions(
  studentId: Types.ObjectId,
  programId: Types.ObjectId,
): Promise<SubmissionIndex> {
  const rows = await Submission.find({ studentId, programId }).lean();

  return new Map(
    rows.map((row) => [
      String(row.assignmentId),
      {
        id: String(row._id),
        fileUrl: row.fileUrl,
        file: (row.file as SubmissionView["file"]) ?? null,
        format: row.format as SubmissionFormat,
        note: row.note ?? "",
        submittedAt: row.submittedAt.toISOString(),
        status: row.status as SubmissionStatus,
        // Rows from before versions existed carry neither field: they are a
        // first hand-in with nothing behind them.
        version: row.version ?? 1,
        scored: row.scored ?? null,
        maxMarks: row.maxMarks,
        feedback: row.feedback ?? "",
        evaluatedAt: row.evaluatedAt ? row.evaluatedAt.toISOString() : null,
        resubmission:
          row.status === "resubmission_requested" && row.resubmission
            ? {
                reason: row.resubmission.reason ?? "",
                requestedAt: row.resubmission.requestedAt.toISOString(),
              }
            : null,
        history: toVersionViews(row.history),
      },
    ]),
  );
}

type StoredVersion = NonNullable<SubmissionDocument["history"]>[number];

/** Earlier versions of a hand-in, oldest first, shaped for a screen. */
export function toVersionViews(
  history: readonly StoredVersion[] | null | undefined,
): SubmissionVersionView[] {
  return (history ?? [])
    .map((entry) => ({
      version: entry.version,
      fileUrl: entry.fileUrl,
      file: (entry.file as SubmissionVersionView["file"]) ?? null,
      format: entry.format as SubmissionFormat,
      note: entry.note ?? "",
      submittedAt: entry.submittedAt.toISOString(),
      scored: entry.scored ?? null,
      maxMarks: entry.maxMarks ?? 0,
      feedback: entry.feedback ?? "",
      evaluatedAt: entry.evaluatedAt ? entry.evaluatedAt.toISOString() : null,
      resubmissionReason: entry.resubmissionReason ?? "",
      resubmissionRequestedAt: entry.resubmissionRequestedAt.toISOString(),
    }))
    .sort((a, b) => a.version - b.version);
}

/** Nothing at all — for a signed-out or not-yet-enrolled read of the tree. */
export function emptyHistory(): {
  progress: ProgressIndex;
  attempts: AttemptIndex;
  submissions: SubmissionIndex;
} {
  return { progress: new Map(), attempts: new Map(), submissions: new Map() };
}
