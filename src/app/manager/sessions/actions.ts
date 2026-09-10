"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAudit } from "@/lib/auth/audit";
import { assertScope, requireRole } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db";
import type { SessionKind } from "@/lib/data/session-kinds";
import {
  cancelGoogleMeetEvent,
  createGoogleMeetEvent,
  updateGoogleMeetEvent,
} from "@/lib/googleCalendar";
import {
  toUtcInstant,
  validateSession,
  type SessionInput,
} from "@/lib/validation/session";
import { Types } from "mongoose";

import { Attendance } from "@/models/Attendance";
import { Batch } from "@/models/Batch";
import { LiveSession } from "@/models/LiveSession";
import { User } from "@/models/User";

import type { SessionFormState } from "./state";

/**
 * Scheduling, in the order every mutation in this app follows:
 * requireRole (who) → assertScope (which program) → validate (what) → write.
 *
 * The scope check is the one that actually matters here. `requireRole` only
 * says "a program manager"; without `assertScope` any program manager could
 * schedule into any program by posting a different slug — the form's dropdown
 * is a convenience, not a control.
 *
 * ## The Google Meet detour
 *
 * When the manager ticks "generate a Meet link", these actions also talk to the
 * Calendar API, and that changes the failure story:
 *
 * - **Create** mints the event *before* writing the row. If Google fails,
 *   nothing is stored and the manager retries; the alternative is a session in
 *   every student's timetable with no way in. The residual risk is an orphan
 *   calendar event if the Mongo write then fails, which is the cheaper leak.
 * - **Update** and **cancel** reach Google *after* the row is saved, and their
 *   failures are logged rather than surfaced. By then the app's own record is
 *   already correct, and refusing the edit over a stale calendar entry would
 *   punish the manager for an outage they can't do anything about.
 *
 * With no credentials configured `createGoogleMeetEvent` hands back a mock link
 * instead of throwing, and the other two no-op — so this whole path works
 * end-to-end before the Cloud project exists. See lib/googleCalendar.ts.
 */

export async function createSession(
  _previous: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const user = await requireRole("program_manager");
  const values = readSession(formData);

  const errors = validateSession(values);
  if (Object.keys(errors).length > 0) return { ok: false, errors, values };

  assertScope(user, { program: values.programSlug });

  await connectToDatabase();

  const batch = await resolveBatch(values.batch, values.programSlug);
  if (batch === null) {
    return { ok: false, values, errors: { batch: "No such batch on this program." } };
  }

  const teacher = await resolveTeacher(values.teacherId, values.programSlug, batch);

  const startsAt = toUtcInstant(values.date, values.time);
  const durationMinutes = Number(values.durationMinutes);
  const title = values.title.trim();
  const description = values.description.trim();

  let joinUrl = values.joinUrl.trim();
  let googleEventId = "";

  if (values.generateMeet === "on") {
    try {
      const meet = await createGoogleMeetEvent({
        title,
        description,
        startTime: startsAt,
        endTime: new Date(startsAt.getTime() + durationMinutes * 60_000),
        // From the record, never the form: this address receives a calendar
        // invite, so taking it from a post would be a way to mail anyone.
        teacherEmail: teacher?.email,
      });

      joinUrl = meet.hangoutLink;
      googleEventId = meet.eventId;
    } catch (error) {
      // The Google error names scopes and delegation settings a manager cannot
      // act on. That goes to the log; they get something they can respond to.
      console.error("[sessions] Google Meet creation failed", error);
      return {
        ok: false,
        error:
          "Couldn't create the Google Meet link, so nothing was scheduled. Try again, or untick the box and paste a link yourself.",
        errors: {},
        values,
      };
    }
  }

  const created = await LiveSession.create({
    programSlug: values.programSlug,
    batch,
    title,
    description,
    kind: values.kind as SessionKind,
    startsAt,
    durationMinutes,
    teacherId: teacher?.id ?? null,
    teacherName: teacher?.name ?? "",
    joinUrl,
    googleEventId,
    status: "scheduled",
    createdBy: user.id,
  });

  await writeAudit(user, {
    action: "session.schedule",
    targetType: "LiveSession",
    targetId: String(created._id),
    summary: `Scheduled "${created.title}" for ${values.date}`,
    meta: {
      programSlug: values.programSlug,
      batch: batch || null,
      kind: values.kind,
      googleEventId: googleEventId || null,
    },
  });

  revalidatePath("/manager/sessions");

  // Straight to the session when we minted a link, so the manager sees what
  // students will get — including the "this is a placeholder" warning if the
  // credentials aren't in yet. Otherwise back to the list, as before.
  redirect(
    googleEventId
      ? `/manager/sessions/${created._id}?done=created`
      : "/manager/sessions?done=created",
  );
}

