"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Film,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import * as tus from "tus-js-client";

import { cn } from "@/lib/cn";
import {
  VIDEO_MAX_BYTES,
  formatBytes,
  validateVideoFile,
  videoAcceptAttribute,
  type StoredVideo,
  type VideoStatus,
} from "@/lib/video/shared";

/**
 * The lesson-video field.
 *
 * Sibling of `FileUpload`, and the same shape of solution — ask our server for
 * a credential, then send the bytes **straight to the provider** — but not the
 * same mechanics, which is why it is a second component rather than a mode of
 * the first:
 *
 * - a lecture is gigabytes, so the transfer is **TUS**, chunked and resumable.
 *   A dropped connection halfway through a 1.5 GB upload picks up where it
 *   stopped instead of starting again;
 * - the upload is not the end. Bunny then encodes for minutes, and a video
 *   that has arrived is not yet a video that plays — so the field keeps
 *   polling and reports "Encoding" until it is genuinely ready.
 *
 * It posts its value as **JSON in one hidden field**, the same pattern as
 * `FileUpload` and `QuestionBuilder`: the server action reads one field and
 * re-validates it.
 *
 * Deliberate, and the same rule as `FileUpload`: a video removed here is
 * deleted from Bunny **only if this session uploaded it**. One that arrived
 * through `defaultValue` belongs to a saved lesson, and abandoning the form
 * afterwards would leave that lesson pointing at a video we had deleted.
 */

type Phase = "idle" | "uploading" | "encoding" | "ready" | "error";

type State = {
  phase: Phase;
  /** 0–100. Bytes transferred while uploading, encode progress after. */
  progress: number;
  error?: string;
  video: StoredVideo | null;
  /** True when this component uploaded it, so it is ours to delete. */
  fresh: boolean;
};

/** How often to ask Bunny whether encoding has finished. */
const POLL_MS = 5_000;

