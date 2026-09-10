/**
 * POST /api/video/sign — reserve a video on Bunny and hand back a credential
 * the browser can upload it with.
 *
 * The video half of `/api/uploads/sign`, and it holds the same line: this
 * route is the only thing that ever sees the Stream API key, and a signature
 * is a capability, so everything the component already checked is checked
 * again here — who is asking, whether their role may author curriculum, and
 * whether the file is a kind and a size we accept.
 *
 * Unlike the Cloudinary route it also *writes* before it signs: Bunny's TUS
 * flow needs a video record to exist first. That means a person who asks for a
 * signature and then closes the tab has left an empty video in the library.
 * `/api/video/destroy` is how the component cleans that up, and an empty
 * record costs nothing until bytes arrive.
 *
 * It returns JSON for every outcome, never a redirect — the caller is `fetch`,
 * and a 307 to /login would arrive as an opaque parse error rather than "you
 * are signed out".
 */
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/guards";
import { canUploadTo } from "@/lib/uploads/kinds";
import { createVideo, isConfigured, signTusUpload } from "@/lib/video/bunny";
import { validateVideoFile } from "@/lib/video/shared";

function refuse(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return refuse("Your session has expired. Sign in again.", 401);
  if (user.mustChangePassword) {
    return refuse("Change your password before uploading.", 403);
  }

  // Videos are course material and nothing else, so there is no scope to pick:
  // the `curriculum` role list — admin and teacher — is the whole rule.
  if (!canUploadTo(user.role, "curriculum")) {
    return refuse("You can't upload lesson videos.", 403);
  }

  if (!isConfigured()) {
    return refuse(
      "Video uploads aren't configured. Paste a link instead, or ask an admin to set up Bunny Stream.",
      503,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse("Expected a JSON body.", 400);
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const fileName = typeof raw.fileName === "string" ? raw.fileName : "";
  const size = typeof raw.size === "number" ? raw.size : NaN;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";

  if (!fileName || !Number.isFinite(size)) {
    return refuse("Expected a fileName and a size.", 422);
  }

  const problem = validateVideoFile({ name: fileName, size });
  if (problem) return refuse(problem, 422);

  try {
    // The title is what a person sees in the Bunny dashboard, so it is the
    // lesson's title when the form knows it and the filename when it doesn't —
    // a library full of `recording_final_v3.mp4` helps nobody.
    const videoId = await createVideo(title || fileName);
    const credentials = signTusUpload(videoId);

    return NextResponse.json({ ok: true, ...credentials });
  } catch (error) {
    // A missing or wrong BUNNY_* value throws here. The message names the
    // variable, so it goes to the console and not to the browser.
    console.error("[api/video/sign] could not start the upload:", error);
    return refuse("Couldn't start the upload. Try again.", 502);
  }
}
