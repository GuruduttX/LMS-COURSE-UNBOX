/**
 * POST /api/video/status — what Bunny currently thinks of one video.
 *
 * Encoding takes minutes, and the authoring form has to show the teacher
 * whether the lesson they just uploaded is playable. A webhook would tell us,
 * but a webhook cannot reach `localhost:3000` and cannot help a form that is
 * open *right now* — so this poll is the path that always works and
 * `/api/webhooks/bunny` is the optimisation layered on top of it.
 *
 * Deliberately read-only: it asks Bunny and answers, and does not write the
 * status back to the subtopic. The form's copy is not saved until the form is
 * saved, and a poll that quietly mutated a record the author had not committed
 * would be a surprise.
 */
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/guards";
import { canUploadTo } from "@/lib/uploads/kinds";
import { getVideo, isConfigured } from "@/lib/video/bunny";
import { isVideoId } from "@/lib/video/shared";

function refuse(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return refuse("Your session has expired. Sign in again.", 401);
  if (!canUploadTo(user.role, "curriculum")) {
    return refuse("You can't read lesson videos.", 403);
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

  try {
    const facts = await getVideo(videoId);
    if (!facts) return refuse("That video is no longer in the library.", 404);

    return NextResponse.json({ ok: true, ...facts });
  } catch (error) {
    console.error("[api/video/status] could not read the video:", error);
    return refuse("Couldn't check the video. Try again.", 502);
  }
}
