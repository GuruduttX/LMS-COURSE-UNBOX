import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

import { statusFromApi, type StoredVideo, type VideoStatus } from "./shared";

/**
 * Bunny Stream, by hand.
 *
 * No SDK, for the same reason `lib/uploads/cloudinary.ts` has none: the whole
 * surface we need is four JSON endpoints and two hashes, which is less code
 * than the dependency would be.
 *
 * **The browser uploads straight to Bunny.** We create the video record and
 * sign a short-lived TUS credential; the bytes then go from the teacher's
 * laptop to `video.bunnycdn.com` without passing through this app. A 1.5 GB
 * lecture through a Next route handler would blow the body limit, spend our
 * bandwidth twice and give the uploader no progress bar. What the server keeps
 * is the part that matters — the API key, and the decision that this person
 * may create a video at all.
 *
 * **Two hashes, both SHA-256, both unrelated.** The upload signature proves
 * "this browser was allowed to fill this one video"; the embed token proves
 * "this player was opened by our app". Neither is the other, and each is
 * documented at its own function.
 *
 * ## Configuration is optional, on purpose
 *
 * Unset the `BUNNY_*` variables and `isConfigured()` is false: the uploader
 * disappears from the authoring form, the video field falls back to pasting a
 * link, and the whole app still runs. Same trade as Google Meet in
 * `lib/googleCalendar.ts` — a feature nobody has keys for yet must not be a
 * crash.
 */

const API_BASE = "https://video.bunnycdn.com/library";
const TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";
const IFRAME_BASE = "https://iframe.mediadelivery.net/embed";

/** How long a signed TUS credential lives. Long enough for a 2 GB upload on a
 *  slow line; short enough that a leaked one is worthless by tomorrow. */
const UPLOAD_TTL_SECONDS = 6 * 60 * 60;

/**
 * How long a signed embed URL lives.
 *
 * The token authenticates the **iframe load**, not the video stream: once the
 * player is up it fetches its own segments, so an expiry mid-lesson does not
 * stop a student watching. It only has to outlast the gap between the server
 * rendering the page and the browser loading the frame.
 *
 * Bunny recommends 1–5 minutes. Thirty is the compromise for a *page* rather
 * than an API call: a learning screen can sit open in a tab for a while before
 * anyone looks at it, and a token that dies in ninety seconds turns a
 * back-button into a 403. It is still short enough that a leaked URL is
 * worthless by the time anyone could pass it on.
 *
 * This is also why the player iframe is **not** `loading="lazy"` — a frame
 * that waits for a scroll could easily wait past its own token.
 */
const EMBED_TTL_SECONDS = 30 * 60;

/** True when the library id and API key are both present and real. */
export function isConfigured(): boolean {
  return Boolean(env.BUNNY_STREAM_LIBRARY_ID && env.BUNNY_STREAM_API_KEY);
}

/** The two required values, or a thrown error naming what is missing. */
function credentials(): { libraryId: string; apiKey: string } {
  const libraryId = env.BUNNY_STREAM_LIBRARY_ID;
  const apiKey = env.BUNNY_STREAM_API_KEY;

  if (!libraryId || !apiKey) {
    throw new Error(
      "Bunny Stream is not configured. Set BUNNY_STREAM_LIBRARY_ID and BUNNY_STREAM_API_KEY in .env.local.",
    );
  }

  return { libraryId, apiKey };
}

/**
 * The configured library, or null when Bunny isn't set up. Unlike
 * `credentials()` this never throws: callers use it to *pin* a library id that
 * arrived from a form, and an unconfigured app should keep whatever the form
 * said rather than crash a save.
 */
export function configuredLibraryId(): string | null {
  return env.BUNNY_STREAM_LIBRARY_ID;
}

