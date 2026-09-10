/**
 * What may be uploaded, where it lands, and who may put it there.
 *
 * Imported by **both** the browser component and the route handlers that sign
 * and destroy — same pattern as `lib/validation/enquiry.ts`, so the rules
 * cannot drift between the two sides. Pure and dependency-free: no `server-only`
 * here, and nothing in this file may import Mongoose or `lib/env.ts`.
 *
 * Deliberately no archives. Zips are not uploaded to Cloudinary (an assignment
 * hand-in that is a zip will need its own store); adding `.zip` here would be
 * the whole of enabling it, which is why it is called out rather than merely
 * absent.
 */
import type { Role } from "@/lib/auth/roles";

/** The root every asset lives under, so the account is never a flat dump. */
export const UPLOAD_ROOT = "LMS";

export const FILE_KINDS = ["image", "photo", "pdf", "document"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

/**
 * Cloudinary's `resource_type`. Images go in as `image`; PDFs, Word files and
 * decks go in as `raw` — they are documents to be downloaded, not media to be
 * transformed, and `raw` delivers the exact bytes that were uploaded under the
 * exact filename. (`image` would also work for PDFs, but only on accounts where
 * PDF delivery is enabled, and it invites transformations we do not want.)
 */
export type ResourceType = "image" | "raw";

type KindSpec = {
  /** Shown in the picker and in error messages. */
  label: string;
  /** Folder under UPLOAD_ROOT. One folder per type of file, by request. */
  folder: string;
  resourceType: ResourceType;
  /** Lower-case, no dot. The first one is what a signed public_id gets. */
  extensions: string[];
  /**
   * Browser-reported MIME types, used for the `accept` attribute. A browser can
   * report an empty or wrong type, so the extension is the check that decides.
   */
  mimeTypes: string[];
  /**
   * The default ceiling for the kind. A field may raise it up to
   * `MAX_UPLOAD_BYTES` — see the third argument to `validateUpload`.
   *
   * Nothing may exceed what Cloudinary itself accepts, or a clear message in
   * our UI turns into a 400 from theirs. The account's measured ceiling is
   * 20,971,520 bytes (20 MiB) for a raw upload; see `MAX_UPLOAD_BYTES`.
   */
  maxBytes: number;
};

/**
 * The hard ceiling on any upload, whatever a field asks for.
 *
 * Not a policy number: it is exactly what the Cloudinary account accepts for a
 * raw upload — verified by uploading past it, which answers
 * `"File size too large. Got 22020096. Maximum is 20971520."` Raising this
 * without raising the plan would only move the rejection from our message to
 * theirs, after the user has waited for the whole upload.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const FILE_KIND_SPECS: Record<FileKind, KindSpec> = {
  /**
   * WebP only, and 2 MB.
   *
   * Narrow by policy, not by capability: since nothing here is ever
   * transformed (see `lib/uploads/cloudinary.ts`), the bytes uploaded are the
   * bytes served, so the *source* has to be the delivery format already. A JPEG
   * or PNG would be shipped to every student exactly as it arrived — which is
   * why the picker refuses them instead of converting them on the way in.
   */
  image: {
    label: "WebP image",
    folder: "images",
    resourceType: "image",
    extensions: ["webp"],
    mimeTypes: ["image/webp"],
    maxBytes: 2 * 1024 * 1024,
  },
  /**
   * A photograph somebody took — a profile picture, in practice.
   *
   * Separate from `image` because the WebP-only rule above is aimed at course
   * artwork, which staff prepare deliberately; a student photographing
   * themselves gets whatever their phone produces, and refusing that would
   * make the field unusable. JPEG and PNG are delivery formats in their own
   * right, so the no-transformation rule still holds.
   *
   * WebP is *not* listed here on purpose: `kindForFile` resolves by extension
   * and the first match wins, so a `.webp` stays an `image`. Fields that take a
   * photo accept both kinds.
   */
  photo: {
    label: "Photo",
    folder: "photos",
    resourceType: "image",
    extensions: ["jpg", "jpeg", "png"],
    mimeTypes: ["image/jpeg", "image/png"],
    maxBytes: 2 * 1024 * 1024,
  },
  pdf: {
    label: "PDF",
    folder: "pdfs",
    resourceType: "raw",
    extensions: ["pdf"],
    mimeTypes: ["application/pdf"],
    maxBytes: 10 * 1024 * 1024,
  },
  document: {
    label: "Word document",
    folder: "documents",
    resourceType: "raw",
    extensions: ["docx", "doc"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ],
    maxBytes: 10 * 1024 * 1024,
  },
};

