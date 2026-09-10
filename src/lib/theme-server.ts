import "server-only";

import { cookies } from "next/headers";

import { DEFAULT_THEME, THEME_COOKIE, isTheme, type Theme } from "./theme";

/**
 * The theme for this request, read from the cookie.
 *
 * Called by the root layout for `<html data-theme>` and by every component that
 * renders a ThemeToggle, so the toggle shows the right segment on first paint.
 */
export async function getTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : DEFAULT_THEME;
}