async function callApi(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { libraryId, apiKey } = credentials();

  return fetch(`${API_BASE}/${libraryId}${path}`, {
    ...init,
    headers: {
      AccessKey: apiKey,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    // Never cache a video's encoding state — it is the thing that changes.
    cache: "no-store",
  });
}

/**
 * Step one of an upload: reserve a video and get its GUID.
 *
 * Nothing is transferred here. Bunny creates an empty record in the library;
 * the bytes arrive later over TUS, addressed to this id. A video created and
 * never filled sits at status "Created" and costs nothing but a row — but see
 * `deleteVideo`, which is how an abandoned upload is cleaned up.
 */
export async function createVideo(title: string): Promise<string> {
  const response = await callApi("/videos", {
    method: "POST",
    body: JSON.stringify({ title: title.slice(0, 200) }),
  });

  if (!response.ok) {
    throw new Error(
      `Bunny refused to create the video (${response.status} ${await safeText(response)}).`,
    );
  }

  const payload = (await response.json()) as { guid?: string };
  if (!payload.guid) throw new Error("Bunny created a video without a guid.");

  return payload.guid;
}

export type TusCredentials = {
  endpoint: string;
  libraryId: string;
  videoId: string;
  /** UNIX seconds. Sent as `AuthorizationExpire`. */
  expires: number;
  /** SHA-256 hex. Sent as `AuthorizationSignature`. */
  signature: string;
};

/**
 * Step two: a credential the browser can upload with, and nothing more.
 *
 * `SHA256(libraryId + apiKey + expires + videoId)` — Bunny recomputes it and
 * so learns that whoever holds this hash also held the API key at some point,
 * without the key ever leaving the server. It is scoped to **one** video id,
 * so the worst a stolen credential can do is fill a video record that this app
 * already created and already knows about.
 */
export function signTusUpload(videoId: string): TusCredentials {
  const { libraryId, apiKey } = credentials();
  const expires = Math.floor(Date.now() / 1000) + UPLOAD_TTL_SECONDS;

  const signature = createHash("sha256")
    .update(`${libraryId}${apiKey}${expires}${videoId}`)
    .digest("hex");

  return { endpoint: TUS_ENDPOINT, libraryId, videoId, expires, signature };
}

export type VideoFacts = {
  status: VideoStatus;
  /** Runtime in seconds. 0 until Bunny has measured it. */
  seconds: number;
  /** 0–100 while transcoding. */
  encodeProgress: number;
};

/**
 * What Bunny currently thinks of a video.
 *
 * The authoring form polls this after an upload, because a webhook cannot
 * reach a laptop: `next dev` on localhost has no public URL, so polling is the
 * path that works everywhere and the webhook is the optimisation on top of it.
 *
 * Returns null for a 404 — a video deleted in the Bunny dashboard is not an
 * error here, it is a subtopic whose video is gone, and the caller says so.
 */
export async function getVideo(videoId: string): Promise<VideoFacts | null> {
  const response = await callApi(`/videos/${videoId}`);

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Bunny wouldn't describe that video (${response.status} ${await safeText(response)}).`,
    );
  }

  const payload = (await response.json()) as {
    status?: number;
    length?: number;
    encodeProgress?: number;
  };

  return {
    status: statusFromApi(payload.status ?? 0),
    seconds: Math.max(0, Math.round(payload.length ?? 0)),
    encodeProgress: Math.min(100, Math.max(0, payload.encodeProgress ?? 0)),
  };
}

/**
 * Delete a video from the library.
 *
 * Called when a teacher swaps one out before saving, and when a subtopic that
 * owned one is deleted. Storage is billed monthly and delivery is billed by
 * the GB, so an orphan is a standing charge — this is not tidiness.
 *
 * A 404 counts as success: the caller's intent, "this should not exist", is
 * satisfied either way. Same rule as `destroyAsset`.
 */
export async function deleteVideo(
  videoId: string,
): Promise<{ ok: boolean; detail: string }> {
  const response = await callApi(`/videos/${videoId}`, { method: "DELETE" });

  if (response.ok || response.status === 404) {
    return { ok: true, detail: response.status === 404 ? "not found" : "ok" };
  }

  return { ok: false, detail: `${response.status} ${await safeText(response)}` };
}

