/**
 * Server-only environment access.
 *
 * Read env vars through these helpers instead of touching `process.env` in
 * feature code: the failure is then one clear message at the call site rather
 * than a confusing `undefined` deep inside a driver.
 */
import "server-only";

function required(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }

  if (value.includes("<") && value.includes(">")) {
    throw new Error(
      `Environment variable ${name} still contains the placeholder from .env.example. Put your real MongoDB Atlas values in .env.local.`,
    );
  }

  return value;
}

/**
 * A value that is set and isn't still the `.env.example` placeholder, or null.
 *
 * Unlike `required`, an absent value is an answer rather than an error — the
 * Google Calendar integration is optional and falls back to a mock link when it
 * isn't configured. Placeholders are treated as absent so a half-filled
 * `.env.local` behaves like an empty one instead of failing a live API call.
 */
function optional(name: string): string | null {
  const value = process.env[name];

  if (!value || value.trim() === "") return null;

  const trimmed = value.trim();
  if (trimmed.includes("<") && trimmed.includes(">")) return null;
  if (trimmed.startsWith("your-")) return null;

  return trimmed;
}

export const env = {
  get MONGODB_URI(): string {
    return required("MONGODB_URI");
  },
  get MONGODB_DB(): string {
    return required("MONGODB_DB");
  },
  /**
   * Cloudinary. The cloud name is public (it appears in every delivery URL);
   * the key and secret are not, and none of the three is prefixed
   * NEXT_PUBLIC_ — signatures are minted on the server, so the browser never
   * needs them. See lib/uploads/cloudinary.ts.
   */
  get CLOUDINARY_CLOUD_NAME(): string {
    return required("CLOUDINARY_CLOUD_NAME");
  },
  get CLOUDINARY_API_KEY(): string {
    return required("CLOUDINARY_API_KEY");
  },
  get CLOUDINARY_API_SECRET(): string {
    return required("CLOUDINARY_API_SECRET");
  },
  /** Signing key for the session cookie. Rotating it logs everybody out. */
  get AUTH_SECRET(): string {
    const value = required("AUTH_SECRET");

    if (value.length < 32) {
      throw new Error(
        "AUTH_SECRET is too short. Generate one with: openssl rand -base64 32",
      );
    }

    return value;
  },

  /**
   * Google Workspace service account, for minting Meet links.
   *
   * All three or none: a partially-filled set is treated as unconfigured, and
   * `lib/googleCalendar.ts` falls back to a mock link. That is what lets the
   * whole scheduling flow be built and tested before the Cloud project exists.
   *
   * The private key arrives from `.env.local` as a single line with literal
   * `\n` two-character sequences — dotenv does not interpret escapes inside
   * quotes — so it is unescaped here, once, rather than at every call site.
   */
  get GOOGLE_CLIENT_EMAIL(): string | null {
    return optional("GOOGLE_CLIENT_EMAIL");
  },
  get GOOGLE_PRIVATE_KEY(): string | null {
    const value = optional("GOOGLE_PRIVATE_KEY");
    return value ? value.replace(/\\n/g, "\n") : null;
  },
  /** The Workspace user impersonated via domain-wide delegation (`subject`). */
  get GOOGLE_ADMIN_EMAIL(): string | null {
    return optional("GOOGLE_ADMIN_EMAIL");
  },

  /**
   * Bunny Stream, for lesson videos.
   *
   * Optional as a set, like Google Calendar above: with the library id and API
   * key absent, `lib/video/bunny.ts` reports itself unconfigured, the uploader
   * is hidden and a video subtopic falls back to a pasted link. That is what
   * lets the whole authoring flow be built and reviewed before the keys exist.
   *
   * The library id is not secret — it is in every embed URL — but it is read
   * here rather than exposed as NEXT_PUBLIC_, because the browser gets it back
   * inside the signed upload credential and has no other use for it.
   */
  get BUNNY_STREAM_LIBRARY_ID(): string | null {
    return optional("BUNNY_STREAM_LIBRARY_ID");
  },
  /** Per-library Stream API key. Creates, describes and deletes videos. */
  get BUNNY_STREAM_API_KEY(): string | null {
    return optional("BUNNY_STREAM_API_KEY");
  },
  /**
   * The library's pull zone, `vz-xxxxxxxx-xxx.b-cdn.net`. Only used for
   * thumbnails; playback goes through the embed player, not the CDN directly.
   */
  get BUNNY_STREAM_CDN_HOSTNAME(): string | null {
    return optional("BUNNY_STREAM_CDN_HOSTNAME");
  },
  /**
   * Override for the embed-view token key. **Normally leave this empty**: the
   * token key *is* the library API key (Bunny's mobile-SDK guide says so, and
   * the library object carries no other key), so `embedUrl` falls back to
   * `BUNNY_STREAM_API_KEY` and signs correctly with nothing set here. It
   * exists for the day Bunny separates the two.
   */
  get BUNNY_STREAM_TOKEN_KEY(): string | null {
    return optional("BUNNY_STREAM_TOKEN_KEY");
  },
  /**
   * The library's **Read-Only** API key, which is what Bunny signs webhook
   * bodies with. Absent, `/api/webhooks/bunny` refuses every call rather than
   * trusting an unverifiable one.
   */
  get BUNNY_WEBHOOK_SECRET(): string | null {
    return optional("BUNNY_WEBHOOK_SECRET");
  },

  /**
   * Razorpay, for course fees.
   *
   * Optional as a set, like Google Calendar and Bunny above — and for the same
   * reason, which matters more here than anywhere else: a payment gateway is
   * the one integration you cannot get keys for until a business is registered
   * and KYC has cleared. With the key and secret absent, `lib/payments/razorpay.ts`
   * runs in **mock mode outside production**: orders are minted locally, a
   * clearly-labelled "simulate payment" control stands in for Checkout, and the
   * whole student flow — notice, gate, pay, unlock — can be built and reviewed
   * before an account exists. In production, absent keys mean payments are
   * simply off and the button says so; there is no path where a mock payment
   * grants real access to a live student.
   *
   * The key id is not secret — it is handed to the browser to open Checkout —
   * but it is read here rather than exposed as NEXT_PUBLIC_, because the browser
   * receives it in the response that creates an order and has no other use for
   * it. That keeps one rule for all three values instead of two.
   */
  get RAZORPAY_KEY_ID(): string | null {
    return optional("RAZORPAY_KEY_ID");
  },
  /** Signs orders and verifies the signature Checkout hands back. Server-only. */
  get RAZORPAY_KEY_SECRET(): string | null {
    return optional("RAZORPAY_KEY_SECRET");
  },
  /**
   * A **different** secret from the key secret above — you choose it yourself
   * when adding the webhook in the Razorpay dashboard. Absent,
   * `/api/webhooks/razorpay` refuses every call rather than trusting an
   * unverifiable one, exactly as the Bunny webhook does.
   */
  get RAZORPAY_WEBHOOK_SECRET(): string | null {
    return optional("RAZORPAY_WEBHOOK_SECRET");
  },
};
