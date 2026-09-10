/**
 * Minimal class-name joiner. Deliberately dependency-free — we only need
 * conditional joining, not Tailwind class-conflict resolution.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
