"use server";

import { cookies } from "next/headers";

import {
  THEME_COOKIE,
  THEME_MAX_AGE_SECONDS,
  isTheme,
  type Theme,
} from "./theme";

/**
 * Persist the chosen theme.
 *
 * Not httpOnly on purpose is *not* the case here: nothing on the client reads
 * this cookie — the toggle sets `document.documentElement.dataset.theme`
 * directly for the instant repaint and only writes here so the next server
 * render agrees. No auth decision depends on it, so a bad value is simply
 * ignored rather than an error.
 */
export async function setTheme(theme: Theme): Promise<void> {
  if (!isTheme(theme)) return;

  (await cookies()).set(THEME_COOKIE, theme, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THEME_MAX_AGE_SECONDS,
  });
}
