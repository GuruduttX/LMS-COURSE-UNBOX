/**
 * POST /api/webhooks/bunny — Bunny telling us a video finished encoding.
 *
 * The payload is three fields: `{ VideoLibraryId, VideoGuid, Status }`. We use
 * it to move a subtopic's cached `video.status` from "processing" to "ready"
 * (or "failed") and to write down the runtime Bunny measured, so a student's
 * page can say the right thing without an API call on every render.
 *
 * ## This is an optimisation, not the mechanism
 *
 * Nothing breaks without it. The authoring form polls `/api/video/status`, and
 * a webhook cannot reach a laptop anyway — in development this route is simply
 * never called. Point Bunny at it in production (Library → API → Webhook URL)
 * and the status becomes eventually-correct without anyone opening a form.
 *
 * ## Verification
 *
 * `HMAC-SHA256(rawBody, readOnlyApiKey)` in `X-BunnyStream-Signature`, compared
 * in constant time. Two things are load-bearing:
 *
 * - the body is read as **text** and hashed as the exact bytes that arrived.
 *   `request.json()` here would reorder keys and change whitespace, and the
 *   hash would then never match;
 * - an unverifiable call is refused, not trusted. This URL is public, so
 *   without the secret anyone who guesses it could mark a broken video ready.
 *
 * It always answers 200 once the signature checks out, even when the video
 * belongs to no subtopic we know of — a webhook retried forever because we
 * returned 404 for a video someone deleted is noise, not information.
 */
import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/auth/audit";
import { connectToDatabase } from "@/lib/db";
import { getVideo, verifyWebhook } from "@/lib/video/bunny";
import { isVideoId, statusFromWebhook } from "@/lib/video/shared";
import { Subtopic } from "@/models/Subtopic";

export async function POST(request: Request) {
  const signature = request.headers.get("X-BunnyStream-Signature") ?? "";
  const algorithm = request.headers.get("X-BunnyStream-Signature-Algorithm");
  const version = request.headers.get("X-BunnyStream-Signature-Version");

  const rawBody = await request.text();

  if (version !== "v1" || algorithm !== "hmac-sha256") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!signature || !verifyWebhook(rawBody, signature)) {
    console.warn("[api/webhooks/bunny] rejected an unsigned or mis-signed call");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let payload: { VideoGuid?: unknown; Status?: unknown };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const videoId = payload.VideoGuid;
  const code = typeof payload.Status === "number" ? payload.Status : null;

  if (!isVideoId(videoId) || code === null) {
    return NextResponse.json({ ok: false }, { status: 422 });
  }

  const status = statusFromWebhook(code);

  // Bunny sends one of these per resolution as well as at the end. Only the
  // three that change what a screen shows are worth a write.
  if (status === "processing") return NextResponse.json({ ok: true });

  await connectToDatabase();

  // Ask Bunny for the runtime rather than trusting the callback, which does not
  // carry one. A ready video with `seconds: 0` would print "0m" next to every
  // lesson title, which is worse than the extra call.
  let seconds: number | null = null;
  if (status === "ready") {
    try {
      seconds = (await getVideo(videoId))?.seconds ?? null;
    } catch (error) {
      console.error("[api/webhooks/bunny] couldn't read the runtime:", error);
    }
  }

  const result = await Subtopic.updateOne(
    { "video.videoId": videoId },
    {
      $set: {
        "video.status": status,
        ...(seconds ? { "video.seconds": seconds, seconds } : {}),
      },
    },
  );

  // Only when it landed on a lesson. A callback for a video nobody owns is
  // still answered 200 (see the header note), but it isn't an event.
  if (result.matchedCount > 0) {
    await recordAudit(
      { kind: "system", label: "Bunny Stream" },
      {
        action: "video.ready",
        targetType: "Video",
        targetId: videoId,
        summary:
          status === "ready"
            ? `Lesson video finished encoding${seconds ? ` (${Math.round(seconds / 60)} min)` : ""}`
            : "Lesson video failed to encode",
        meta: { videoId, status, seconds },
      },
    );
  }

  return NextResponse.json({ ok: true });
}
