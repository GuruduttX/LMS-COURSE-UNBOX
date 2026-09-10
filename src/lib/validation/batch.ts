/**
 * Rules for creating and editing a batch, shared by the form and the action.
 *
 * Pure — no database, no auth — so the client island imports it too and a
 * mistyped capacity is caught before a round trip. Uniqueness of the name is
 * *not* here: only the database can answer that, and the action does.
 */
export type BatchInput = {
  programSlug: string;
  name: string;
  capacity: string;
  /** yyyy-mm-dd, entered in IST. Optional. */
  startsOn: string;
  /** yyyy-mm-dd, entered in IST. Optional, and must not precede `startsOn`. */
  endsOn: string;
};

export type BatchErrors = Partial<Record<keyof BatchInput, string>>;

export const EMPTY_BATCH: BatchInput = {
  programSlug: "",
  name: "",
  capacity: "30",
  startsOn: "",
  endsOn: "",
};

export function validateBatch(input: BatchInput): BatchErrors {
  const errors: BatchErrors = {};

  if (!input.programSlug) errors.programSlug = "Pick a program.";

  const name = input.name.trim();
  if (!name) {
    errors.name = "Give the batch a name.";
  } else if (name.length > 80) {
    errors.name = "Keep the name under 80 characters.";
  }

  const capacity = Number(input.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000) {
    errors.capacity = "A whole number of seats, between 1 and 1000.";
  }

  const DATE = /^\d{4}-\d{2}-\d{2}$/;

  if (input.startsOn && !DATE.test(input.startsOn)) {
    errors.startsOn = "Use a real date, or leave it blank.";
  }

  if (input.endsOn && !DATE.test(input.endsOn)) {
    errors.endsOn = "Use a real date, or leave it blank.";
  }

  // Only when both are real dates: an ordering complaint about a field that is
  // already being complained about reads as two errors for one mistake. String
  // comparison is enough — yyyy-mm-dd sorts chronologically.
  if (
    !errors.startsOn &&
    !errors.endsOn &&
    input.startsOn &&
    input.endsOn &&
    input.endsOn < input.startsOn
  ) {
    errors.endsOn = "The end date can't be before the start date.";
  }

  return errors;
}

/**
 * Capacity may be lowered below the number already enrolled — the seats are
 * taken, and refusing the edit would not free them. The batch simply reads as
 * over capacity until somebody is moved, which is the honest thing to show.
 */
export function seatsLeft(capacity: number, enrolled: number): number {
  return Math.max(0, capacity - enrolled);
}
