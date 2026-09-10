/**
 * What a lesson video is, on both sides of the wire.
 *
 * Imported by **both** the browser uploader and the server that signs, exactly
 * like `lib/uploads/kinds.ts` — the rules cannot drift between the two if there
 * is only one copy of them. Pure and dependency-free: nothing here may import
 * Mongoose, `lib/env.ts`, or `server-only`.
 *
 * The video half of the curriculum does not go through Cloudinary. Cloudinary
 * stores a file; Bunny Stream takes a file and gives back a *ladder* of
 * encoded renditions plus a player, which is what a lecture needs and what a
 * `<video src>` on a raw upload cannot be. So videos have their own field,
 * their own uploader and their own stored shape, and the two never mix.
 */

/**
 * What a subtopic keeps once a video has been uploaded.
 *
 * `videoId` is Bunny's GUID and the only handle that matters — every URL
 * (embed, thumbnail, HLS) is derived from it, and without it the video can
 * never be deleted from the library. `libraryId` is stored next to it rather
 * than read from the environment at play time, so a video keeps pointing at
 * the library it was actually uploaded to even if the app is later re-pointed
 * at a different one.
 */
export type StoredVideo = {
  videoId: string;
  libraryId: string;
  status: VideoStatus;
  /** Runtime in seconds, as Bunny measured it. 0 until encoding finishes. */
  seconds: number;
  /** The name the teacher's file had — for the staff screens, never students. */
  name: string;
  bytes: number;
};

/**
 * Three states, because three is all a screen ever needs to say.
 *
 * Bunny reports eight (Created, Uploaded, Processing, Transcoding, Finished,
 * Error, JitSegmenting, JitPlaylistsCreated) and its *webhook* reports a
 * different eleven under the same name. Both are collapsed here, once, so no
 * screen ever has to know which enum it is holding. See `statusFromApi` and
 * `statusFromWebhook` — they are deliberately separate functions because the
 * two numbering schemes disagree: 3 means "Transcoding" to the API and
 * "Finished" to the webhook.
 */
export type VideoStatus = "processing" | "ready" | "failed";

export const VIDEO_STATUSES: readonly VideoStatus[] = [
  "processing",
  "ready",
  "failed",
];

export function isVideoStatus(value: unknown): value is VideoStatus {
  return (
    typeof value === "string" && (VIDEO_STATUSES as readonly string[]).includes(value)
  );
}

/** `GET /library/{id}/videos/{guid}` → `status`. 4 is Finished, 5/6 are dead. */
export function statusFromApi(status: number): VideoStatus {
  if (status === 4 || status === 7 || status === 8) return "ready";
  if (status === 5 || status === 6) return "failed";
  return "processing";
}

/** The webhook's own scale. 3 is Finished here; 5 and 8 are the failures. */
export function statusFromWebhook(status: number): VideoStatus {
  if (status === 3) return "ready";
  if (status === 5 || status === 8) return "failed";
  return "processing";
}

export const VIDEO_STATUS_LABEL: Record<VideoStatus, string> = {
  processing: "Encoding",
  ready: "Ready to play",
  failed: "Encoding failed",
};

/**
 * What a teacher may hand us.
 *
 * A subset of what Bunny's encoder accepts — the containers a person actually
 * records or exports a lecture in. Anything else is refused here with a
 * sentence rather than at Bunny with a 400 twenty minutes into an upload.
 */
export const VIDEO_EXTENSIONS = [
  "mp4",
  "mov",
  "m4v",
  "mkv",
  "webm",
  "avi",
  "wmv",
  "flv",
  "mpeg",
  "mpg",
  "ts",
] as const;

export const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/x-matroska",
  "video/webm",
  "video/x-msvideo",
  "video/x-ms-wmv",
  "video/x-flv",
  "video/mpeg",
  "video/mp2t",
];

/**
 * 2 GB.
 *
 * Not a Bunny limit — TUS resumes, so the service itself would take far more.
 * It is a *bandwidth* limit: delivery is billed per GB, and a teacher who
 * uploads a 20 GB ProRes master has just made every student who opens that
 * lesson expensive. A 2 GB cap is roughly two hours of sensible 1080p.
 */
export const VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024;

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

/** What goes in `<input accept>`. */
export function videoAcceptAttribute(): string {
  return [
    ...VIDEO_EXTENSIONS.map((extension) => `.${extension}`),
    ...VIDEO_MIME_TYPES,
  ].join(",");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export type FileFacts = { name: string; size: number };

/**
 * The one validator, run in the browser for fast feedback and again in the
 * route handler, because client validation is a convenience and never a
 * guarantee. Returns the message to show, or null when the file is fine.
 */
export function validateVideoFile(file: FileFacts): string | null {
  const extension = extensionOf(file.name);

  if (!extension || !(VIDEO_EXTENSIONS as readonly string[]).includes(extension)) {
    return "That isn't a video file we can encode. Use MP4, MOV, MKV or WebM.";
  }

  if (file.size <= 0) return "That file is empty.";

  if (file.size > VIDEO_MAX_BYTES) {
    return `Videos must be under ${formatBytes(VIDEO_MAX_BYTES)} — this one is ${formatBytes(file.size)}. Export it at 1080p and try again.`;
  }

  return null;
}

/** Bunny's GUIDs, and nothing else. Guards every id that arrives from a form. */
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isVideoId(value: unknown): value is string {
  return typeof value === "string" && GUID_PATTERN.test(value);
}

/**
 * Turn what `VideoUpload` posted back into a video a write can trust.
 *
 * The field posts JSON from the browser, so a forged post could name any GUID
 * and any library. Everything is therefore re-checked: the id must be a GUID,
 * the library must be a plain number, the status must be one of ours. Anything
 * that fails takes the whole payload with it. Same contract, and the same
 * reasoning, as `parseUploadedFiles` in `lib/uploads/kinds.ts`.
 *
 * It cannot check that this GUID belongs to *this* library — that would be an
 * API call inside a validator. The library id is overwritten from the
 * environment by the caller before the write, which closes the same hole
 * without the round trip.
 */
export function parseStoredVideo(raw: string): {
  video: StoredVideo | null;
  error?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { video: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { video: null, error: "That upload didn't come through. Try again." };
  }

  if (parsed === null) return { video: null };

  const item = (parsed ?? {}) as Record<string, unknown>;

  const videoId = item.videoId;
  const libraryId = typeof item.libraryId === "string" ? item.libraryId : "";
  const status = item.status;
  const seconds = typeof item.seconds === "number" ? item.seconds : 0;
  const name = typeof item.name === "string" ? item.name : "";
  const bytes = typeof item.bytes === "number" ? item.bytes : NaN;

  const wellFormed =
    isVideoId(videoId) &&
    /^[0-9]{1,12}$/.test(libraryId) &&
    isVideoStatus(status) &&
    Number.isFinite(seconds) &&
    seconds >= 0 &&
    name.length > 0 &&
    name.length <= 260 &&
    Number.isFinite(bytes) &&
    bytes >= 0;

  if (!wellFormed) {
    return { video: null, error: "That video isn't one we uploaded. Add it again." };
  }

  return {
    video: {
      videoId: videoId as string,
      libraryId,
      status: status as VideoStatus,
      seconds: Math.round(seconds),
      name,
      bytes,
    },
  };
}
