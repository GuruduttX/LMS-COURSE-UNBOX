import "server-only";

import { google } from "googleapis";
import { randomUUID } from "node:crypto";

import { env } from "./env";

/**
 * Minting a Google Meet link for a scheduled class.
 *
 * A Meet URL cannot be created on its own: it is a *side effect* of inserting a
 * Calendar event with `conferenceDataVersion: 1` and a `conferenceData` request.
 * So this creates the event and returns the `hangoutLink` Google attaches to it.
 *
 * ## Service account + domain-wide delegation, not OAuth
 *
 * There is no human to send through a consent screen — a program manager
 * schedules a class and the link must exist by the time the action returns. So
 * a Workspace service account impersonates one real account
 * (`GOOGLE_ADMIN_EMAIL`) via JWT `subject`, and the event is created on *that*
 * user's primary calendar. Meet requires a Workspace identity to own the
 * conference; a bare service account with no `subject` cannot create one.
 *
 * ## The mock fallback
 *
 * When the credentials are absent or still placeholders, this logs a warning
 * once per call and returns a fabricated link and event id instead of throwing.
 * That is deliberate: it lets the whole flow — form, action, model, both
 * dashboards — be built and used before the Cloud project exists, and switching
 * to real Meet links is then only a matter of filling in `.env.local`. Nothing
 * downstream branches on which one it got; the row looks the same either way.
 * Mock ids are prefixed `mock-` so a database full of them is obvious later.
 */

export type GoogleMeetEvent = {
  /** The join URL students and the teacher click. */
  hangoutLink: string;
  /** The Calendar event id, kept so the event can be patched or cancelled. */
  eventId: string;
  /** False when the mock fallback produced it — the UI can say so. */
  isReal: boolean;
};

export type CreateMeetEventInput = {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  /**
   * Invited as an attendee, so they get the invite and enter as a participant.
   * Optional because a session may be booked before anyone is assigned to take
   * it — the Meet is still created, just with nobody but the host invited.
   */
  teacherEmail?: string;
};

/** Everything the integration needs, or null when it isn't configured. */
function credentials(): {
  clientEmail: string;
  privateKey: string;
  adminEmail: string;
} | null {
  const clientEmail = env.GOOGLE_CLIENT_EMAIL;
  const privateKey = env.GOOGLE_PRIVATE_KEY;
  const adminEmail = env.GOOGLE_ADMIN_EMAIL;

  if (!clientEmail || !privateKey || !adminEmail) return null;

  return { clientEmail, privateKey, adminEmail };
}

/** True when real Meet links will be minted. Used by the UI to warn staff. */
export function isGoogleCalendarConfigured(): boolean {
  return credentials() !== null;
}

/**
 * The scopes the service account must be granted in the Workspace admin console
 * (Security → API controls → Domain-wide delegation), against its client ID.
 * `calendar.events` alone is enough to insert events and create conferences.
 */
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

/** Times are sent with an explicit zone so Google renders IST, not UTC, in invites. */
const TIME_ZONE = "Asia/Kolkata";

/** An authenticated Calendar client acting as the impersonated Workspace user. */
function calendarClient(config: NonNullable<ReturnType<typeof credentials>>) {
  const auth = new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey,
    scopes: SCOPES,
    // Domain-wide delegation: act *as* this Workspace user. Without it the
    // insert succeeds but no Meet conference is attached.
    subject: config.adminEmail,
  });

  return google.calendar({ version: "v3", auth });
}

/**
 * True for an id this module fabricated because Google wasn't configured.
 *
 * Callers check it before trying to patch or delete: there is no real event
 * behind a mock id, and asking Google about one is a guaranteed 404.
 */
export function isMockEventId(eventId: string): boolean {
  return eventId.startsWith("mock-");
}