/**
 * Which part of the app an upload belongs to, and who may upload there.
 *
 * The scope becomes a sub-folder, so `LMS/pdfs/curriculum` and
 * `LMS/pdfs/submissions` never mix. It is an allowlist rather than a free
 * string because the folder comes from the browser: without this, anyone with a
 * session could write anywhere in the account's tree.
 */
export const UPLOAD_SCOPES = {
  /** Course material: reading PDFs, module handouts, lesson images. */
  curriculum: ["admin", "teacher"],
  /** Program artwork — banners, thumbnails, brochures. */
  programs: ["admin", "program_manager"],
  /** Anything attached to a live session (slides, notes). */
  sessions: ["admin", "program_manager", "teacher"],
  /** Documents on a person's record. Admin only, like the rest of people. */
  people: ["admin"],
  /** A student handing work in. Staff too, so they can attach a correction. */
  submissions: ["admin", "teacher", "student"],
  /**
   * The document handed out with a task. Its own scope rather than reusing
   * `curriculum`, because a task is not part of the tree and the folder is what
   * makes that visible in the account — and because the role list is free to
   * diverge later without moving files.
   */
  tasks: ["admin", "teacher"],
  /**
   * Your own profile picture. Every role, because everybody has one — and the
   * only record it can be written onto is the uploader's own (see
   * `account/profile/actions.ts`), so a wide role list costs nothing here.
   */
  profile: ["admin", "program_manager", "teacher", "student"],
} satisfies Record<string, Role[]>;

export type UploadScope = keyof typeof UPLOAD_SCOPES;

export function isUploadScope(value: unknown): value is UploadScope {
  return typeof value === "string" && value in UPLOAD_SCOPES;
}

/**
 * Admin is admitted everywhere, exactly as `requireRole` and the proxy do it —
 * the superset rule, in the one place uploads consult.
 */
export function canUploadTo(role: Role, scope: UploadScope): boolean {
  if (role === "admin") return true;
  return (UPLOAD_SCOPES[scope] as readonly Role[]).includes(role);
}

/**
 * What an avatar field accepts. Both image kinds: a phone gives you a JPEG or
 * PNG (`photo`), and a `.webp` resolves to `image` because that kind lists the
 * extension first — see the note on `photo` above.
 *
 * Here rather than beside the profile action, because a `"use server"` file may
 * only export async functions.
 */
export const AVATAR_KINDS = ["photo", "image"] as const satisfies FileKind[];

/**
 * What a module's study material accepts: a handout or a Word document.
 *
 * **PowerPoint is deliberately not here.** Study material is rendered in our own
 * UI (`MaterialViewer`) rather than handed to an embedded third-party viewer,
 * and there is no mature browser renderer for `.pptx` — the candidates are two
 * orders of magnitude smaller than pdf.js and approximate on real decks. Rather
 * than ship a preview that sometimes lies about a document, the picker refuses
 * the format and a teacher exports the deck as a PDF. Enabling it later would
 * mean a `slides` kind here and a renderer to match, in that order.
 *
 * Paired with `MATERIAL_MAX_BYTES` rather than the kinds' own caps: study
 * material is the one place that gets the full 20 MB, while a `pdf` attached to
 * an assignment brief or a submission stays at 10 MB. Passing the cap per field
 * is what keeps those two facts independent — bumping `FILE_KIND_SPECS.pdf`
 * would have raised it everywhere.
 */
export const MATERIAL_KINDS = ["pdf", "document"] as const satisfies FileKind[];

export const MATERIAL_MAX_BYTES = MAX_UPLOAD_BYTES;

/** `LMS/pdfs/curriculum` — type first, then the part of the app. */
export function folderFor(kind: FileKind, scope: UploadScope): string {
  return `${UPLOAD_ROOT}/${FILE_KIND_SPECS[kind].folder}/${scope}`;
}

/** `report.final.PDF` → `pdf`. Empty when the name carries no extension. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

/** The kind this file belongs to, decided by extension, or null. */
export function kindForFile(fileName: string): FileKind | null {
  const extension = extensionOf(fileName);
  if (!extension) return null;

  return (
    FILE_KINDS.find((kind) =>
      FILE_KIND_SPECS[kind].extensions.includes(extension),
    ) ?? null
  );
}

/** What goes in `<input accept>` for the kinds a field allows. */
export function acceptAttribute(kinds: readonly FileKind[]): string {
  return kinds
    .flatMap((kind) => [
      ...FILE_KIND_SPECS[kind].extensions.map((extension) => `.${extension}`),
      ...FILE_KIND_SPECS[kind].mimeTypes,
    ])
    .join(",");
}

