/**
 * Suggesting the stable `key` a new node gets.
 *
 * Every node carries one — `pm-c4-m2-t1` — and it never changes afterwards,
 * because it is what the URLs, `User.assignments[].courseIds` and the migration
 * all speak. That makes it important and, for a teacher writing a module at
 * 11pm, entirely uninteresting. So the form suggests one from the parent's key
 * and the title, and lets it be overridden.
 *
 * The suggestion is a **starting point, not a rule**: the field stays editable,
 * and the server checks uniqueness rather than trusting the shape. Pure, so the
 * client form and any script can share it.
 */

/** Lowercase, hyphenated, ASCII. The same shape `validateKey` enforces. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\da-z]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * A key for a new child.
 *
 * Prefers the parent's key plus a short positional suffix (`pm-c4-m3`), which
 * is what the migrated tree already looks like and what makes a key readable at
 * a glance. Falls back to the title when there is no parent — a program's slug
 * is the root of every key below it.
 */
export function suggestKey({
  parentKey,
  prefix,
  index,
  title,
}: {
  parentKey: string;
  /** `c` for a course, `m` for a module, `t` for a topic, `s` for a subtopic. */
  prefix: string;
  /** How many siblings already exist. The suffix is one past them. */
  index: number;
  /** Used only when there is no parent key to build on. */
  title?: string;
}): string {
  if (parentKey) return `${parentKey}-${prefix}${index + 1}`;
  const base = slugify(title ?? "");
  return base ? `${base}-${prefix}${index + 1}` : "";
}