export async function createGoogleMeetEvent(
  input: CreateMeetEventInput,
): Promise<GoogleMeetEvent> {
  const config = credentials();

  if (!config) {
    console.warn(
      "[googleCalendar] GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_ADMIN_EMAIL " +
        "are unset or still placeholders — returning a MOCK Meet link. " +
        "Fill them in .env.local to create real Google Meet conferences.",
    );

    return {
      hangoutLink: "https://meet.google.com/mock-cls-room",
      eventId: `mock-${randomUUID()}`,
      isReal: false,
    };
  }

  const response = await calendarClient(config).events.insert({
    calendarId: "primary",
    // Required for `conferenceData` to be honoured at all. Omitting it makes
    // Google silently drop the conference request and return an event with no
    // `hangoutLink` — the single most common way this integration "fails".
    conferenceDataVersion: 1,
    sendUpdates: "all",
    requestBody: {
      summary: input.title,
      description: input.description || undefined,
      start: { dateTime: input.startTime.toISOString(), timeZone: TIME_ZONE },
      end: { dateTime: input.endTime.toISOString(), timeZone: TIME_ZONE },
      attendees: input.teacherEmail ? [{ email: input.teacherEmail }] : [],
      conferenceData: {
        createRequest: {
          // Must be unique per request; Google deduplicates retries by it.
          requestId: randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });

  const eventId = response.data.id;
  const hangoutLink =
    response.data.hangoutLink ??
    response.data.conferenceData?.entryPoints?.find(
      (entry) => entry.entryPointType === "video",
    )?.uri;

  if (!eventId || !hangoutLink) {
    // Better to fail the whole schedule than to persist a class nobody can
    // join: `meetingLink` is required on the model for exactly this reason.
    throw new Error(
      "Google created the calendar event but returned no Meet link. Check that " +
        "the impersonated account may create conferences, and that " +
        "conferenceDataVersion is being sent.",
    );
  }

  return { hangoutLink, eventId, isReal: true };
}

/**
 * Move or retitle an existing event, so a rescheduled session doesn't leave a
 * calendar entry sitting at the old time.
 *
 * A `patch`, not an `update`: `update` replaces the whole event, which would
 * drop the conference and mint a link nobody has been given. Patching leaves
 * `conferenceData` alone, so **the Meet URL survives** — which is the point,
 * because students already have it.
 *
 * Returns quietly for a mock id or unconfigured credentials: there is no event
 * to move, and the row's own `startsAt` is already the truth the app reads.
 */
export async function updateGoogleMeetEvent(
  eventId: string,
  input: Omit<CreateMeetEventInput, "teacherEmail"> & { teacherEmail?: string },
): Promise<void> {
  const config = credentials();
  if (!config || isMockEventId(eventId)) return;

  await calendarClient(config).events.patch({
    calendarId: "primary",
    eventId,
    sendUpdates: "all",
    requestBody: {
      summary: input.title,
      description: input.description || undefined,
      start: { dateTime: input.startTime.toISOString(), timeZone: TIME_ZONE },
      end: { dateTime: input.endTime.toISOString(), timeZone: TIME_ZONE },
      // Sent every time so reassigning the session also reassigns the invite;
      // omitting the key entirely (rather than sending []) is what a patch needs
      // to leave the existing attendees untouched when there is no teacher.
      ...(input.teacherEmail ? { attendees: [{ email: input.teacherEmail }] } : {}),
    },
  });
}

/**
 * Withdraw the calendar event behind a cancelled session.
 *
 * The `LiveSession` row is never deleted — a student who planned around it must
 * still see what happened — but the *calendar entry* should go, or the teacher
 * keeps a reminder for a class that isn't happening. `sendUpdates: "all"` is
 * what actually tells them.
 *
 * A 404/410 is swallowed: an event already gone is the state we wanted.
 */
export async function cancelGoogleMeetEvent(eventId: string): Promise<void> {
  const config = credentials();
  if (!config || isMockEventId(eventId)) return;

  try {
    await calendarClient(config).events.delete({
      calendarId: "primary",
      eventId,
      sendUpdates: "all",
    });
  } catch (error) {
    const status = (error as { code?: number; status?: number }).code ??
      (error as { status?: number }).status;
    if (status === 404 || status === 410) return;
    throw error;
  }
}
