/**
 * The colour theme: what it can be, where it is stored, how it is read.
 *
 * "system" is a real stored value, not the absence of one — it is written onto
 * `<html data-theme>` and resolved by a `prefers-color-scheme` media query in
 * globals.css. That is why this app needs no blocking inline script and cannot
 * flash the wrong theme: the server always knows the attribute, and the OS
 * preference never has to travel to the server at all.
 *
 * Plain constants with no imports, so the edge runtime and the client bundle
 * can both use them (same reasoning as auth/cookie.ts).
 */
export type Theme = "light" | "dark" | "system";

export const THEME_COOKIE = "lms_theme";

export const THEME_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

export const DEFAULT_THEME: Theme = "system";

export const THEMES: readonly Theme[] = ["light", "dark", "system"];

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}