/** "PDF or image" — for the empty state and the error messages. */
export function describeKinds(kinds: readonly FileKind[]): string {
  const labels = kinds.map((kind) => FILE_KIND_SPECS[kind].label);
  if (labels.length <= 1) return labels[0] ?? "file";
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type FileFacts = { name: string; size: number };

/**
 * The one validator, run in the browser for fast feedback and again in the
 * route handler because client validation is a convenience, never a guarantee.
 * Returns the message to show, or null when the file is fine.
 *
 * `fieldMaxBytes` lets one field raise (or lower) the kind's default cap —
 * module study material takes a 20 MB PDF where an assignment brief does not.
 * It is clamped to `MAX_UPLOAD_BYTES` because the sign route takes it from the
 * request body: without the clamp, a forged post would choose its own ceiling.
 */
export function validateUpload(
  file: FileFacts,
  allowed: readonly FileKind[],
  fieldMaxBytes?: number,
): string | null {
  const kind = kindForFile(file.name);

  if (!kind || !allowed.includes(kind)) {
    return `That file type isn't accepted here. Add a ${describeKinds(allowed)}.`;
  }

  if (file.size <= 0) {
    return "That file is empty.";
  }

  const spec = FILE_KIND_SPECS[kind];
  const maxBytes =
    typeof fieldMaxBytes === "number" && Number.isFinite(fieldMaxBytes)
      ? Math.min(Math.max(fieldMaxBytes, 0), MAX_UPLOAD_BYTES)
      : spec.maxBytes;

  if (file.size > maxBytes) {
    return `${spec.label}s must be under ${formatBytes(maxBytes)} — this one is ${formatBytes(file.size)}.`;
  }

  return null;
}

/**
 * What an upload leaves behind: what a form posts, and what a model would
 * store. `publicId` is the handle Cloudinary deletes by, so keep it alongside
 * the URL — a record with only a URL is a file that can never be cleaned up.
 */
export type UploadedFile = {
  url: string;
  publicId: string;
  resourceType: ResourceType;
  kind: FileKind;
  /** The name the person chose, kept for display and for the download name. */
  name: string;
  bytes: number;
};

/** Every delivery URL Cloudinary hands back starts with this. */
const DELIVERY_PREFIX = "https://res.cloudinary.com/";

/**
 * Turn what `FileUpload` posted back into files a write can trust.
 *
 * The field posts JSON from the browser, so a forged post could name any URL on
 * the internet and have it stored as though we had hosted it. Everything is
 * therefore re-checked: the shape, the kind against what the field accepts, the
 * public id against our own root, and the URL against Cloudinary's delivery
 * host. Anything that fails takes the whole payload with it — a partially
 * trusted list is worse than none.
 *
 * Pure, so the same function runs in a server action and (were it ever useful)
 * in the browser.
 */
export function parseUploadedFiles(
  raw: string,
  allowed: readonly FileKind[],
): { files: UploadedFile[]; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { files: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { files: [], error: "That upload didn't come through. Try again." };
  }

  if (!Array.isArray(parsed)) {
    return { files: [], error: "That upload didn't come through. Try again." };
  }

  const files: UploadedFile[] = [];

  for (const entry of parsed) {
    const item = (entry ?? {}) as Record<string, unknown>;

    const url = typeof item.url === "string" ? item.url : "";
    const publicId = typeof item.publicId === "string" ? item.publicId : "";
    const name = typeof item.name === "string" ? item.name : "";
    const bytes = typeof item.bytes === "number" ? item.bytes : NaN;
    const kind = item.kind;
    const resourceType = item.resourceType;

    const wellFormed =
      url.startsWith(DELIVERY_PREFIX) &&
      publicId.startsWith(`${UPLOAD_ROOT}/`) &&
      !publicId.includes("..") &&
      scopeFromPublicId(publicId) !== null &&
      (resourceType === "image" || resourceType === "raw") &&
      typeof kind === "string" &&
      (allowed as readonly string[]).includes(kind) &&
      name.length > 0 &&
      name.length <= 260 &&
      Number.isFinite(bytes) &&
      bytes >= 0;

    if (!wellFormed) {
      return { files: [], error: "That file isn't one we uploaded. Attach it again." };
    }

    files.push({
      url,
      publicId,
      resourceType,
      kind: kind as FileKind,
      name,
      bytes,
    });
  }

  return { files };
}

/**
 * Read the scope back out of `LMS/pdfs/curriculum/1712-abc.pdf`, so a delete
 * can be checked against the same role list the upload was.
 */
export function scopeFromPublicId(publicId: string): UploadScope | null {
  const parts = publicId.split("/");
  if (parts.length < 4 || parts[0] !== UPLOAD_ROOT) return null;
  return isUploadScope(parts[2]) ? parts[2] : null;
}
