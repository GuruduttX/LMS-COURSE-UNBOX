/**
 * Formatting for curriculum screens. Pure, client-safe, no data imports.
 *
 * Moved out of `data/curriculum.ts` when the tree became a database read: these
 * never needed the data, and a client component importing them shouldn't drag a
 * server-only module in behind them.
 */

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/** "12m read" — the text equivalent of a video's runtime. */
export function formatReadTime(minutes: number): string {
  return `${Math.max(1, minutes)}m read`;
}