export async function updateSession(
  _previous: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const user = await requireRole("program_manager");

  const id = String(formData.get("id") ?? "");
  const values = readSession(formData);

  const errors = validateSession(values);
  if (Object.keys(errors).length > 0) return { ok: false, errors, values };

  await connectToDatabase();
  const session = await LiveSession.findById(id).exec();
  if (!session) return { ok: false, values, errors: { title: "No such session." } };

  // Both the program it is in now and the one it would move to.
  assertScope(user, { program: session.programSlug });
  assertScope(user, { program: values.programSlug });

  const batch = await resolveBatch(values.batch, values.programSlug);
  if (batch === null) {
    return { ok: false, values, errors: { batch: "No such batch on this program." } };
  }

  const teacher = await resolveTeacher(values.teacherId, values.programSlug, batch);

  const startsAt = toUtcInstant(values.date, values.time);
  const durationMinutes = Number(values.durationMinutes);
  const title = values.title.trim();
  const description = values.description.trim();

  // Generating a link for a session that hasn't got one yet — the common case
  // being a slot booked before anyone set the meeting up.
  if (values.generateMeet === "on" && !session.googleEventId) {
    try {
      const meet = await createGoogleMeetEvent({
        title,
        description,
        startTime: startsAt,
        endTime: new Date(startsAt.getTime() + durationMinutes * 60_000),
        teacherEmail: teacher?.email,
      });

      session.joinUrl = meet.hangoutLink;
      session.googleEventId = meet.eventId;
    } catch (error) {
      console.error("[sessions] Google Meet creation failed", error);
      return {
        ok: false,
        error:
          "Couldn't create the Google Meet link, so nothing was saved. Try again, or untick the box and paste a link yourself.",
        errors: {},
        values,
      };
    }
  } else if (!session.googleEventId) {
    // Only a session whose link we didn't mint takes one from the form. A
    // generated `joinUrl` is Google's to change, not the manager's to overtype.
    session.joinUrl = values.joinUrl.trim();
  }

  session.programSlug = values.programSlug;
  session.batch = batch;
  session.title = title;
  session.description = description;
  session.kind = values.kind as SessionKind;
  session.startsAt = startsAt;
  session.durationMinutes = durationMinutes;
  session.teacherId = teacher ? new Types.ObjectId(teacher.id) : null;
  session.teacherName = teacher?.name ?? "";
  await session.save();

  // Move the calendar event to match — after the save, and failing quietly.
  // The app's own record is already right; a Calendar outage should not make
  // the manager think their edit didn't land. A `patch` keeps the conference,
  // so the Meet URL students already hold stays valid.
  if (session.googleEventId) {
    try {
      await updateGoogleMeetEvent(session.googleEventId, {
        title,
        description,
        startTime: startsAt,
        endTime: new Date(startsAt.getTime() + durationMinutes * 60_000),
        teacherEmail: teacher?.email,
      });
    } catch (error) {
      console.error(
        "[sessions] calendar event not updated for",
        String(session._id),
        error,
      );
    }
  }

  await writeAudit(user, {
    action: "session.update",
    targetType: "LiveSession",
    targetId: id,
    summary: `Updated "${session.title}"`,
  });

  revalidatePath("/manager/sessions");
  revalidatePath(`/manager/sessions/${id}`);
  return { ok: true, errors: {}, values };
}

/**
 * Cancel, or un-cancel. Never a delete: a student who arranged their week
 * around a session must still be able to see what happened to it.
 */
export async function setSessionStatus(formData: FormData): Promise<void> {
  const user = await requireRole("program_manager");

  const id = String(formData.get("id") ?? "");
  const cancel = formData.get("cancel") === "true";

  await connectToDatabase();
  const session = await LiveSession.findById(id).exec();
  if (!session) redirect("/manager/sessions");

  assertScope(user, { program: session.programSlug });

  session.status = cancel ? "cancelled" : "scheduled";

  /**
   * The row is never deleted — but the *calendar entry* should go, or the
   * teacher keeps a reminder for a class that isn't happening, and the Meet
   * room stays open for students who don't re-read the timetable.
   *
   * `googleEventId` is cleared too, so restoring doesn't try to patch an event
   * that no longer exists; a restored session is re-generated from the edit
   * screen like any session without a link. Failing quietly, after the status
   * is decided: an unreachable Calendar API must not block a cancellation.
   */
  if (cancel && session.googleEventId) {
    try {
      await cancelGoogleMeetEvent(session.googleEventId);
      session.googleEventId = "";
      session.joinUrl = "";
    } catch (error) {
      console.error(
        "[sessions] calendar event not withdrawn for",
        String(session._id),
        error,
      );
    }
  }

  await session.save();

  await writeAudit(user, {
    action: cancel ? "session.cancel" : "session.restore",
    targetType: "LiveSession",
    targetId: id,
    summary: `${cancel ? "Cancelled" : "Restored"} "${session.title}"`,
  });

  revalidatePath("/manager/sessions");
  revalidatePath(`/manager/sessions/${id}`);
}

