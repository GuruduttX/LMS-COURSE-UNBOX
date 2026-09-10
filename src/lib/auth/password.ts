import "server-only";

import bcrypt from "bcryptjs";

/**
 * Password hashing. Node-only — bcryptjs must never reach the edge runtime, so
 * nothing the proxy imports may import this file.
 *
 * Cost 12: roughly 200–300ms per hash on a laptop. Slow enough to make offline
 * cracking expensive, fast enough that a login doesn't feel broken.
 */
const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * A hash of nothing useful, compared against when the email doesn't exist.
 * Without it, a missing account answers in ~1ms and a real one in ~250ms —
 * which tells an attacker exactly which emails are registered.
 */
export const DUMMY_HASH =
  "$2b$12$C6UzMDM.H6dfI/f/IKcEe.uQK0aZ1uJ0cVYtLR/rNqM8kQ9jGm6by";
