import type { Mark } from "@/lib/data/marksheet-db";

/**
 * A mark, everywhere it appears: the score loud, the maximum quiet, so a column
 * of them scans as numbers rather than as fractions. An em dash means "nothing
 * to show yet" — never a zero, which would read as a failed attempt.
 */
export function MarkValue({ value }: { value: Mark }) {
  if (value === null) {
    return (
      <span className="text-ink-400" aria-label="Not attempted">
        —
      </span>
    );
  }

  return (
    <span className="tabular-nums">
      <span className="text-base font-extrabold text-ink-900">{value.scored}</span>
      <span className="text-sm font-medium text-ink-500"> / {value.max}</span>
    </span>
  );
}
