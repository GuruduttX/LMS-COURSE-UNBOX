/**
 * Avatar initials: first letter of the first name, first letter of the last.
 * Shared by the header avatar and the profile screen so the two never disagree
 * about what someone's monogram is.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}
