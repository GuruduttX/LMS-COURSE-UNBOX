/**
 * Prove the Cloudinary credentials and the signing scheme actually work.
 *
 *   npm run check:cloudinary
 *
 * The equivalent of `curl localhost:3000/api/health/db` for uploads: it signs
 * one asset of each kind exactly as the route handler would, uploads it, prints
 * the folder it landed in and the delivery URL, then deletes it again. Nothing
 * is left behind, so it is safe to run as often as you like.
 *
 * Run it after changing the folder layout or the signature, and after pasting
 * new keys into .env.local.
 */
import { buildPublicId, destroyAsset, signUpload } from "../src/lib/uploads/cloudinary";
import {
  FILE_KIND_SPECS,
  MAX_UPLOAD_BYTES,
  folderFor,
  formatBytes,
  type FileKind,
} from "../src/lib/uploads/kinds";

/** An empty zip — a .docx is a zip, and `raw` never inspects the bytes. */
const SAMPLE_ZIP = Buffer.from("PK\u0005\u0006" + "\0".repeat(18), "binary");

/** The smallest valid file of each kind — real bytes, so Cloudinary accepts them. */
const SAMPLES: Record<FileKind, { name: string; bytes: Buffer }> = {
  image: {
    // WebP, not PNG: images are signed with `allowed_formats`, so a PNG here
    // would now be rejected by Cloudinary — which is the point of the check.
    name: "lms-upload-check.webp",
    bytes: Buffer.from(
      "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
      "base64",
    ),
  },
  photo: {
    // A 1x1 PNG — the photo kind takes what a phone camera produces, so the
    // sample is deliberately not the WebP above.
    name: "lms-upload-check.png",
    bytes: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ),
  },
  pdf: {
    name: "lms-upload-check.pdf",
    bytes: Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R>>endobj\n" +
        "trailer<</Root 1 0 R>>\n%%EOF\n",
      "utf8",
    ),
  },
  document: {
    name: "lms-upload-check.docx",
    bytes: SAMPLE_ZIP,
  },
};

async function check(kind: FileKind): Promise<boolean> {
  const sample = SAMPLES[kind];
  const folder = folderFor(kind, "curriculum");

  const signed = signUpload({
    folder,
    publicId: buildPublicId(sample.name, kind),
    resourceType: FILE_KIND_SPECS[kind].resourceType,
    kind,
  });

  const body = new FormData();
  for (const [key, value] of Object.entries(signed.fields)) body.append(key, value);
  body.append("file", new Blob([new Uint8Array(sample.bytes)]), sample.name);

  const response = await fetch(signed.uploadUrl, { method: "POST", body });
  const payload = (await response.json()) as {
    secure_url?: string;
    public_id?: string;
    error?: { message?: string };
  };

  if (!response.ok || !payload.secure_url) {
    console.error(
      `  ✗ ${kind.padEnd(8)} upload failed — ${payload.error?.message ?? response.status}`,
    );
    return false;
  }

  console.log(`  ✓ ${kind.padEnd(8)} ${payload.secure_url}`);

  const removed = await destroyAsset(
    payload.public_id ?? signed.publicId,
    signed.resourceType,
  );

  if (!removed.ok) {
    console.error(`  ✗ ${kind.padEnd(8)} left behind — destroy said "${removed.result}"`);
    return false;
  }

  return true;
}

/**
 * Prove `MAX_UPLOAD_BYTES` is still what the account actually allows.
 *
 * Module study material is capped at that number, and the number is not a
 * policy choice — it is the plan's ceiling. If the plan changes under us, this
 * is what says so, rather than a teacher watching a 20 MB upload fail at 100%.
 *
 * Uploads one byte *over* the cap and expects a rejection, so nothing is
 * stored and there is nothing to clean up.
 */
async function checkCeiling(): Promise<boolean> {
  const name = "lms-upload-check.pdf";
  const signed = signUpload({
    folder: folderFor("pdf", "curriculum"),
    publicId: buildPublicId(name, "pdf"),
    resourceType: "raw",
    kind: "pdf",
  });

  const body = new FormData();
  for (const [key, value] of Object.entries(signed.fields)) body.append(key, value);
  body.append("file", new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)]), name);

  const response = await fetch(signed.uploadUrl, { method: "POST", body });
  const payload = (await response.json()) as {
    public_id?: string;
    error?: { message?: string };
  };

  if (response.ok) {
    console.error(
      `  ✗ ceiling  ${formatBytes(MAX_UPLOAD_BYTES)} is too low — the plan took more.`,
    );
    // It landed after all, so take it back down.
    await destroyAsset(payload.public_id ?? signed.publicId, "raw");
    return false;
  }

  const message = payload.error?.message ?? "";
  const stated = /Maximum is (\d+)/.exec(message)?.[1];

  if (stated && Number(stated) !== MAX_UPLOAD_BYTES) {
    console.error(
      `  ✗ ceiling  MAX_UPLOAD_BYTES is ${MAX_UPLOAD_BYTES}, Cloudinary says ${stated}.`,
    );
    return false;
  }

  console.log(`  ✓ ceiling  refused above ${formatBytes(MAX_UPLOAD_BYTES)}, as expected`);
  return true;
}

async function main() {
  console.log("Cloudinary round trip (upload, then delete):\n");

  const results = [];
  for (const kind of Object.keys(SAMPLES) as FileKind[]) {
    results.push(await check(kind));
  }
  results.push(await checkCeiling());

  console.log(
    results.every(Boolean)
      ? "\nEvery kind signed, uploaded and deleted cleanly, and the size cap holds."
      : "\nSomething failed — see above.",
  );

  process.exit(results.every(Boolean) ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
