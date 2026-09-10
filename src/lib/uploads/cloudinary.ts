import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { env } from "@/lib/env";

import {
  FILE_KIND_SPECS,
  extensionOf,
  type FileKind,
  type ResourceType,
} from "./kinds";

/**
 * Cloudinary, by hand.
 *
 * No SDK: a signed upload is a SHA-1 of the sorted parameters plus the API
 * secret, and a destroy is one form POST. That is two small functions against a
 * documented HTTP API, versus a dependency — the same trade this codebase made
 * for auth.
 *
 * **The browser uploads straight to Cloudinary.** We only sign. Routing a 10 MB
 * PDF through a Next route handler would spend our bandwidth and run into the
 * body-size limit for nothing, and the browser gets real upload progress this
 * way. What the server keeps control of is the part that matters: the folder,
 * the public id and its extension are all signed, so a caller cannot choose
 * where their file lands or what it is called.
 *
 * **No transformations, anywhere.** Nothing here sends `eager`, `transformation`
 * or a format, and delivery URLs are used exactly as Cloudinary returns them —
 * assets are stored and served as uploaded.
 */

const API_BASE = "https://api.cloudinary.com/v1_1";

/**
 * Cloudinary's scheme: every parameter except `file`, `api_key` and
 * `resource_type`, sorted by name, joined `k=v&k=v`, secret appended, SHA-1.
 */
function sign(params: Record<string, string | number>): string {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return createHash("sha1")
    .update(payload + env.CLOUDINARY_API_SECRET)
    .digest("hex");
}

/**
 * A safe, unique name for the asset.
 *
 * The person's filename is kept as a readable prefix — a Cloudinary folder full
 * of `k3f9a2` tells nobody anything — but slugged, truncated, and suffixed with
 * a timestamp and random bytes so two people uploading `notes.pdf` a second
 * apart cannot overwrite each other. Uniqueness is ours rather than
 * Cloudinary's `unique_filename`, because we sign the public id and a signed
 * value it might change is a value we cannot predict.
 *
 * Raw assets carry their extension **in** the public id (that is how a raw URL
 * ends in `.pdf`); image assets do not, because Cloudinary appends the format
 * it detects.
 */
export function buildPublicId(fileName: string, kind: FileKind): string {
  const spec = FILE_KIND_SPECS[kind];

  const base =
    fileName
      .slice(0, fileName.lastIndexOf(".") > 0 ? fileName.lastIndexOf(".") : undefined)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "file";

  const unique = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const id = `${base}-${unique}`;

  if (spec.resourceType !== "raw") return id;

  // Trust the allowlist, not the name: an unrecognised extension can't reach
  // here (validateUpload rejects it first), and the first listed one is the
  // canonical spelling for the kind.
  const extension = spec.extensions.includes(extensionOf(fileName))
    ? extensionOf(fileName)
    : spec.extensions[0];

  return `${id}.${extension}`;
}

export type SignedUpload = {
  /** Where the browser POSTs the file. */
  uploadUrl: string;
  /** Every field to send alongside `file`, already signed. */
  fields: Record<string, string>;
  /** What the asset will be called once it is there. */
  publicId: string;
  resourceType: ResourceType;
};

/**
 * Sign one upload into one folder. Every signed parameter is decided here from
 * server-side values; nothing the browser sent is passed through untouched.
 */
export function signUpload(options: {
  folder: string;
  publicId: string;
  resourceType: ResourceType;
  /** Which kind's format allowlist to pin. See `allowed_formats` below. */
  kind: FileKind;
}): SignedUpload {
  const { folder, publicId, resourceType, kind } = options;

  const timestamp = Math.floor(Date.now() / 1000);

  /**
   * `overwrite: false` and `unique_filename: false` together mean: this exact
   * public id, and if something is already there the upload fails rather than
   * replacing it. Since the id carries random bytes, a collision is a bug worth
   * hearing about, not something to paper over.
   */
  const signed: Record<string, string | number> = {
    folder,
    overwrite: "false",
    public_id: publicId,
    timestamp,
    unique_filename: "false",
    use_filename: "false",
  };

  /**
   * The one check our server cannot make itself.
   *
   * The browser uploads straight to Cloudinary, so the name and size we
   * validated when signing are a claim — the bytes that actually arrive could
   * be a 40 MB PNG named `x.webp`. Signing `allowed_formats` hands the check to
   * Cloudinary, which sniffs the real format and rejects the upload with a 400
   * rather than storing it. Images only: `raw` uploads are not inspected, so
   * the parameter would refuse every PDF.
   *
   * Note this bounds the *format*, not the size — Cloudinary's own plan limit
   * is the only ceiling on bytes, so an oversized WebP still lands and is
   * caught by `validateUpload` on the way in. Nothing here converts anything:
   * `allowed_formats` without `format` is a filter, never a transformation.
   */
  if (resourceType === "image") {
    // The *kind's* list, not `image`'s: a profile photo is signed as a photo,
    // and pinning the wrong allowlist would have Cloudinary reject every JPEG.
    signed.allowed_formats = FILE_KIND_SPECS[kind].extensions.join(",");
  }

  return {
    uploadUrl: `${API_BASE}/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    fields: {
      ...Object.fromEntries(
        Object.entries(signed).map(([key, value]) => [key, String(value)]),
      ),
      api_key: env.CLOUDINARY_API_KEY,
      signature: sign(signed),
    },
    publicId: `${folder}/${publicId}`,
    resourceType,
  };
}

/**
 * Delete an asset. Used when someone removes a file they just attached, so an
 * abandoned upload does not sit in the account forever.
 *
 * Cloudinary answers `{ result: "not found" }` with a 200 for an id that is
 * already gone; that counts as success here, because the caller's intent —
 * "this should not exist" — is satisfied either way.
 *
 * `invalidate` purges the CDN as well as the store. Without it the asset is
 * deleted but its URL keeps serving from cache for hours, which is the wrong
 * answer for a file someone has just taken down. The purge itself is
 * asynchronous at Cloudinary's end, so the URL can still answer 200 for a few
 * minutes after this returns.
 */
export async function destroyAsset(
  publicId: string,
  resourceType: ResourceType,
): Promise<{ ok: boolean; result: string }> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = { invalidate: "true", public_id: publicId, timestamp };

  const body = new URLSearchParams({
    invalidate: "true",
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: env.CLOUDINARY_API_KEY,
    signature: sign(signed),
  });

  const response = await fetch(
    `${API_BASE}/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`,
    { method: "POST", body },
  );

  const payload = (await response.json().catch(() => ({}))) as {
    result?: string;
  };
  const result = payload.result ?? "unknown";

  return { ok: result === "ok" || result === "not found", result };
}
