"use client";

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Paperclip,
  UploadCloud,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/cn";
import { FILE_KIND_ICON } from "./AttachmentLink";
import {
  FILE_KINDS,
  FILE_KIND_SPECS,
  MAX_UPLOAD_BYTES,
  acceptAttribute,
  describeKinds,
  formatBytes,
  kindForFile,
  validateUpload,
  type FileKind,
  type UploadScope,
  type UploadedFile,
} from "@/lib/uploads/kinds";

/**
 * The upload field — one component for images, PDFs and Word documents,
 * anywhere in the staff panel.
 *
 * How it works: ask our server for a signature, then POST the file **straight
 * to Cloudinary** from the browser. The bytes never touch our server, and the
 * `XMLHttpRequest` (rather than `fetch`) is deliberate — it is the only way to
 * get real upload progress, and a 10 MB PDF on a phone needs a bar that moves.
 *
 * It posts its value as **JSON in one hidden field**, the same pattern as
 * `QuestionBuilder`: a server action reads one field and parses it, instead of
 * `files[0][publicId]` name soup. Pass `onChange` instead if the parent is a
 * client component holding its own state.
 *
 * What is stored is `UploadedFile`, publicId included — a record with only a URL
 * is a file nobody can ever delete.
 *
 * Deliberate: a file removed here is destroyed in Cloudinary **only if this
 * session uploaded it**. One that arrived through `defaultValue` came from a
 * saved record, and abandoning the form afterwards would leave that record
 * pointing at bytes we had already deleted.
 */

type Item = {
  /** Local key, not the Cloudinary id — an item can fail before it has one. */
  id: string;
  name: string;
  size: number;
  kind: FileKind | null;
  status: "uploading" | "done" | "error";
  progress: number;
  error?: string;
  file?: UploadedFile;
  /** True when this component uploaded it, so it is ours to delete. */
  fresh: boolean;
};

