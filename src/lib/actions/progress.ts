"use server";

/**
 * What a student has watched, and what they have finished.
 *
 * The first thing in the app to write `SubtopicProgress`. Until now every
 * percentage on every screen was derived from rows that only the seed script
 * created — the tree knew what existed, and nothing knew what anyone had done.
 *
 * ## Completion is now observed, where it used to be declared
 *
 * `SubtopicProgress` was written with a note saying completion would have to be
 * declared with a button, because "there is no media service, so there is no
 * watch-time signal worth trusting". There is one now: Bunny's player reports
 * `timeupdate` and `ended`, so a video can be marked finished by having been
 * watched, which is the thing the student actually did.
 *
 * ## How much this trusts the browser
 *
 * Less than it looks, and more than `actions/attempts.ts` does — deliberately.
 * A paper is a grade, so its clock is the server's and nothing from the client
 * is believed. A watched lecture is **not a grade**: it moves a progress bar and
 * a tick in the sidebar, and marks are the only thing a certificate is
 * computed from. So the seconds come from the player, and:
 *
 * - `secondsWatched` is **clamped to the video's real duration**, which the
 *   server knows because Bunny measured it. A forged number cannot claim more
 *   watching than the video contains;
 * - a completed row is never downgraded, so a re-watch cannot un-finish a
 *   lesson;
 * - enrolment is re-checked here rather than assumed from the page, because an
 *   action is a public endpoint whatever renders it.
 *
 * Someone determined can still mark a lecture watched without watching it. So
 * can someone who plays it at 2x in another tab. That is the honest ceiling for
 * a video anywhere, and the module test behind the module is what actually
 * gates progress.
 */
import { revalidatePath } from "next/cache";
import { Types } from "mongoose";

import { requireUser } from "@/lib/auth/guards";
import { isEnrolled } from "@/lib/data/enrolled";
import { connectToDatabase } from "@/lib/db";
import { Program } from "@/models/Program";
import { Subtopic } from "@/models/Subtopic";
import { SubtopicProgress } from "@/models/SubtopicProgress";

export type ProgressOutcome =
  | { ok: true; state: "in-progress" | "completed" }
  | { ok: false; reason: string };

/**
 * Record where a student is in a lesson, and whether they finished it.
 *
 * Called on a timer while a video plays and once when it ends — so it is
 * written to be **idempotent and cheap**: one upsert against the unique
 * `(studentId, subtopicId)` index, no reads of the tree, no revalidation
 * unless something a screen shows actually changed.
 */
export async function recordVideoProgress(
  subtopicKey: string,
  secondsWatched: number,
  completed: boolean,
): Promise<ProgressOutcome> {
  const user = await requireUser();

  // Staff open lessons to check them; that is not progress, and writing it
  // would put a teacher's name in a student's roll-up.
  if (user.role !== "student") return { ok: false, reason: "not-a-student" };

  if (typeof subtopicKey !== "string" || !subtopicKey.trim()) {
    return { ok: false, reason: "bad-key" };
  }

  await connectToDatabase();

  const subtopic = await Subtopic.findOne({ key: subtopicKey.trim() })
    .select("_id programId courseId moduleId kind status seconds")
    .lean();

  if (!subtopic) return { ok: false, reason: "no-such-lesson" };
  if (subtopic.kind !== "video") return { ok: false, reason: "not-a-video" };

  // A draft or archived lesson cannot be progressed through: it is not part of
  // anyone's course, and a row against it would survive into the roll-up.
  if (subtopic.status !== "published") return { ok: false, reason: "not-published" };

  const program = await Program.findById(subtopic.programId).select("slug").lean();
  if (!program) return { ok: false, reason: "no-such-program" };

  if (!(await isEnrolled(user.id, program.slug))) {
    return { ok: false, reason: "not-enrolled" };
  }

  // The clamp. `subtopic.seconds` is Bunny's own measurement, so a client
  // claiming 9000 seconds of a 60-second lecture gets 60.
  const runtime = subtopic.seconds ?? 0;
  const claimed = Number.isFinite(secondsWatched) ? Math.max(0, Math.round(secondsWatched)) : 0;
  const watched = runtime > 0 ? Math.min(claimed, runtime) : claimed;

  const now = new Date();
  const studentId = new Types.ObjectId(user.id);

  const existing = await SubtopicProgress.findOne({
    studentId,
    subtopicId: subtopic._id,
  })
    .select("state secondsWatched")
    .lean();

  // Never walk backwards. Re-opening a finished lesson leaves it finished, and
  // scrubbing to the start does not reduce how much of it has been seen.
  const wasComplete = existing?.state === "completed";
  const state = wasComplete || completed ? "completed" : "in-progress";
  const highWater = Math.max(watched, existing?.secondsWatched ?? 0);

  await SubtopicProgress.updateOne(
    { studentId, subtopicId: subtopic._id },
    {
      $set: {
        programId: subtopic.programId,
        courseId: subtopic.courseId,
        moduleId: subtopic.moduleId,
        state,
        secondsWatched: highWater,
        lastSeenAt: now,
        ...(state === "completed" && !wasComplete ? { completedAt: now } : {}),
      },
    },
    { upsert: true },
  );

  // Only when a *screen* would now say something different. The ticking
  // heartbeat changes `secondsWatched`, which nothing renders, and revalidating
  // on every beat would rebuild the tree every fifteen seconds for nothing.
  if (state === "completed" && !wasComplete) {
    revalidatePath("/dashboard", "layout");
    revalidatePath("/learn", "layout");
  }

  return { ok: true, state };
}

