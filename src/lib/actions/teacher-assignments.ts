"use server";

/**
 * Putting a teacher on a **batch**, and taking one off.
 *
 * ## Why a batch and not a program
 *
 * A program runs several cohorts at once — the morning batch, the weekend
 * batch, the next intake — and one teacher rarely takes all of them. Assigning
 * to the program said they did: every roster, every task and every session of
 * every cohort was theirs. So the unit of staffing is the cohort, and
 * `User.assignments[].batches` names which ones.
 *
 * Shared by two areas — an admin staffs a batch from `/manager/batches` and so
 * does a program manager — so the actions live here rather than beside either
 * set of routes. A second copy of a mutation is a second place for the scope
 * check to drift.
 *
 * The house order, in full:
 *
 *     requireRole → can() → assertScope → validate → write → writeAudit → revalidate
 *
 * `requireRole` establishes admin-or-manager. `can()` establishes the
 * capability. `assertScope` establishes *which programs* — without it a manager
 * could staff a program that isn't theirs, since `requireRole` alone says
 * nothing about which. And each of these re-checks independently of the page
 * that rendered the form, because a server action is its own front door.
 *
 * ## The two asymmetries worth reading twice
 *
 * **Removing the last batch removes the whole assignment.** An assignment whose
 * `batches` is empty means *every* batch (models/User.ts), so leaving one behind
 * would take a teacher off their only cohort and hand them the entire program.
 * The narrowest possible mistake would become the widest possible grant.
 *
 * **Assigning to someone who already holds the whole program is refused, not
 * applied.** Pushing a batch name onto an empty `batches` list would *narrow*
 * them from every cohort to one, silently, from a button labelled "Assign".
 * They already teach this batch; the message says so.
 *
 * ## What "remove" means
 *
 * It drops one batch from one assignment and nothing else. The account is
 * untouched, and any sessions they were down to teach keep their `teacherId`
 * and denormalised `teacherName` — unbooking a class as a side effect of a
 * staffing change would be a surprise, and `LiveSession` is the manager's to
 * change deliberately. The UI shows the upcoming-session count before the click
 * so this is a decision rather than an accident.
 */
import { revalidatePath } from "next/cache";
import { Types } from "mongoose";

import { assertScope, requireRole } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { writeAudit } from "@/lib/auth/audit";
import { connectToDatabase } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { Program } from "@/models/Program";
import { User } from "@/models/User";

export type TeacherAssignmentState = { ok: boolean; error?: string };

export async function assignTeacherToBatch(
  _previous: TeacherAssignmentState,
  formData: FormData,
): Promise<TeacherAssignmentState> {
  return mutate(formData, "assign");
}

export async function removeTeacherFromBatch(
  _previous: TeacherAssignmentState,
  formData: FormData,
): Promise<TeacherAssignmentState> {
  return mutate(formData, "remove");
}

/**
 * Take a teacher off a program entirely — every batch of it at once.
 *
 * The one staffing control that stays on the program screen, because it is the
 * only one that cannot be expressed batch by batch: an assignment written
 * before batches existed (or by the admin's person form) names no batches at
 * all, which reads as "every cohort", and there is no single batch to remove it
 * from. Without this such a teacher could never be taken off.
 *
 * It is also the honest way to say "this person has left the program", which is
 * otherwise four clicks on four cohorts.
 */
export async function removeTeacherFromProgram(
  _previous: TeacherAssignmentState,
  formData: FormData,
): Promise<TeacherAssignmentState> {
  const actor = await requireRole("admin", "program_manager");

  if (!can(actor, "program.assignTeacher")) {
    return { ok: false, error: "You cannot change who teaches this program." };
  }

  const programSlug = String(formData.get("programSlug") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "").trim();

  if (!programSlug || !teacherId) return { ok: false, error: "Pick a teacher." };
  if (!Types.ObjectId.isValid(teacherId)) {
    return { ok: false, error: "That teacher no longer exists." };
  }

  assertScope(actor, { program: programSlug });

  await connectToDatabase();

  const program = await Program.findOne({ slug: programSlug })
    .select("title")
    .lean();
  if (!program) return { ok: false, error: "That program no longer exists." };

  const teacher = await User.findById(teacherId).select("name role").lean();
  if (!teacher || teacher.role !== "teacher") {
    return { ok: false, error: "That person is not a teacher." };
  }

  const result = await User.updateOne(
    { _id: teacherId },
    { $pull: { assignments: { programSlug } } },
  );

  if (result.modifiedCount === 0) {
    return { ok: false, error: `${teacher.name} does not teach this program.` };
  }

  await writeAudit(actor, {
    action: "program.removeTeacher",
    targetType: "User",
    targetId: teacherId,
    summary: `Removed ${teacher.name} from ${program.title}`,
    meta: { programSlug },
  });

  revalidateStaffing(programSlug, "", teacherId);

  return { ok: true };
}