/**
 * The iframe URL a student's player loads.
 *
 * `SHA256(tokenKey + videoId + expires)`, exactly as Bunny specifies.
 *
 * **The token key is the library's API key.** Not a separate secret — Bunny's
 * mobile-SDK guide says it outright ("token security key is your Video Library
 * API Key"), and the library object has no other key on it. So there is
 * nothing extra to find in the dashboard, and `BUNNY_STREAM_TOKEN_KEY` exists
 * only as an override for the day that stops being true.
 *
 * The URL is signed whenever a key is available, whether or not "Embed View
 * Token Authentication" is switched on in the library's Security tab — an
 * unnecessary token is ignored, so signing early means turning the setting on
 * later needs no deploy. Turning it on *without* a key here is the failure
 * case, and it is a 403 on every player.
 *
 * Signing here rather than in the component is the whole point: the key never
 * reaches the browser, so a student cannot mint a URL for a lesson they are
 * not enrolled in.
 */
export function embedUrl(
  video: Pick<StoredVideo, "videoId" | "libraryId">,
  options: {
    /** Resume where this viewer left off, and remember when they leave. */
    rememberPosition?: boolean;
    autoplay?: boolean;
  } = {},
): string {
  const url = new URL(`${IFRAME_BASE}/${video.libraryId}/${video.videoId}`);

  url.searchParams.set("autoplay", options.autoplay ? "true" : "false");
  url.searchParams.set("preload", "false");
  url.searchParams.set("showSpeed", "true");
  if (options.rememberPosition !== false) {
    url.searchParams.set("rememberPosition", "true");
  }

  const key = env.BUNNY_STREAM_TOKEN_KEY ?? env.BUNNY_STREAM_API_KEY;
  if (key) {
    const expires = Math.floor(Date.now() / 1000) + EMBED_TTL_SECONDS;
    const token = createHash("sha256")
      .update(`${key}${video.videoId}${expires}`)
      .digest("hex");

    url.searchParams.set("token", token);
    url.searchParams.set("expires", String(expires));
  }

  return url.toString();
}

/**
 * The poster frame, straight off the pull zone.
 *
 * Only available when `BUNNY_STREAM_CDN_HOSTNAME` is set (the library's pull
 * zone, `vz-….b-cdn.net`). Returns null otherwise rather than guessing a host,
 * and the staff screens then simply show no thumbnail — a broken image would
 * be worse than none.
 *
 * Note this is a *direct* CDN file. With MediaCage Basic DRM enabled, playback
 * is embed-only but thumbnails keep working; with CDN token authentication
 * enabled on the pull zone they would not, and this would need signing too.
 */
export function thumbnailUrl(video: Pick<StoredVideo, "videoId">): string | null {
  const host = env.BUNNY_STREAM_CDN_HOSTNAME;
  if (!host) return null;

  return `https://${host}/${video.videoId}/thumbnail.jpg`;
}

/**
 * Is this webhook really from Bunny?
 *
 * `HMAC-SHA256(rawBody, readOnlyApiKey)`, compared in constant time. The body
 * must be the **exact bytes** that arrived — re-serialising the parsed JSON
 * reorders keys and changes whitespace, and the hash then never matches.
 *
 * Returns false when no secret is configured: an unverifiable webhook is one
 * we decline to act on, because the alternative is letting anyone who guesses
 * the URL rewrite a lesson's encoding state.
 */
export function verifyWebhook(rawBody: string, signature: string): boolean {
  const secret = env.BUNNY_WEBHOOK_SECRET;
  if (!secret) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  const given = Buffer.from(signature.trim().toLowerCase(), "utf8");
  const mine = Buffer.from(expected, "utf8");

  if (given.length !== mine.length) return false;
  return timingSafeEqual(given, mine);
}

/** Bunny's error bodies are short; a truncated one is enough for a log line. */
async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 200);
  } catch {
    return "";
  }
}
