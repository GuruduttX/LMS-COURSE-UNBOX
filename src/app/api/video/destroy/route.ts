/**
 * POST /api/video/destroy — remove a video from the Bunny library.
 *
 * What it is for: a teacher uploads the wrong take, or swaps it for another
 * one, before saving the form. Without this every mistaken pick leaves a
 * permanent video in the library — and unlike a stray PDF, that one is billed
 * for storage every month and for bandwidth every time anyone finds it.
 *
 * **It refuses to delete a video a subtopic still points at.** That check is
 * what makes the route safe to expose: the id comes from the browser, so
 * without it any signed-in teacher could post any GUID in the library and take
 * down somebody else's published lesson. (The Cloudinary equivalent cannot do
 * this yet — see the note in `api/uploads/destroy` — because its records are
 * spread across several collections. A video has exactly one owner.)
 *
 * Deleting the video that a *saved* subtopic owns is a different operation and
 * belongs to the curriculum actions, which delete the subtopic and the video
 * together.
 */
import { NextResponse } from "next/server";

import { writeAudit } from "@/lib/auth/audit";
import { getCurrentUser } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db";
import { canUploadTo } from "@/lib/uploads/kinds";
import { deleteVideo, isConfigured } from "@/lib/video/bunny";
import { isVideoId } from "@/lib/video/shared";
import { Subtopic } from "@/models/Subtopic";

function refuse(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return refuse("Your session has expired. Sign in again.", 401);
  if (!canUploadTo(user.role, "curriculum")) {
    return refuse("You can't delete lesson videos.", 403);
  }
  if (!isConfigured()) return refuse("Video uploads aren't configured.", 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse("Expected a JSON body.", 400);
  }

  const videoId = (body as Record<string, unknown> | null)?.videoId;
  if (!isVideoId(videoId)) return refuse("That isn't a video id.", 422);

  await connectToDatabase();
  const owner = await Subtopic.exists({ "video.videoId": videoId });
  if (owner) {
    return refuse("That video belongs to a saved lesson. Delete the lesson instead.", 409);
  }

  try {
    const outcome = await deleteVideo(videoId);
    if (!outcome.ok) {
      console.error("[api/video/destroy] Bunny said:", outcome.detail);
      return refuse("Couldn't delete that video. Try again.", 502);
    }

    await writeAudit(user, {
      action: "video.delete",
      targetType: "Video",
      targetId: videoId,
      summary: "Deleted an unsaved lesson video",
      meta: { videoId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/video/destroy] failed:", error);
    return refuse("Couldn't delete that video. Try again.", 503);
  }
}
