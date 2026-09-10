/**
 * Prove the Bunny Stream credentials and both hashes actually work.
 *
 *   npm run check:bunny
 *
 * The video counterpart of `check:cloudinary`: it creates a video, signs a TUS
 * credential exactly as `/api/video/sign` would, pushes a few real bytes
 * through the TUS handshake, reads the video back, prints the embed URL that a
 * student would get, and then deletes the video again. Nothing is left behind,
 * so it is safe to run as often as you like — and because it deletes, it never
 * leaves anything encoding or being billed for.
 *
 * Run it after pasting new keys into .env.local, after switching the token key
 * on, and any time playback starts 403ing and you want to know which half is
 * wrong.
 */
import {
  configuredLibraryId,
  createVideo,
  deleteVideo,
  embedUrl,
  getVideo,
  isConfigured,
  signTusUpload,
} from "../src/lib/video/bunny";

/** A tiny but structurally valid MP4 — enough for TUS, not for the encoder. */
const SAMPLE = Buffer.from(
  "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAhtZGF0",
  "base64",
);

async function main() {
  if (!isConfigured()) {
    console.error(
      "Bunny Stream isn't configured. Set BUNNY_STREAM_LIBRARY_ID and\n" +
        "BUNNY_STREAM_API_KEY in .env.local — see .env.example for where they live.",
    );
    process.exit(1);
  }

  console.log(`Bunny Stream round trip, library ${configuredLibraryId()}:\n`);

  let videoId: string;
  try {
    videoId = await createVideo("lms-bunny-check (delete me)");
    console.log(`  ✓ created   ${videoId}`);
  } catch (error) {
    console.error(`  ✗ create    ${(error as Error).message}`);
    console.error(
      "\nA 401 here means the API key is wrong, or belongs to a different library.",
    );
    process.exit(1);
  }

  let uploaded = false;
  try {
    const credentials = signTusUpload(videoId);

    // The TUS creation handshake. If the signature is wrong this is where it
    // shows up — a 401 rather than a mysterious stalled upload in the browser.
    const created = await fetch(credentials.endpoint, {
      method: "POST",
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(SAMPLE.byteLength),
        "Upload-Metadata": `filetype ${btoa("video/mp4")},title ${btoa("lms-bunny-check")}`,
        AuthorizationSignature: credentials.signature,
        AuthorizationExpire: String(credentials.expires),
        LibraryId: credentials.libraryId,
        VideoId: credentials.videoId,
      },
    });

    if (!created.ok) {
      throw new Error(`${created.status} ${(await created.text()).slice(0, 120)}`);
    }

    // Bunny answers with a *relative* Location (`/tusupload/<id>`), which
    // `fetch` cannot parse on its own. tus-js-client resolves it against the
    // endpoint; so do we, or this reads as a failure when it is a success.
    const location = created.headers.get("location");
    if (!location) throw new Error("TUS accepted the upload but named no location.");
    const target = new URL(location, credentials.endpoint).toString();

    // Every TUS request carries the credential, not just the creating POST —
    // Bunny answers a bare PATCH with "Library ID missing or invalid". This is
    // what tus-js-client does with its `headers` option, and why the browser
    // upload works.
    const patched = await fetch(target, {
      method: "PATCH",
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": "0",
        "Content-Type": "application/offset+octet-stream",
        AuthorizationSignature: credentials.signature,
        AuthorizationExpire: String(credentials.expires),
        LibraryId: credentials.libraryId,
        VideoId: credentials.videoId,
      },
      body: new Uint8Array(SAMPLE),
    });

    if (!patched.ok) {
      throw new Error(`${patched.status} ${(await patched.text()).slice(0, 120)}`);
    }

    uploaded = true;
    console.log("  ✓ signed    TUS accepted the credential and the bytes");
  } catch (error) {
    const message = (error as Error).message;
    console.error(`  ✗ signed    ${message}`);

    // Only offer the 401 explanation when it is actually a 401 — a hint that
    // sends you after the wrong thing is worse than no hint.
    if (message.includes("401")) {
      console.error(
        "\nA 401 means the signature is wrong — check that the API key in\n" +
          ".env.local is the library's own key and has no stray whitespace.",
      );
    }
  }

  try {
    const facts = await getVideo(videoId);
    console.log(
      `  ✓ read back status "${facts?.status}", ${facts?.seconds ?? 0}s` +
        " (a 48-byte sample never encodes — that is expected)",
    );
  } catch (error) {
    console.error(`  ✗ read back ${(error as Error).message}`);
  }

  const url = embedUrl({ videoId, libraryId: configuredLibraryId()! });
  const signed = url.includes("token=");
  console.log(`  ${signed ? "✓" : "·"} embed     ${url}`);
  if (!signed) {
    console.log(
      "              (unsigned — set BUNNY_STREAM_TOKEN_KEY and turn on Embed\n" +
        "               View Token Authentication in the library's Security tab)",
    );
  }

  const removed = await deleteVideo(videoId);
  if (!removed.ok) {
    console.error(`  ✗ cleanup   left ${videoId} behind — ${removed.detail}`);
    console.error("\nDelete it by hand in the Bunny dashboard.");
    process.exit(1);
  }
  console.log("  ✓ deleted   nothing left in the library");

  console.log(
    uploaded
      ? "\nBunny Stream is wired up correctly."
      : "\nThe key works but the upload signature does not — see above.",
  );
  process.exit(uploaded ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