export function VideoUpload({
  name,
  defaultValue = null,
  /** The lesson's title, so the Bunny dashboard is readable. Optional. */
  title,
  label,
  hint,
  error,
  disabled = false,
  className,
}: {
  name: string;
  defaultValue?: StoredVideo | null;
  title?: string;
  label?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}) {
  const inputId = useId();

  const [state, setState] = useState<State>(() => ({
    phase: defaultValue
      ? defaultValue.status === "ready"
        ? "ready"
        : defaultValue.status === "failed"
          ? "error"
          : "encoding"
      : "idle",
    progress: defaultValue?.status === "ready" ? 100 : 0,
    error:
      defaultValue?.status === "failed"
        ? "Bunny couldn't encode this video. Upload it again."
        : undefined,
    video: defaultValue,
    fresh: false,
  }));

  const inputRef = useRef<HTMLInputElement>(null);
  /** The upload in flight, so removing one mid-transfer actually stops it. */
  const transfer = useRef<tus.Upload | null>(null);

  /**
   * Poll Bunny until the video is playable.
   *
   * Runs whenever the field is holding a video that hasn't finished encoding —
   * including one loaded from a saved record, because a teacher who comes back
   * to the form five minutes later should see it go green without a reload.
   */
  const videoId = state.video?.videoId;
  const watching = state.phase === "encoding" && Boolean(videoId);

  useEffect(() => {
    if (!watching || !videoId) return;

    let live = true;

    async function check() {
      try {
        const response = await fetch("/api/video/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId }),
        });

        const payload = (await response.json()) as {
          ok: boolean;
          status?: VideoStatus;
          seconds?: number;
          encodeProgress?: number;
        };

        if (!live || !response.ok || !payload.ok || !payload.status) return;

        setState((previous) => {
          if (!previous.video || previous.video.videoId !== videoId) {
            return previous;
          }

          const video: StoredVideo = {
            ...previous.video,
            status: payload.status!,
            seconds: payload.seconds ?? previous.video.seconds,
          };

          if (payload.status === "ready") {
            return { ...previous, phase: "ready", progress: 100, video };
          }

          if (payload.status === "failed") {
            return {
              ...previous,
              phase: "error",
              error: "Bunny couldn't encode this video. Try a different file.",
              video,
            };
          }

          return { ...previous, progress: payload.encodeProgress ?? 0, video };
        });
      } catch {
        // A failed poll is not a failed upload. Keep waiting — the next tick
        // will very likely succeed, and the teacher can always save and
        // come back.
      }
    }

    void check();
    const timer = setInterval(check, POLL_MS);

    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [watching, videoId]);

  const start = useCallback(
    async (file: File) => {
      const problem = validateVideoFile(file);
      if (problem) {
        setState({
          phase: "error",
          progress: 0,
          error: problem,
          video: null,
          fresh: false,
        });
        return;
      }

      setState({
        phase: "uploading",
        progress: 0,
        video: null,
        fresh: true,
      });

      let credentials: {
        ok: boolean;
        message?: string;
        endpoint?: string;
        libraryId?: string;
        videoId?: string;
        expires?: number;
        signature?: string;
      };

      try {
        const response = await fetch("/api/video/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, size: file.size, title }),
        });
        credentials = await response.json();

        if (!response.ok || !credentials.ok || !credentials.signature) {
          setState({
            phase: "error",
            progress: 0,
            error: credentials.message ?? "Couldn't start the upload.",
            video: null,
            fresh: false,
          });
          return;
        }
      } catch {
        setState({
          phase: "error",
          progress: 0,
          error: "Couldn't reach the server. Check your connection.",
          video: null,
          fresh: false,
        });
        return;
      }

      const { endpoint, libraryId, videoId, expires, signature } =
        credentials as Required<typeof credentials>;

      const upload = new tus.Upload(file, {
        endpoint,
        // 5 MB parts. Small enough that a dropped connection costs seconds,
        // large enough that a two-hour lecture isn't hundreds of requests.
        chunkSize: 5 * 1024 * 1024,
        retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
        headers: {
          AuthorizationSignature: signature,
          AuthorizationExpire: String(expires),
          LibraryId: libraryId,
          VideoId: videoId,
        },
        metadata: {
          filetype: file.type || "video/mp4",
          title: (title || file.name).slice(0, 200),
        },
        onProgress(sent, total) {
          setState((previous) =>
            previous.phase === "uploading"
              ? { ...previous, progress: Math.round((sent / total) * 100) }
              : previous,
          );
        },
        onError(cause) {
          transfer.current = null;
          console.error("[VideoUpload] tus failed:", cause);
          setState({
            phase: "error",
            progress: 0,
            error: "The upload failed. Check your connection and try again.",
            video: null,
            fresh: false,
          });
        },
        onSuccess() {
          transfer.current = null;
          // Arrived, but not yet playable: Bunny now has minutes of encoding
          // to do, which the poll above watches.
          setState({
            phase: "encoding",
            progress: 0,
            video: {
              videoId,
              libraryId,
              status: "processing",
              seconds: 0,
              name: file.name,
              bytes: file.size,
            },
            fresh: true,
          });
        },
      });

      transfer.current = upload;
      upload.start();
    },
    [title],
  );

  /** Stop a transfer in flight, and delete anything we already put up there. */
  function discard() {
    void transfer.current?.abort();
    transfer.current = null;

    if (state.fresh && state.video) {
      void fetch("/api/video/destroy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: state.video.videoId }),
        // Best effort: the field's job is done once the row is gone, and a
        // failed cleanup must not block the person from carrying on.
        keepalive: true,
      }).catch(() => {});
    }

    setState({ phase: "idle", progress: 0, video: null, fresh: false });
  }

  const busy = state.phase === "uploading" || state.phase === "encoding";
  const filled = state.phase !== "idle";

  const zone = (
    <div className={cn("space-y-3", className)}>
      {!filled ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface p-5 text-center">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            className="sr-only"
            accept={videoAcceptAttribute()}
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Reset, so picking the same file twice still fires a change.
              event.target.value = "";
              if (file) void start(file);
            }}
          />

          <UploadCloud size={22} aria-hidden className="mx-auto text-ink-400" />

          <p className="mt-2 text-sm text-ink-700">
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className="font-semibold text-brand-600 underline-offset-2 hover:underline disabled:pointer-events-none disabled:text-ink-400"
            >
              Choose a video
            </button>{" "}
            <span className="text-ink-500">or paste a link below instead</span>
          </p>

          <p className="mt-1 text-xs text-ink-500">
            MP4, MOV, MKV or WebM · up to {formatBytes(VIDEO_MAX_BYTES)}
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "rounded-lg border bg-surface p-3",
            state.phase === "error" ? "border-danger-500" : "border-border",
          )}
        >
          <div className="flex items-center gap-3">
            <Film size={18} aria-hidden className="shrink-0 text-ink-400" />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-800">
                {state.video?.name ?? "Uploading…"}
              </p>

              {state.phase === "error" ? (
                <p className="mt-0.5 text-xs font-medium text-danger-700">
                  {state.error}
                </p>
              ) : busy ? (
                <>
                  <div
                    className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-ink-100"
                    role="progressbar"
                    aria-label={
                      state.phase === "uploading" ? "Uploading" : "Encoding"
                    }
                    aria-valuenow={state.progress}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-300",
                        state.phase === "uploading"
                          ? "bg-brand-600"
                          : "bg-warning-500",
                      )}
                      style={{ width: `${Math.max(state.progress, 3)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {state.phase === "uploading"
                      ? `Uploading — ${state.progress}%`
                      : `Encoding — ${state.progress}%. You can save the lesson now; it will start playing once this finishes.`}
                  </p>
                </>
              ) : (
                <p className="mt-0.5 text-xs text-ink-500">
                  {formatBytes(state.video?.bytes ?? 0)}
                  {state.video?.seconds
                    ? ` · ${Math.floor(state.video.seconds / 60)}m ${state.video.seconds % 60}s`
                    : ""}
                </p>
              )}
            </div>

            {state.phase === "uploading" ? (
              <Loader2
                size={16}
                aria-hidden
                className="shrink-0 animate-spin text-ink-400"
              />
            ) : state.phase === "encoding" ? (
              <Clock size={16} aria-hidden className="shrink-0 text-warning-700" />
            ) : state.phase === "ready" ? (
              <CheckCircle2 size={16} aria-hidden className="shrink-0 text-success-500" />
            ) : null}

            <button
              type="button"
              onClick={discard}
              disabled={disabled}
              aria-label="Remove this video"
              className="shrink-0 rounded-md p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-50"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>
      )}

      {/* Null rather than an absent field when there is no video: the action
          has to be able to tell "left alone" from "taken off", and an empty
          string would read as the first. */}
      <input
        type="hidden"
        name={name}
        value={state.video ? JSON.stringify(state.video) : ""}
      />
    </div>
  );

  if (!label) return zone;

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-sm font-medium text-ink-700"
      >
        {label}
      </label>
      {zone}
      {error ? (
        <p
          role="alert"
          className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-danger-700"
        >
          <AlertCircle size={14} className="mt-px shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}
