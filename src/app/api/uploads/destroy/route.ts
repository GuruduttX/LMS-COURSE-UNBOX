/**
 * POST /api/uploads/destroy — remove an asset from Cloudinary.
 *
 * What it is for: someone attaches the wrong file and takes it off again before
 * saving the form. Without this, every mistaken pick leaves a permanent orphan
 * in the account.
 *
 * The scope is read back out of the public id and checked against the same role
 * list the upload was, and the id must sit under our root — otherwise a signed-in
 * student could post any id in the account and have it deleted. It does *not*
 * check whether this particular person uploaded this particular file: the
 * records that would answer that (a subtopic's PDF, a submission) do not exist
 * yet. Tighten it to an ownership check when they do.
 */
import { NextResponse } from "next/server";

import { writeAudit } from "@/lib/auth/audit";
import { getCurrentUser } from "@/lib/auth/guards";
import { destroyAsset } from "@/lib/uploads/cloudinary";
import {
  UPLOAD_ROOT,
  canUploadTo,
  scopeFromPublicId,
  type ResourceType,
} from "@/lib/uploads/kinds";

function refuse(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return refuse("Your session has expired. Sign in again.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse("Expected a JSON body.", 400);
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const publicId = typeof raw.publicId === "string" ? raw.publicId : "";
  const resourceType = raw.resourceType;

  if (resourceType !== "image" && resourceType !== "raw") {
    return refuse("Unknown resource type.", 422);
  }

  // `..` in a public id would climb out of our root once Cloudinary resolves it.
  if (!publicId.startsWith(`${UPLOAD_ROOT}/`) || publicId.includes("..")) {
    return refuse("That file isn't ours to delete.", 422);
  }

  const scope = scopeFromPublicId(publicId);
  if (!scope) return refuse("That file isn't ours to delete.", 422);
  if (!canUploadTo(user.role, scope)) {
    return refuse("You can't delete files here.", 403);
  }

  try {
    const outcome = await destroyAsset(publicId, resourceType as ResourceType);
    if (!outcome.ok) {
      console.error("[api/uploads/destroy] Cloudinary said:", outcome.result);
      return refuse("Couldn't delete that file. Try again.", 502);
    }

    await writeAudit(user, {
      action: "asset.delete",
      targetType: "Asset",
      targetId: publicId,
      summary: `Deleted an uploaded ${resourceType === "image" ? "image" : "file"} from ${scope}`,
      meta: { publicId, resourceType, scope },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/uploads/destroy] failed:", error);
    return refuse("Couldn't delete that file. Try again.", 503);
  }
}
