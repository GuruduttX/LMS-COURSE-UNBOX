/**
 * The session cookie's name and lifetime.
 *
 * Its own file because both sides need it and they cannot share a module: the
 * proxy runs on the edge runtime, session.ts is `server-only`. One constant in
 * two places is exactly how a cookie ends up written under one name and read
 * under another.
 */
export const SESSION_COOKIE = "lms_session";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
