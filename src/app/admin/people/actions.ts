"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAudit } from "@/lib/auth/audit";
import { requireRole } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { ROLE_LABEL, isRole, type Role } from "@/lib/auth/roles";
import { connectToDatabase } from "@/lib/db";
import { assignmentKindFor, validatePerson } from "@/lib/validation/user";
import { User } from "@/models/User";

import type { PersonFormState } from "./state";

/**
 * Everything an admin can do to a person. Only an admin: `requireRole("admin")`
 * is the first line of each action, because a page guard protects the page and
 * a server action is its own front door — reachable by anyone who can post to
 * it, with or without the UI that normally calls it.
 *
 * Two rules enforced here rather than in the UI, because hiding a button is a
 * courtesy and refusing the write is the actual control:
 *
 * - **Nobody can demote or suspend themselves.** The last admin locking
 *   themselves out is unrecoverable without database access.
 * - **A role change drops assignments the new role cannot hold** — a teacher
 *   promoted to program manager keeps their programs but not their course list,
 *   because those fields mean different things per role.
 */

export async function createPerson(
  _previous: PersonFormState,
  formData: FormData,
): Promise<PersonFormState> {
  const admin = await requireRole("admin");

  const input = readPerson(formData);
  const values = { ...input, password: "" };
  const errors = validatePerson(input, { requirePassword: true });

  if (Object.keys(errors).length > 0) return { ok: false, errors, values };

  await connectToDatabase();
  const email = input.email.trim().toLowerCase();

  if (await User.exists({ email })) {
    return {
      ok: false,
      values,
      errors: { email: "Somebody already uses that email." },
    };
  }

  const role = input.role as Role;
  const created = await User.create({
    name: input.name.trim(),
    email,
    phone: input.phone.trim(),
    passwordHash: await hashPassword(input.password ?? ""),
    role,
    status: "active",
    assignments: assignmentsFrom(formData, role),
    // An admin typed this password, so it is already known to someone else.
    mustChangePassword: true,
    createdBy: admin.id,
  });

  await writeAudit(admin, {
    action: "user.create",
    targetType: "User",
    targetId: String(created._id),
    summary: `Created ${created.name} as ${ROLE_LABEL[role].toLowerCase()}`,
  });

  revalidatePath("/admin/people");
  redirect(`/admin/people/${created._id}`);
}

export async function updatePerson(
  _previous: PersonFormState,
  formData: FormData,
): Promise<PersonFormState> {
  const admin = await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const input = readPerson(formData);
  const values = { ...input, password: "" };
  const errors = validatePerson(input, { requirePassword: false });

  if (Object.keys(errors).length > 0) return { ok: false, errors, values };

  await connectToDatabase();
  const person = await User.findById(id).exec();
  if (!person) return { ok: false, values, errors: { name: "No such person." } };

  const email = input.email.trim().toLowerCase();
  const clash = await User.exists({ email, _id: { $ne: person._id } });
  if (clash) {
    return {
      ok: false,
      values,
      errors: { email: "Somebody already uses that email." },
    };
  }

  const role = input.role as Role;
  const roleChanged = person.role !== role;

  if (roleChanged && String(person._id) === admin.id) {
    return {
      ok: false,
      values,
      errors: { role: "You can't change your own role." },
    };
  }

  const before = person.role;
  person.name = input.name.trim();
  person.email = email;
  person.phone = input.phone.trim();
  person.role = role;
  // `set` rather than assignment: Mongoose's typed DocumentArray isn't a
  // plain array, and replacing it wholesale is how a role change drops the
  // assignments the new role can't hold.
  person.set("assignments", assignmentsFrom(formData, role));
  await person.save();

  await writeAudit(admin, {
    action: roleChanged ? "user.update.role" : "user.update",
    targetType: "User",
    targetId: String(person._id),
    summary: roleChanged
      ? `Changed ${person.name} from ${ROLE_LABEL[before as Role].toLowerCase()} to ${ROLE_LABEL[role].toLowerCase()}`
      : `Updated ${person.name}'s details`,
    meta: roleChanged ? { from: before, to: role } : null,
  });

  revalidatePath("/admin/people");
  revalidatePath(`/admin/people/${id}`);
  return { ok: true, errors: {}, values };
}

/**
 * Suspend or reactivate. Never a delete: removing a teacher would orphan every
 * session they taught and every mark they gave. Suspension is reversible and
 * keeps the history intact.
 */
export async function setPersonStatus(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const suspend = formData.get("suspend") === "true";

  if (id === admin.id) {
    // The UI doesn't offer this; the action refuses it anyway.
    redirect(`/admin/people/${id}?error=self`);
  }

  await connectToDatabase();
  const person = await User.findById(id).exec();
  if (!person) redirect("/admin/people");

  person.status = suspend ? "suspended" : "active";
  if (suspend) {
    // Suspension should take effect now, not when their session expires.
    person.failedAttempts = 0;
    person.lockedUntil = null;
  }
  await person.save();

  await writeAudit(admin, {
    action: suspend ? "user.suspend" : "user.reactivate",
    targetType: "User",
    targetId: id,
    summary: `${suspend ? "Suspended" : "Reactivated"} ${person.name}`,
  });

  revalidatePath("/admin/people");
  revalidatePath(`/admin/people/${id}`);
}

/** Hand out a new temporary password, flagged so they must replace it. */
export async function resetPersonPassword(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");

  if (password.length < 8) redirect(`/admin/people/${id}?error=password`);

  await connectToDatabase();
  const person = await User.findById(id).exec();
  if (!person) redirect("/admin/people");

  person.passwordHash = await hashPassword(password);
  person.mustChangePassword = true;
  person.failedAttempts = 0;
  person.lockedUntil = null;
  await person.save();

  await writeAudit(admin, {
    action: "user.resetPassword",
    targetType: "User",
    targetId: id,
    summary: `Reset ${person.name}'s password`,
  });

  redirect(`/admin/people/${id}?done=password`);
}

function readPerson(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    role: String(formData.get("role") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
}

/**
 * Assignments as the *new* role can hold them. A program manager owns whole
 * programs; a teacher owns batches inside them; admins and students hold none.
 *
 * **A teacher with no batches ticked under a program still gets the whole
 * program**, because an empty `batches` list means every cohort — see
 * models/User.ts. That is deliberate rather than a gap: this form is the
 * admin's blunt instrument ("this person teaches on these programs"), and the
 * batch screens are where staffing is done cohort by cohort. Making an empty
 * tick mean "nothing" instead would turn a program somebody ticked into an
 * assignment that grants them nothing, which is not what ticking it says.
 */
function assignmentsFrom(formData: FormData, role: Role) {
  if (!isRole(role)) return [];

  const kind = assignmentKindFor(role);
  if (kind === "none") return [];

  const programs = formData.getAll("programs").map(String).filter(Boolean);

  if (kind === "programs") {
    return programs.map((programSlug) => ({
      programSlug,
      courseIds: [],
      batches: [],
    }));
  }

  // Teachers: batches are submitted as "<programSlug>:<batchName>" so one field
  // carries both halves and the pairs can't be mismatched on the way in. A
  // batch name may itself contain a colon ("Aug 2026 · 6:30pm"), so the split
  // is on the *first* one only — `slice`, never `split(":")[1]`.
  const pairs = formData.getAll("batches").map(String).filter(Boolean);

  return programs.map((programSlug) => ({
    programSlug,
    courseIds: [],
    batches: pairs
      .filter((pair) => pair.startsWith(`${programSlug}:`))
      .map((pair) => pair.slice(programSlug.length + 1)),
  }));
}
