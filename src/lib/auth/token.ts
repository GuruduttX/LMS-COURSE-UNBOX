/**
 * Signing and verifying the session token.
 *
 * Split from session.ts on purpose: the proxy runs on the **edge runtime**,
 * where `next/headers`, `server-only` and Mongoose are all unavailable. `jose`
 * works there; bcryptjs does not. Keep this file free of anything Node-only,
 * and take the secret as an argument rather than reading `env` — the proxy has
 * no access to the server-only env accessors.
 */
import { SignJWT, jwtVerify } from "jose";

import { isRole, type Role } from "./roles";

export type SessionPayload = {
  /** User id. */
  sub: string;
  role: Role;
  name: string;
};

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  payload: SessionPayload,
  secret: string,
  maxAgeSeconds: number,
): Promise<string> {
  return new SignJWT({ role: payload.role, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(key(secret));
}

/** Null for anything wrong — expired, tampered with, or simply not ours. */
export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
    });

    if (!payload.sub || !isRole(payload.role)) return null;

    return {
      sub: payload.sub,
      role: payload.role,
      name: typeof payload.name === "string" ? payload.name : "",
    };
  } catch {
    return null;
  }
}