/**
 * Mark a lesson finished because the student reached the end of it.
 *
 * The counterpart to `recordVideoProgress` for everything that is not a video:
 * a reading scrolled to the bottom, a PDF whose last page has been shown, a
 * practice quiz that has been submitted. Until this existed `SubtopicProgress`
 * had exactly one writer — the video player — so a course containing a single
 * written lesson could never reach 100%, its final test never unlocked, and the
 * next course never opened. Any programme with a reading in it was impassable.
 *
 * It trusts the browser about as much as the video path does, and for the same
 * reason: this moves a progress bar, not a mark. What it does not do is take
 * the client's word for *which* lesson, or for whether the student is entitled
 * to it — the subtopic is re-read here and enrolment is re-checked, because an
 * action is a public endpoint whatever renders it.
 *
 * Idempotent, and never walks backwards: re-reading a finished lesson leaves it
 * finished. Callers may fire it more than once without checking first.
 */
export async function markLessonComplete(
  subtopicKey: string,
): Promise<ProgressOutcome> {
  const user = await requireUser();

  // Staff open lessons to check them; that is not progress, and writing it
  // would put a teacher's name in a student's roll-up.
  if (user.role !== "student") return { ok: false, reason: "not-a-student" };

  // The **key**, not an id: that is what the curriculum view carries and what
  // the learn URL names, exactly as `recordVideoProgress` above takes.
  if (typeof subtopicKey !== "string" || !subtopicKey.trim()) {
    return { ok: false, reason: "bad-key" };
  }

  await connectToDatabase();

  const subtopic = await Subtopic.findOne({ key: subtopicKey.trim() })
    .select("_id programId courseId moduleId kind status")
    .lean();

  if (!subtopic) return { ok: false, reason: "no-such-lesson" };

  // A draft or archived lesson cannot be progressed through: it is not part of
  // anyone's course, and a row against it would survive into the roll-up.
  if (subtopic.status !== "published") return { ok: false, reason: "not-published" };

  /**
   * A video is finished by being watched, and `recordVideoProgress` is what
   * knows how much of it was. Accepting a bare "done" here would be a way round
   * that clamp, so this refuses the one kind that already has a signal.
   */
  if (subtopic.kind === "video") return { ok: false, reason: "is-a-video" };

  const program = await Program.findById(subtopic.programId).select("slug").lean();
  if (!program) return { ok: false, reason: "no-such-program" };
  if (!(await isEnrolled(user.id, program.slug))) {
    return { ok: false, reason: "not-enrolled" };
  }

  const now = new Date();
  const studentId = new Types.ObjectId(user.id);

  const existing = await SubtopicProgress.findOne({
    studentId,
    subtopicId: subtopic._id,
  })
    .select("state")
    .lean();

  if (existing?.state === "completed") return { ok: true, state: "completed" };

  await SubtopicProgress.updateOne(
    { studentId, subtopicId: subtopic._id },
    {
      $set: {
        programId: subtopic.programId,
        courseId: subtopic.courseId,
        moduleId: subtopic.moduleId,
        state: "completed",
        lastSeenAt: now,
        completedAt: now,
      },
    },
    { upsert: true },
  );

  // A screen would now say something different — the tick in the sidebar, the
  // module percentage, and possibly a gate that has just opened.
  revalidatePath("/dashboard", "layout");
  revalidatePath("/learn", "layout");

  return { ok: true, state: "completed" };
}
