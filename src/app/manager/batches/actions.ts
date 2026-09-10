"use server";

/**
 * Creating and editing batches.
 *
 * The house order, in full: **requireRole → can() → assertScope → validate →
 * write → writeAudit → revalidate**. `requireRole("program_manager")` admits an
 * admin too — the superset rule — so this one file serves both, and the scope
 * check is what decides *which* programs a manager may shape cohorts in.
 *
 * A teacher holds neither `batch.view` nor `batch.manage`, so none of this is
 * reachable for them even with a forged post.
 */
import { revalidatePath } from "next/cache";
import { Types } from "mongoose";

import { writeAudit } from "@/lib/auth/audit";
import { assertScope, requireRole } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { connectToDatabase } from "@/lib/db";
import { validateBatch, type BatchInput } from "@/lib/validation/batch";
import { Batch, type BatchStatus } from "@/models/Batch";
import { Enrollment } from "@/models/Enrollment";
import { LiveSession } from "@/models/LiveSession";
import { Program } from "@/models/Program";
import { Task } from "@/models/Task";
import { User } from "@/models/User";

import type { BatchFormState } from "./state";

const DENIED = "You don't have permission to do that.";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readBatch(formData: FormData): BatchInput {
  return {
    programSlug: text(formData, "programSlug"),
    name: text(formData, "name"),
    capacity: text(formData, "capacity"),
    startsOn: text(formData, "startsOn"),
    endsOn: text(formData, "endsOn"),
  };
}

/** yyyy-mm-dd as entered, read as midnight IST — the timezone the dates mean. */
function dateOrNull(value: string): Date | null {
  return value ? new Date(`${value}T00:00:00+05:30`) : null;
}

/**
 * A new cohort.
 *
 * The name has to be unique within the program because it is the key
 * `Enrollment.batch` joins on — two "Evening" batches in one program would make
 * every occupancy count a sum of both. The unique index enforces it; this only
 * turns the driver's error into a sentence.
 */
export async function createBatch(
  _previous: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await requireRole("program_manager");
  const values = readBatch(formData);

  if (!can(actor, "batch.manage")) {
    return { ok: false, values, errors: { name: DENIED } };
  }

  const errors = validateBatch(values);
  if (Object.keys(errors).length > 0) return { ok: false, errors, values };

  assertScope(actor, { program: values.programSlug });

  await connectToDatabase();

  const program = await Program.findOne({ slug: values.programSlug })
    .select("_id title")
    .lean();
  if (!program) {
    return { ok: false, values, errors: { programSlug: "No such program." } };
  }

  const name = values.name.trim();

  const clash = await Batch.findOne({
    programSlug: values.programSlug,
    name,
  })
    .select("_id")
    .lean();
  if (clash) {
    return {
      ok: false,
      values,
      errors: { name: "This program already has a batch with that name." },
    };
  }

  const created = await Batch.create({
    programSlug: values.programSlug,
    name,
    capacity: Number(values.capacity),
    startsOn: dateOrNull(values.startsOn),
    endsOn: dateOrNull(values.endsOn),
    status: "open",
    createdBy: actor.id,
  });

  await writeAudit(actor, {
    action: "batch.create",
    targetType: "Batch",
    targetId: String(created._id),
    summary: `Created batch "${name}" on ${program.title}`,
    meta: { programSlug: values.programSlug, capacity: created.capacity },
  });

  revalidateBatchScreens(values.programSlug);

  return {
    ok: true,
    errors: {},
    values: { ...values, name: "", startsOn: "", endsOn: "" },
    message: `Batch "${name}" created.`,
  };
}

/**
 * Rename, resize, or close a batch.
 *
 * **The rename cascades — to four collections now, not one.** The name is the
 * join key everywhere it appears, so changing it here without updating what
 * holds it would silently empty the batch:
 *
 * - `Enrollment.batch` — every occupancy count would read zero while the
 *   students sat in a cohort labelled with the old name.
 * - `User.assignments[].batches` — every teacher on the cohort would stop
 *   seeing its students, and an empty `batches` list means *every* batch, so a
 *   teacher on only this one would silently gain the whole program.
 * - `LiveSession.batch` — the cohort's own classes would drop off its
 *   timetable and out of everyone's attendance.
 * - `Task.batch` — a task set for the cohort would reach nobody, while still
 *   showing its author a recipient count of zero and no explanation.
 *
 * The last three are why this is `renameBatchEverywhere` rather than the
 * enrolment-only update it started as: a rename is a relabelling, never a
 * staffing change.
 *
 * Lowering capacity below the number already enrolled is allowed: those seats
 * are taken, and refusing the edit would not free them. The batch reads as full
 * (and over) until somebody is moved.
 */