/**
 * Mark the roster in one write.
 *
 * Students not in the form are left alone rather than marked absent: the form
 * only carries who was on the roster when it was rendered, and "absent" must
 * always be somebody's decision, never a side effect of a stale page.
 */
export async function markAttendance(formData: FormData): Promise<void> {
  const user = await requireRole("program_manager");

  const id = String(formData.get("id") ?? "");

  await connectToDatabase();
  const session = await LiveSession.findById(id).exec();
  if (!session) redirect("/manager/sessions");

  assertScope(user, { program: session.programSlug });

  const roster = formData.getAll("studentId").map(String);
  const now = new Date();

  const operations = roster.map((studentId) => {
    const state: "present" | "absent" =
      formData.get(`state:${studentId}`) === "present" ? "present" : "absent";

    return {
      updateOne: {
        filter: {
          sessionId: session._id,
          studentId: new Types.ObjectId(studentId),
        },
        // Upsert against the unique (sessionId, studentId) index: re-marking
        // corrects the existing row instead of failing or duplicating it.
        update: {
          $set: {
            state,
            markedBy: new Types.ObjectId(user.id),
            markedAt: now,
          },
        },
        upsert: true,
      },
    };
  });

  if (operations.length > 0) await Attendance.bulkWrite(operations);

  await writeAudit(user, {
    action: "session.markAttendance",
    targetType: "LiveSession",
    targetId: id,
    summary: `Marked attendance for "${session.title}" (${roster.length} students)`,
  });

  revalidatePath("/manager/sessions");
  revalidatePath(`/manager/sessions/${id}/attendance`);
  redirect(`/manager/sessions/${id}/attendance?done=marked`);
}

/**
 * The chosen cohort, if it is real — or `null`, meaning "refuse this".
 *
 * `""` is not a failure: it is the program-wide session every cohort attends,
 * and it comes back as `""`. Anything else has to name a `Batch` on this
 * program, because the name is the join key. An unchecked one would schedule a
 * class for a cohort that does not exist: nobody's timetable, an empty register,
 * and no teacher eligible to take it.
 */
async function resolveBatch(
  batch: string,
  programSlug: string,
): Promise<string | null> {
  const name = batch.trim();
  if (!name) return "";

  const row = await Batch.findOne({ programSlug, name }).select("name").lean();
  return row ? row.name : null;
}

/**
 * The chosen teacher, if they are real, active, and take that cohort.
 *
 * The cohort check is the half that batch assignment added. Without it a
 * manager could put the Tuesday teacher on a Thursday class by posting an id —
 * the dropdown narrows the list, but a form is a convenience and an action is
 * the control.
 *
 * A program-wide session (`batch: ""`) accepts any teacher on the program:
 * every cohort is invited, so every cohort's teacher is eligible to take it.
 */
async function resolveTeacher(
  teacherId: string,
  programSlug: string,
  batch: string,
) {
  if (!teacherId || !/^[0-9a-fA-F]{24}$/.test(teacherId)) return null;

  const teacher = await User.findOne({
    _id: teacherId,
    role: "teacher",
    status: "active",
    assignments: {
      $elemMatch: {
        programSlug,
        // Empty `batches` is "every cohort" — see models/User.ts.
        ...(batch ? { $or: [{ batches: batch }, { batches: { $size: 0 } }] } : {}),
      },
    },
  })
    // `email` is here so the calendar invite can be addressed from the record
    // rather than from anything the form posted.
    .select("name email")
    .lean();

  return teacher
    ? { id: String(teacher._id), name: teacher.name, email: teacher.email }
    : null;
}

function readSession(formData: FormData): SessionInput {
  return {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    kind: String(formData.get("kind") ?? ""),
    programSlug: String(formData.get("programSlug") ?? ""),
    batch: String(formData.get("batch") ?? ""),
    date: String(formData.get("date") ?? ""),
    time: String(formData.get("time") ?? ""),
    durationMinutes: String(formData.get("durationMinutes") ?? ""),
    teacherId: String(formData.get("teacherId") ?? ""),
    joinUrl: String(formData.get("joinUrl") ?? ""),
    // An unchecked checkbox sends nothing at all, so absent means "off".
    generateMeet: formData.get("generateMeet") === "on" ? "on" : "",
  };
}
