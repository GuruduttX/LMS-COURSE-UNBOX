import "server-only";

import { connectToDatabase } from "@/lib/db";
import { Subtopic } from "@/models/Subtopic";

import { getVideo, isConfigured } from "./bunny";
import type { StoredVideo } from "./shared";

/**
 * Bring a stored video status up to date with Bunny.
 *
 * ## Why a stored status goes stale, and why that is not cosmetic
 *
 * `video.status` is a **cache** of something only Bunny knows. It is written
 * once at upload — always `processing`, because encoding has not started — and
 * from then on `/api/webhooks/bunny` was the only thing that ever corrected it.
 * That leaves two ways to get permanently stuck:
 *
 * - **No webhook.** It cannot reach `localhost`, and in production it only
 *   fires if the URL is configured in the Bunny dashboard. Without it the
 *   record says `processing` forever.
 * - **A webhook that arrives too early.** The callback matches on
 *   `video.videoId`, and a short video can finish encoding before the author
 *   saves the form. The webhook then finds no subtopic, answers 200 and does
 *   nothing — correctly, so Bunny stops retrying — and the row is saved
 *   `processing` a moment later with nothing left to correct it.
 *
 * Neither is a badge problem. `VideoStage` gates the player on this field, so a
 * stale `processing` means **students cannot watch a video that is finished**,
 * and `seconds` never lands either, which is why such a lesson reads "0 min"
 * everywhere a duration is shown.
 *
 * ## Why here and not in the tree
 *
 * `getProgramCurriculum` is six flat reads and is on every curriculum screen;
 * asking Bunny about every video in a program would put an HTTP call per lesson
 * on that path. This runs where a *single* video's status decides what renders
 * — the learning screen and the staff subtopic screen — so it is one call at
 * most, and only while the cache still says `processing`. A row corrected on
 * either screen is corrected for the tree too, because they read the same
 * document.
 *
 * ## Why the poll route does not do this
 *
 * `/api/video/status` is deliberately read-only: it serves an *open form* whose
 * video has not been committed to a subtopic yet, and writing there would
 * mutate a record the author has not saved. That reasoning holds for a draft
 * and says nothing about a row already in the database, which is what this is
 * for.
 */
export async function reconcileVideo(
  video: StoredVideo | null | undefined,
): Promise<StoredVideo | null> {
  if (!video?.videoId) return video ?? null;

  // Only a cache that could still be wrong. `ready` and `failed` are terminal:
  // Bunny does not un-finish a video, and re-asking on every render would be a
  // request per lesson view for an answer that cannot change.
  if (video.status !== "processing") return video;

  // No keys, no answer. The uploader is hidden in that state anyway, so this is
  // only reachable for a row uploaded before the credentials were removed.
  if (!isConfigured()) return video;

  let facts;
  try {
    facts = await getVideo(video.videoId);
  } catch (error) {
    // Never fatal. Bunny being unreachable must not take a lesson down with it
    // — the screen falls back to the cached value, which is what it showed
    // before this function existed.
    console.error(`[video] could not refresh ${video.videoId}:`, error);
    return video;
  }

  // Gone from the library. Left as-is rather than marked failed: the video may
  // have been deleted by hand, and inventing a status would hide that.
  if (!facts) return video;
  if (facts.status === video.status && facts.seconds === video.seconds) {
    return video;
  }

  const fresh: StoredVideo = {
    ...video,
    status: facts.status,
    seconds: facts.seconds || video.seconds,
  };

  await connectToDatabase();

  /**
   * The same write the webhook makes, including `seconds` on the subtopic
   * itself — that is the field the duration on every curriculum screen adds up,
   * and leaving it at 0 is why a finished lesson reads "0 min".
   *
   * Matched on `video.videoId`, not on the subtopic id, so it corrects whichever
   * row holds this video without the caller having to know which.
   */
  await Subtopic.updateOne(
    { "video.videoId": video.videoId },
    {
      $set: {
        "video.status": fresh.status,
        ...(fresh.seconds
          ? { "video.seconds": fresh.seconds, seconds: fresh.seconds }
          : {}),
      },
    },
  );

  return fresh;
}