export type FileUploadProps = {
  /** Name of the hidden input carrying the JSON payload. */
  name?: string;
  /** Which part of the app this belongs to — decides the folder and who may. */
  scope: UploadScope;
  /** Narrow what is accepted. Defaults to every kind. */
  accept?: readonly FileKind[];
  /**
   * Raise (or lower) the size cap for this field, overriding each kind's
   * default. Clamped server-side to `MAX_UPLOAD_BYTES` — see `validateUpload`.
   */
  maxBytes?: number;
  multiple?: boolean;
  /** Hard cap on how many files the field holds. Defaults to 1, or 8. */
  maxFiles?: number;
  /** Files already on the record. Removed here, never destroyed here. */
  defaultValue?: UploadedFile[];
  onChange?: (files: UploadedFile[]) => void;
  label?: string;
  hint?: string;
  /** A problem with the field as a whole — a rejected save, usually. */
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

function itemsToFiles(items: Item[]): UploadedFile[] {
  return items.flatMap((item) => (item.file ? [item.file] : []));
}

export function FileUpload({
  name,
  scope,
  accept = FILE_KINDS,
  maxBytes,
  multiple = false,
  maxFiles,
  defaultValue = [],
  onChange,
  label,
  hint,
  error,
  required = true,
  disabled = false,
  className,
}: FileUploadProps) {
  const inputId = useId();
  const limit = maxFiles ?? (multiple ? 8 : 1);

  const [items, setItems] = useState<Item[]>(() =>
    defaultValue.map((file) => ({
      id: file.publicId,
      name: file.name,
      size: file.bytes,
      kind: file.kind,
      status: "done" as const,
      progress: 100,
      file,
      fresh: false,
    })),
  );
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  /** Live uploads, so removing one mid-flight actually stops it. */
  const requests = useRef(new Map<string, XMLHttpRequest>());

  /** Every state change goes through here, so no path can skip `onChange`. */
  const update = useCallback((change: (previous: Item[]) => Item[]) => {
    setItems(change);
  }, []);

  const files = useMemo(() => itemsToFiles(items), [items]);
  const serialized = useMemo(() => JSON.stringify(files), [files]);

  /**
   * Told once per *value* change, never per progress tick — a parent
   * re-rendering thirty times per file would be this component's fault.
   *
   * In an effect rather than inside the `setItems` updater, which is where it
   * used to be: an updater is called during React's render pass (and twice in
   * development), so notifying the parent from there is a setState in render —
   * React warns, and the parent's state can end up applied twice.
   *
   * `emitted` starts null and is filled without calling out, which is what
   * keeps a `defaultValue` from arriving as a change the parent never made.
   * `latest` holds the callback so that a parent passing an inline arrow — most
   * of them — doesn't re-fire this on every one of its own renders.
   */
  const latest = useRef(onChange);
  const emitted = useRef<string | null>(null);

  useEffect(() => {
    latest.current = onChange;
  });

  useEffect(() => {
    if (emitted.current === serialized) return;

    const first = emitted.current === null;
    emitted.current = serialized;
    if (!first) latest.current?.(files);
  }, [files, serialized]);

  const upload = useCallback(
    async (id: string, file: File) => {
      const patch = (fields: Partial<Item>) =>
        update((previous) =>
          previous.map((item) =>
            item.id === id ? { ...item, ...fields } : item,
          ),
        );

      try {
        const signature = await fetch("/api/uploads/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope,
            accept,
            maxBytes,
            fileName: file.name,
            size: file.size,
          }),
        });

        const signed = (await signature.json()) as {
          ok: boolean;
          message?: string;
          kind?: FileKind;
          uploadUrl?: string;
          fields?: Record<string, string>;
          publicId?: string;
          resourceType?: UploadedFile["resourceType"];
        };

        if (!signature.ok || !signed.ok || !signed.uploadUrl || !signed.fields) {
          patch({
            status: "error",
            error: signed.message ?? "Couldn't start the upload.",
          });
          return;
        }

        const body = new FormData();
        for (const [key, value] of Object.entries(signed.fields)) {
          body.append(key, value);
        }
        // Cloudinary requires `file` last — it streams the form in order.
        body.append("file", file);

        const request = new XMLHttpRequest();
        requests.current.set(id, request);

        request.upload.addEventListener("progress", (event) => {
          if (!event.lengthComputable) return;
          patch({ progress: Math.round((event.loaded / event.total) * 95) });
        });

        request.addEventListener("load", () => {
          requests.current.delete(id);

          let payload: { secure_url?: string; bytes?: number } = {};
          try {
            payload = JSON.parse(request.responseText);
          } catch {
            /* handled by the status check below */
          }

          if (request.status < 200 || request.status >= 300 || !payload.secure_url) {
            patch({
              status: "error",
              error: "Cloudinary rejected the file. Try again.",
            });
            return;
          }

          patch({
            status: "done",
            progress: 100,
            file: {
              // Used exactly as returned — no transformations are applied.
              url: payload.secure_url,
              publicId: signed.publicId!,
              resourceType: signed.resourceType!,
              kind: signed.kind!,
              name: file.name,
              bytes: payload.bytes ?? file.size,
            },
          });
        });

        request.addEventListener("error", () => {
          requests.current.delete(id);
          patch({ status: "error", error: "The upload failed. Check your connection." });
        });

        // An abort is a removal, which has already dropped the row.
        request.addEventListener("abort", () => requests.current.delete(id));

        request.open("POST", signed.uploadUrl);
        request.send(body);
      } catch {
        patch({ status: "error", error: "The upload failed. Try again." });
      }
    },
    [accept, maxBytes, scope, update],
  );

  function add(picked: FileList | File[]) {
    if (disabled) return;

    const chosen = Array.from(picked);
    if (chosen.length === 0) return;

    setNotice(null);

    // Single-file fields replace rather than refuse: picking again plainly
    // means "this one instead", and making someone remove first is a step.
    const keep = multiple ? items : [];
    if (!multiple) {
      for (const item of items) discard(item, { silent: true });
    }

    const room = limit - keep.length;
    if (room <= 0) {
      setNotice(
        `That's the limit of ${limit} file${limit === 1 ? "" : "s"}. Remove one first.`,
      );
      return;
    }

    const taking = chosen.slice(0, room);
    if (taking.length < chosen.length) {
      setNotice(`Only the first ${room} of those fit — the limit is ${limit}.`);
    }

    const rows: Item[] = taking.map((file) => {
      const problem = validateUpload(file, accept, maxBytes);
      return {
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        name: file.name,
        size: file.size,
        kind: kindForFile(file.name),
        status: problem ? "error" : "uploading",
        progress: 0,
        error: problem ?? undefined,
        fresh: true,
      };
    });

    update(() => [...keep, ...rows]);

    rows.forEach((row, index) => {
      if (row.status === "uploading") void upload(row.id, taking[index]);
    });
  }

  /** Stop an upload in flight, and delete anything we already put up there. */
  function discard(item: Item, options: { silent?: boolean } = {}) {
    requests.current.get(item.id)?.abort();
    requests.current.delete(item.id);

    if (item.fresh && item.file) {
      void fetch("/api/uploads/destroy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicId: item.file.publicId,
          resourceType: item.file.resourceType,
        }),
        // Best effort: the field's job is done once the row is gone, and a
        // failed cleanup must not block the person from carrying on.
        keepalive: true,
      }).catch(() => {});
    }

    if (!options.silent) {
      update((previous) => previous.filter((row) => row.id !== item.id));
      setNotice(null);
    }
  }

  const full = items.length >= limit;

  const zone = (
    <div className={cn("space-y-3", className)}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !full) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files.length) add(event.dataTransfer.files);
        }}
        className={cn(
          "rounded-lg border border-dashed bg-surface p-5 text-center transition-colors",
          dragging ? "border-brand-600 bg-brand-50" : "border-border-strong",
          (disabled || full) && "bg-ink-50",
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept={acceptAttribute(accept)}
          multiple={multiple}
          disabled={disabled || full}
          onChange={(event) => {
            if (event.target.files) add(event.target.files);
            // Reset, so picking the same file twice still fires a change.
            event.target.value = "";
          }}
        />

        <UploadCloud
          size={22}
          aria-hidden
          className={cn("mx-auto", dragging ? "text-brand-600" : "text-ink-400")}
        />

        <p className="mt-2 text-sm text-ink-700">
          <button
            type="button"
            disabled={disabled || full}
            onClick={() => inputRef.current?.click()}
            className="font-semibold text-brand-600 underline-offset-2 hover:underline disabled:pointer-events-none disabled:text-ink-400"
          >
            Choose {multiple ? "files" : "a file"}
          </button>{" "}
          <span className="text-ink-500">or drag and drop</span>
        </p>

        <p className="mt-1 text-xs text-ink-500">
          {describeKinds(accept)}
          {" · up to "}
          {formatBytes(
            typeof maxBytes === "number"
              ? Math.min(maxBytes, MAX_UPLOAD_BYTES)
              : Math.max(...accept.map((kind) => FILE_KIND_SPECS[kind].maxBytes)),
          )}
          {multiple ? ` · ${limit} files max` : ""}
        </p>
      </div>

      {notice ? (
        <p className="flex items-start gap-1.5 text-xs font-medium text-warning-700">
          <AlertCircle size={14} className="mt-px shrink-0" aria-hidden />
          {notice}
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => {
            const Icon = item.kind ? FILE_KIND_ICON[item.kind] : Paperclip;

            return (
              <li
                key={item.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border bg-surface p-3",
                  item.status === "error" ? "border-danger-500" : "border-border",
                )}
              >
                <Icon size={18} aria-hidden className="shrink-0 text-ink-400" />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-800">
                    {item.name}
                  </p>

                  {item.status === "error" ? (
                    <p className="mt-0.5 text-xs font-medium text-danger-700">
                      {item.error}
                    </p>
                  ) : item.status === "uploading" ? (
                    <div
                      className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-ink-100"
                      role="progressbar"
                      aria-label={`Uploading ${item.name}`}
                      aria-valuenow={item.progress}
                    >
                      <div
                        className="h-full rounded-full bg-brand-600 transition-[width] duration-200"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  ) : (
                    <p className="mt-0.5 text-xs text-ink-500">
                      {formatBytes(item.size)}
                      {item.file ? (
                        <>
                          {" · "}
                          <a
                            href={item.file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-600 hover:underline"
                          >
                            View
                          </a>
                        </>
                      ) : null}
                    </p>
                  )}
                </div>

                {item.status === "uploading" ? (
                  <Loader2
                    size={16}
                    aria-hidden
                    className="shrink-0 animate-spin text-ink-400"
                  />
                ) : item.status === "done" ? (
                  <CheckCircle2
                    size={16}
                    aria-hidden
                    className="shrink-0 text-success-500"
                  />
                ) : null}

                <button
                  type="button"
                  onClick={() => discard(item)}
                  disabled={disabled}
                  aria-label={`Remove ${item.name}`}
                  className="shrink-0 rounded-md p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-50"
                >
                  <X size={16} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {name ? (
        <input
          type="hidden"
          name={name}
          value={serialized}
        />
      ) : null}
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
        {required ? null : (
          <span className="ml-1.5 text-xs font-normal text-ink-400">
            (optional)
          </span>
        )}
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