export async function updateBatch(
  _previous: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await requireRole("program_manager");
  const values = readBatch(formData);

  if (!can(actor, "batch.manage")) {
    return { ok: false, values, errors: { name: DENIED } };
  }

  const id = text(formData, "id");
  if (!Types.ObjectId.isValid(id)) {
    return { ok: false, values, errors: { name: "No such batch." } };
  }

  const errors = validateBatch(values);
  if (Object.keys(errors).length > 0) return { ok: false, errors, values };

  await connectToDatabase();

  const batch = await Batch.findById(id).exec();
  if (!batch) return { ok: false, values, errors: { name: "No such batch." } };

  // The program it is in now, not the one the form claims — a batch never moves
  // between programs, so a posted slug that disagrees is checked against both.
  assertScope(actor, { program: batch.programSlug });
  assertScope(actor, { program: values.programSlug });

  const name = values.name.trim();
  const status = text(formData, "status") === "closed" ? "closed" : "open";

  if (name !== batch.name) {
    const clash = await Batch.findOne({
      programSlug: batch.programSlug,
      name,
      _id: { $ne: batch._id },
    })
      .select("_id")
      .lean();
    if (clash) {
      return {
        ok: false,
        values,
        errors: { name: "This program already has a batch with that name." },
      };
    }
  }

  const previousName = batch.name;

  batch.name = name;
  batch.capacity = Number(values.capacity);
  batch.startsOn = dateOrNull(values.startsOn);
  batch.endsOn = dateOrNull(values.endsOn);
  batch.status = status as BatchStatus;
  await batch.save();

  if (name !== previousName) {
    await renameBatchEverywhere(batch.programSlug, previousName, name);
  }

  await writeAudit(actor, {
    action: "batch.update",
    targetType: "Batch",
    targetId: String(batch._id),
    summary:
      name === previousName
        ? `Updated batch "${name}"`
        : `Renamed batch "${previousName}" to "${name}"`,
    meta: {
      programSlug: batch.programSlug,
      capacity: batch.capacity,
      status,
    },
  });

  revalidateBatchScreens(batch.programSlug);

  return { ok: true, errors: {}, values, message: "Saved." };
}

/**
 * Keep every row that names this batch in step with it.
 *
 * Four collections hold the name: the enrolments sitting in it, the teachers
 * assigned to it, the sessions scheduled for it and the tasks set for it. All
 * four are keyed by the
 * name rather than by a batch id — the house pattern, since the unique
 * `(programSlug, name)` index makes the pair as good as an id and keeps the
 * label legible on every row that carries it — and the price of that pattern is
 * exactly this function.
 *
 * The teacher update is positional (`assignments.$[item].batches.$[old]`) so it
 * touches only the entry for this program: a teacher with an "Evening" batch on
 * two different programs must not have both renamed by one program's edit.
 */
async function renameBatchEverywhere(
  programSlug: string,
  from: string,
  to: string,
): Promise<void> {
  const program = await Program.findOne({ slug: programSlug })
    .select("_id")
    .lean();

  if (program) {
    await Enrollment.updateMany(
      { programId: program._id, batch: from },
      { $set: { batch: to } },
    );
  }

  await User.updateMany(
    { assignments: { $elemMatch: { programSlug, batches: from } } },
    { $set: { "assignments.$[item].batches.$[old]": to } },
    {
      arrayFilters: [
        { "item.programSlug": programSlug },
        { old: from },
      ],
    },
  );

  await LiveSession.updateMany(
    { programSlug, batch: from },
    { $set: { batch: to } },
  );

  if (program) {
    await Task.updateMany(
      { programId: program._id, audience: "batch", batch: from },
      { $set: { batch: to } },
    );
  }
}

/** Every screen a batch's name or fullness shows on. */
function revalidateBatchScreens(programSlug: string): void {
  revalidatePath("/manager/batches", "layout");
  revalidatePath(`/admin/students/${programSlug}`);
  revalidatePath(`/manager/students/${programSlug}`);
  revalidatePath(`/teacher/students/${programSlug}`);
  // Both program screens roll up which cohorts each teacher takes, so a rename
  // shows there too.
  revalidatePath(`/admin/programs/${programSlug}`);
  revalidatePath(`/manager/programs/${programSlug}`);
}