async function mutate(
  formData: FormData,
  intent: "assign" | "remove",
): Promise<TeacherAssignmentState> {
  // Admin or program manager. A teacher cannot staff their own cohort, and a
  // student is nowhere near this.
  const actor = await requireRole("admin", "program_manager");

  if (!can(actor, "program.assignTeacher")) {
    return { ok: false, error: "You cannot change who teaches this batch." };
  }

  const programSlug = String(formData.get("programSlug") ?? "").trim();
  const batchName = String(formData.get("batchName") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "").trim();

  if (!programSlug || !batchName || !teacherId) {
    return { ok: false, error: "Pick a teacher." };
  }
  if (!Types.ObjectId.isValid(teacherId)) {
    return { ok: false, error: "That teacher no longer exists." };
  }

  // Which program — the check `requireRole` cannot make.
  assertScope(actor, { program: programSlug });

  await connectToDatabase();

  // The program has to be real, or a typo in a posted slug would write an
  // assignment pointing at nothing, which every guard would then honour.
  const program = await Program.findOne({ slug: programSlug })
    .select("title")
    .lean();
  if (!program) {
    return { ok: false, error: "That program no longer exists." };
  }

  // And so does the batch, for the same reason plus one more: `batches` holds
  // names, so an unchecked one is a cohort that will never match an enrolment
  // and a teacher who appears staffed while seeing nobody.
  const batch = await Batch.findOne({ programSlug, name: batchName })
    .select("_id name")
    .lean();
  if (!batch) {
    return { ok: false, error: "That batch no longer exists." };
  }

  const teacher = await User.findById(teacherId)
    .select("name role assignments")
    .lean();
  if (!teacher || teacher.role !== "teacher") {
    return { ok: false, error: "That person is not a teacher." };
  }

  const assignment = (teacher.assignments ?? []).find(
    (item) => item.programSlug === programSlug,
  );
  // Empty `batches` on an existing assignment is "every batch" — see the file
  // header for why this is refused rather than quietly narrowed.
  const holdsWholeProgram =
    assignment !== undefined && (assignment.batches ?? []).length === 0;

  if (intent === "assign") {
    if (holdsWholeProgram) {
      return {
        ok: false,
        error: `${teacher.name} already teaches every batch on this program.`,
      };
    }

    const result = assignment
      ? // $addToSet rather than $push: the same batch added twice is a list that
        // can be half-removed, and one removal would then look like it failed.
        await User.updateOne(
          { _id: teacherId, "assignments.programSlug": programSlug },
          { $addToSet: { "assignments.$.batches": batch.name } },
        )
      : await User.updateOne(
          { _id: teacherId, "assignments.programSlug": { $ne: programSlug } },
          {
            $push: {
              assignments: {
                programSlug,
                courseIds: [],
                batches: [batch.name],
              },
            },
          },
        );

    if (result.modifiedCount === 0) {
      return { ok: false, error: `${teacher.name} already teaches this batch.` };
    }
  } else {
    if (holdsWholeProgram) {
      // Nothing to pull, and pulling nothing would report success. Say what is
      // actually true: their scope is the program, so the removal that matches
      // it is the program-level one on the program screen.
      return {
        ok: false,
        error: `${teacher.name} teaches every batch on this program, so there is nothing to remove here. Take them off the whole program from the program screen.`,
      };
    }

    if (!assignment || !(assignment.batches ?? []).includes(batch.name)) {
      return { ok: false, error: `${teacher.name} does not teach this batch.` };
    }

    const remaining = (assignment.batches ?? []).filter(
      (name) => name !== batch.name,
    );

    const result =
      remaining.length === 0
        ? // Their last cohort here: the assignment goes with it, because an
          // empty `batches` would read as "every batch" and hand them the lot.
          await User.updateOne(
            { _id: teacherId },
            { $pull: { assignments: { programSlug } } },
          )
        : await User.updateOne(
            { _id: teacherId, "assignments.programSlug": programSlug },
            { $pull: { "assignments.$.batches": batch.name } },
          );

    if (result.modifiedCount === 0) {
      return { ok: false, error: `${teacher.name} does not teach this batch.` };
    }
  }

  await writeAudit(actor, {
    action:
      intent === "assign" ? "program.assignTeacher" : "program.removeTeacher",
    targetType: "User",
    targetId: teacherId,
    summary:
      intent === "assign"
        ? `Assigned ${teacher.name} to ${batch.name} on ${program.title}`
        : `Removed ${teacher.name} from ${batch.name} on ${program.title}`,
    meta: { programSlug, batch: batch.name },
  });

  revalidateStaffing(programSlug, batch.name, teacherId);

  return { ok: true };
}

/** Every screen that says who teaches what. */
function revalidateStaffing(
  programSlug: string,
  batchName: string,
  teacherId: string,
): void {
  // A program-level removal touches every cohort's panel, so the whole subtree
  // goes rather than the one batch that was named.
  if (batchName) {
    revalidatePath(
      `/manager/batches/${programSlug}/${encodeURIComponent(batchName)}`,
    );
    revalidatePath("/manager/batches");
  } else {
    revalidatePath("/manager/batches", "layout");
  }
  // Both program screens roll the batch staffing up, and the admin's people
  // screens show the same assignment from the other side.
  revalidatePath(`/admin/programs/${programSlug}`);
  revalidatePath(`/manager/programs/${programSlug}`);
  revalidatePath(`/admin/people/${teacherId}`);
}
