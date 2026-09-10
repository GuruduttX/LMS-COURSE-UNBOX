/**
 * Rules for creating and editing a person, shared by the admin forms and the
 * actions behind them — same arrangement as validation/enquiry.ts.
 */
import { isRole, type Role } from "@/lib/auth/roles";

import { validateEmail, validateNewPassword } from "./auth";

export type PersonInput = {
  name: string;
  email: string;
  phone: string;
  role: string;
  /** Only when creating; an edit never touches the password. */
  password?: string;
};

export type PersonErrors = Partial<Record<keyof PersonInput, string>>;

/**
 * Name and phone, as the person themselves types them.
 *
 * Shared with `validatePerson` rather than duplicated: an admin editing someone
 * and that someone editing themselves must agree about what a valid name and
 * number are. Only the wording differs — "their name" vs "your name".
 */
export function validateOwnDetails(input: {
  name: string;
  phone: string;
}): Pick<PersonErrors, "name" | "phone"> {
  const errors: Pick<PersonErrors, "name" | "phone"> = {};

  const name = input.name.trim();
  if (!name) {
    errors.name = "Enter your name.";
  } else if (name.length < 2) {
    errors.name = "That name looks too short.";
  } else if (name.length > 80) {
    errors.name = "Keep this under 80 characters.";
  }

  // Optional — but if given, it has to be a real number, because it is what a
  // program manager will actually ring.
  const phone = input.phone.replace(/[\s()-]/g, "").replace(/^(\+?91)/, "");
  if (phone && !/^[6-9]\d{9}$/.test(phone)) {
    errors.phone = "Enter a 10-digit Indian mobile number, or leave it blank.";
  }

  return errors;
}

export function validatePerson(
  input: PersonInput,
  options: { requirePassword: boolean },
): PersonErrors {
  const errors: PersonErrors = {};

  const own = validateOwnDetails(input);
  // An admin is filling this in *about* someone else.
  if (own.name) errors.name = own.name.replace("your name", "their name");
  if (own.phone) errors.phone = own.phone;

  const email = validateEmail(input.email);
  if (email) errors.email = email;

  if (!isRole(input.role)) {
    errors.role = "Pick a role.";
  }

  if (options.requirePassword) {
    const password = validateNewPassword(input.password ?? "");
    if (password) errors.password = password;
  }

  return errors;
}

/**
 * Which roles may hold assignments, and to what.
 *
 * The two staff roles differ now, and the difference is the point:
 *
 * - A **program manager** runs whole programs. Every cohort of a program they
 *   manage is theirs, because batches are a thing they create rather than a
 *   thing they are given.
 * - A **teacher** is assigned to **batches**, because a program runs several
 *   cohorts at once and one teacher rarely takes all of them. Ticking a program
 *   with no batches under it still means every batch — the convention from
 *   models/User.ts, and the reading every existing assignment already has.
 *
 * What a teacher's batches do *not* narrow is the curriculum: the courses of a
 * program are shared by all its cohorts, so anyone teaching any of them authors
 * the lot. (`Assignment.courseIds` still exists and `ownsCourse` still honours
 * it, so a narrower content scope remains expressible; nothing in the UI sets
 * one.)
 */
export function assignmentKindFor(
  role: Role,
): "programs" | "batches" | "none" {
  if (role === "program_manager") return "programs";
  if (role === "teacher") return "batches";
  // An admin runs everything and a student is enrolled, not assigned.
  return "none";
}
