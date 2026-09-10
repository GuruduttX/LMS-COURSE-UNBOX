"use server";

/**
 * Enrolling a student, and taking them off a program.
 *
 * The house order, in full: **requireRole → can() → assertScope → validate →
 * write → writeAudit → revalidate**. Both of these change who can see whose
 * marks, so the scope check is the whole point rather than a formality — a
 * manager may enrol into a program they run and nowhere else.
 *
 * `enrollment.create` and `enrollment.update` are already on the program
 * manager's capability list, so this is the map's existing intent implemented
 * rather than a new grant. A teacher holds neither: they author content and
 * mark work, and who is in the cohort is not theirs to decide.
 */
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { Types } from "mongoose";

import { writeAudit } from "@/lib/auth/audit";
import { assertScope, requireRole } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { batchOccupancy } from "@/lib/data/batches";
import { connectToDatabase } from "@/lib/db";
import { Enrollment } from "@/models/Enrollment";
import { Program } from "@/models/Program";
import { User } from "@/models/User";

import type { ActionState } from "./curriculum-state";

const DENIED = "You don't have permission to do that.";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Put a student on a program.
 *
 * Re-enrolling somebody who was withdrawn **reactivates their existing row**
 * rather than adding a second — that is what the unique index on
 * `(studentId, programId)` is for, and it is why their old progress, attempts
 * and hand-ins are still theirs when they come back.
 */
export async function enrollStudent(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("program_manager");
  if (!can(actor, "enrollment.create")) return { ok: false, error: DENIED };

  const programSlug = text(formData, "programSlug");
  assertScope(actor, { program: programSlug });

  await connectToDatabase();

  const program = await Program.findOne({ slug: programSlug })
    .select("_id title")
    .lean();
  if (!program) notFound();

  const studentId = text(formData, "studentId");
  if (!Types.ObjectId.isValid(studentId)) {
    return { ok: false, error: "Pick a student to enrol." };
  }

  // Role checked against the record, not the form: only a student account can
  // be enrolled, whatever id was posted.
  const student = await User.findOne({ _id: studentId, role: "student" })
    .select("name status")
    .lean();
  if (!student) return { ok: false, error: "That isn't a student account." };
  if (student.status !== "active") {
    return { ok: false, error: "That account is suspended." };
  }

  // The batch is now a row, not a typed label, so it is checked rather than
  // trimmed and trusted: it must be an open cohort of *this* program with a
  // seat free. The dropdown already disables full ones — this is what makes
  // that a rule instead of a hint, for a forged post or a stale tab.
  const batch = text(formData, "batch").trim().slice(0, 80);

  if (batch) {
    const occupancy = await batchOccupancy(programSlug, batch);
    if (!occupancy) {
      return { ok: false, error: "That batch isn't on this program." };
    }
    if (occupancy.status === "closed") {
      return { ok: false, error: `The ${batch} batch is closed.` };
    }
    if (occupancy.enrolled >= occupancy.capacity) {
      return {
        ok: false,
        error: `The ${batch} batch is full (${occupancy.enrolled}/${occupancy.capacity}). Raise its capacity or pick another.`,
      };
    }
  }

  const existing = await Enrollment.findOne({
    programId: program._id,
    studentId,
  })
    .select("_id status")
    .lean();

  if (existing?.status === "active") {
    return { ok: false, error: `${student.name} is already on this program.` };
  }

  await Enrollment.updateOne(
    { programId: program._id, studentId },
    {
      $set: {
        status: "active",
        batch,
        completedAt: null,
        ...(existing ? {} : { enrolledAt: new Date(), createdBy: actor.id }),
      },
    },
    { upsert: true },
  );

  await writeAudit(actor, {
    action: existing ? "enrollment.reactivate" : "enrollment.create",
    targetType: "Enrollment",
    targetId: studentId,
    summary: `${existing ? "Re-enrolled" : "Enrolled"} ${student.name} on ${program.title}`,
    meta: { programSlug, batch },
  });

  revalidatePath(`/admin/students/${programSlug}`);
  revalidatePath(`/manager/students/${programSlug}`);
  // The cohort just gained a member, so every seat count on that screen moved.
  revalidatePath("/manager/batches", "layout");

  return { ok: true };
}

/**
 * Take a student off a program.
 *
 * **Withdrawn, not deleted.** Deleting the row would orphan their progress,
 * attempts and submissions — and erase the fact that they were ever here,
 * which is exactly what a fee dispute turns on. The roster keeps showing them,
 * marked withdrawn, which is also how somebody notices a mistake.
 */
export async function withdrawStudent(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("program_manager");
  if (!can(actor, "enrollment.update")) return { ok: false, error: DENIED };

  const programSlug = text(formData, "programSlug");
  assertScope(actor, { program: programSlug });

  await connectToDatabase();

  const program = await Program.findOne({ slug: programSlug })
    .select("_id title")
    .lean();
  if (!program) notFound();

  const studentId = text(formData, "studentId");
  if (!Types.ObjectId.isValid(studentId)) notFound();

  const updated = await Enrollment.findOneAndUpdate(
    { programId: program._id, studentId, status: { $ne: "withdrawn" } },
    { $set: { status: "withdrawn" } },
    { returnDocument: "after" },
  )
    .select("_id")
    .lean();
  if (!updated) notFound();

  const student = await User.findById(studentId).select("name").lean();

  await writeAudit(actor, {
    action: "enrollment.withdraw",
    targetType: "Enrollment",
    targetId: studentId,
    summary: `Withdrew ${student?.name ?? "a student"} from ${program.title}`,
    meta: { programSlug },
  });

  revalidatePath(`/admin/students/${programSlug}`);
  revalidatePath(`/manager/students/${programSlug}`);
  // Withdrawing frees a seat, so the batch screen's counts moved too.
  revalidatePath("/manager/batches", "layout");

  return { ok: true };
}
