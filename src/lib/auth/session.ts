import "server-only";

import { cookies } from "next/headers";

import { env } from "@/lib/env";

import {
  signSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "./token";
import type { Role } from "./roles";

import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "./cookie";

export { SESSION_COOKIE };

/**
 * The session cookie: sign in, read, sign out.
 *
 * The token carries `{ sub, role, name }` and nothing else — no email, no
 * assignments. It is signed, not encrypted, so anything in it is readable by
 * whoever holds the cookie; and anything cached in it is a copy that goes stale
 * the moment an admin changes the real record. Authorisation decisions therefore
 * read the database (see guards.ts); the token only says who is asking.
 *
 * Signing and verifying live in token.ts because the proxy needs them on the
 * edge runtime, where `next/headers` and `server-only` are not available.
 */
export async function createSession(user: {
  id: string;
  role: Role;
  name: string;
}): Promise<void> {
  const token = await signSessionToken(
    { sub: user.id, role: user.role, name: user.name },
    env.AUTH_SECRET,
    SESSION_MAX_AGE_SECONDS,
  );

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** The signed-in user's token payload, or null. Never throws on a bad cookie. */
export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  return verifySessionToken(token, env.AUTH_SECRET);
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
