/**
 * POST /api/uploads/sign — hand the browser a one-shot, folder-locked signature.
 *
 * This is the front door for every upload in the app, so it re-checks
 * everything the component already checked: who is asking, whether their role
 * may write into that scope, and whether the file is a kind we accept at a size
 * we allow. A signature is a capability — issue one loosely and it is a way to
 * write anything anywhere in the Cloudinary account.
 *
 * It returns JSON for every outcome, never a redirect: this is called by
 * `fetch`, and a 307 to /login would arrive as an opaque parse error rather
 * than "you are signed out".
 *
 * What it cannot check: the bytes. The browser uploads straight to Cloudinary,
 * so the file that arrives is the one the browser chose to send — the declared
 * size and name are a claim. The signed public id pins the folder and the
 * extension, and only signed-in staff (or a student, in `submissions`) can get
 * a signature at all, which is the boundary that actually holds.
 */
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/guards";
import { buildPublicId, signUpload } from "@/lib/uploads/cloudinary";
import {
  FILE_KINDS,
  FILE_KIND_SPECS,
  canUploadTo,
  folderFor,
  isUploadScope,
  kindForFile,
  validateUpload,
  type FileKind,
} from "@/lib/uploads/kinds";

function refuse(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return refuse("Your session has expired. Sign in again.", 401);
  if (user.mustChangePassword) {
    return refuse("Change your password before uploading.", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse("Expected a JSON body.", 400);
  }

  const raw = (body ?? {}) as Record<string, unknown>;

  const scope = raw.scope;
  if (!isUploadScope(scope)) return refuse("Unknown upload scope.", 422);
  if (!canUploadTo(user.role, scope)) {
    return refuse("You can't upload files here.", 403);
  }

  const fileName = typeof raw.fileName === "string" ? raw.fileName : "";
  const size = typeof raw.size === "number" ? raw.size : NaN;
  if (!fileName || !Number.isFinite(size)) {
    return refuse("Expected a fileName and a size.", 422);
  }

  // The field may narrow what it takes (a PDF-only reading, say). An absent or
  // unrecognised list means every kind, never an empty one — an empty allowlist
  // would refuse everything with a confusing message.
  const requested = Array.isArray(raw.accept)
    ? (raw.accept.filter(
        (value): value is FileKind =>
          typeof value === "string" &&
          (FILE_KINDS as readonly string[]).includes(value),
      ) as FileKind[])
    : [];
  const allowed = requested.length > 0 ? requested : [...FILE_KINDS];

  // A field may raise its own cap (module study material takes 20 MB where an
  // assignment brief takes 10). Taken from the body but never trusted:
  // `validateUpload` clamps it to MAX_UPLOAD_BYTES, so the worst a forged post
  // can ask for is what Cloudinary would accept anyway.
  const maxBytes = typeof raw.maxBytes === "number" ? raw.maxBytes : undefined;

  const problem = validateUpload({ name: fileName, size }, allowed, maxBytes);
  if (problem) return refuse(problem, 422);

  // validateUpload has already established this is one of the allowed kinds.
  const kind = kindForFile(fileName) as FileKind;

  try {
    const signed = signUpload({
      folder: folderFor(kind, scope),
      publicId: buildPublicId(fileName, kind),
      // From the spec, not a comparison against one kind: `photo` is an image
      // resource too, and a hardcoded check would sign it as `raw`.
      resourceType: FILE_KIND_SPECS[kind].resourceType,
      kind,
    });

    return NextResponse.json({ ok: true, kind, ...signed });
  } catch (error) {
    // A missing CLOUDINARY_* var throws here. The message names the variable,
    // so it goes to the console and not to the browser.
    console.error("[api/uploads/sign] could not sign upload:", error);
    return refuse("Uploads aren't configured. Try again later.", 503);
  }
}
