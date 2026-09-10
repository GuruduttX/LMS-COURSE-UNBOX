/**
 * Rules for scheduling a live session, shared by the form and the action.
 */
import { isSessionKind } from "@/lib/data/session-kinds";

export type SessionInput = {
  title: string;
  description: string;
  kind: string;
  programSlug: string;
  /**
   * Which cohort it is for, by name — or `""` for the whole program, which is
   * a real answer rather than a missing one: the induction and the placement
   * talk belong to every batch. See models/LiveSession.ts.
   */
  batch: string;
  /** yyyy-mm-dd, entered in IST. */
  date: string;
  /** HH:mm, 24h, IST. */
  time: string;
  durationMinutes: string;
  teacherId: string;
  joinUrl: string;
  /**
   * "on" when the manager asked us to mint a Google Meet link instead of
   * pasting one. A string rather than a boolean because it comes off a
   * checkbox in `FormData`, and the whole `SessionInput` round-trips back to
   * the form on a rejected save.
   */
  generateMeet: string;
};

export type SessionErrors = Partial<Record<keyof SessionInput, string>>;

export const EMPTY_SESSION: SessionInput = {
  title: "",
  description: "",
  kind: "learning",
  programSlug: "",
  batch: "",
  date: "",
  time: "",
  durationMinutes: "90",
  teacherId: "",
  joinUrl: "",
  generateMeet: "",
};

export function validateSession(input: SessionInput): SessionErrors {
  const errors: SessionErrors = {};

  const title = input.title.trim();
  if (!title) {
    errors.title = "Give the session a title.";
  } else if (title.length > 140) {
    errors.title = "Keep the title under 140 characters.";
  }

  if (input.description.trim().length > 600) {
    errors.description = "Keep the description under 600 characters.";
  }

  if (!isSessionKind(input.kind)) errors.kind = "Pick a session type.";
  if (!input.programSlug) errors.programSlug = "Pick a program.";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    errors.date = "Pick a date.";
  }
  if (!/^\d{2}:\d{2}$/.test(input.time)) {
    errors.time = "Pick a start time.";
  }

  const duration = Number(input.durationMinutes);
  if (!Number.isFinite(duration) || duration < 5 || duration > 600) {
    errors.durationMinutes = "Between 5 and 600 minutes.";
  }

  // A joining link is optional — it often doesn't exist when the slot is
  // booked — but a malformed one is worse than none, because a student clicks it.
  // Skipped when we're about to generate one: the field is disabled in the form
  // and whatever stale text it holds is ignored by the action.
  const joinUrl = input.joinUrl.trim();
  if (input.generateMeet !== "on" && joinUrl && !/^https?:\/\/\S+$/i.test(joinUrl)) {
    errors.joinUrl = "Enter a full link starting with https://";
  }

  // Google refuses an event that starts in the past, and an invite that lands
  // after the class did is no use to the teacher either. Only checked when we
  // are the ones creating it — a manager backfilling last week's session with a
  // pasted recording link is legitimate.
  if (
    input.generateMeet === "on" &&
    !errors.date &&
    !errors.time &&
    toUtcInstant(input.date, input.time).getTime() < Date.now()
  ) {
    errors.time = "Pick a time in the future to generate a meeting link.";
  }

  return errors;
}

/**
 * IST wall-clock date + time → a real UTC instant.
 *
 * India is UTC+5:30 with no daylight saving, so the offset is a constant rather
 * than something to look up. Staff type local time; the database stores UTC.
 */
export function toUtcInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+05:30`);
}

/** The reverse, for filling the edit form. */
export function toIstFields(instant: Date): { date: string; time: string } {
  const date = instant.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const time = instant.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
  return { date, time };
}
