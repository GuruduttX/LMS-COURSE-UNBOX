/**
 * Enquiry validation, shared by the dialog and the API route.
 *
 * The client uses it for instant inline errors; the server runs the exact same
 * rules because client-side validation is a convenience, never a guarantee.
 */
import { COURSES } from "@/lib/data/home";

export const PROGRAM_OPTIONS = [
  ...COURSES.map((course) => course.title),
  "Not sure yet",
] as const;

export type EnquiryInput = {
  fullName: string;
  phone: string;
  email: string;
  program: string;
};

export type EnquiryErrors = Partial<Record<keyof EnquiryInput, string>>;

export const EMPTY_ENQUIRY: EnquiryInput = {
  fullName: "",
  phone: "",
  email: "",
  program: "",
};

/** Indian mobile numbers: 10 digits starting 6–9, ignoring spaces and +91. */
export function normalisePhone(raw: string): string {
  return raw.replace(/[\s()-]/g, "").replace(/^(\+?91)/, "");
}

export function validateEnquiry(input: EnquiryInput): EnquiryErrors {
  const errors: EnquiryErrors = {};

  const name = input.fullName.trim();
  if (!name) {
    errors.fullName = "Please enter your name.";
  } else if (name.length < 2) {
    errors.fullName = "That name looks too short.";
  } else if (name.length > 80) {
    errors.fullName = "Please keep this under 80 characters.";
  }

  const phone = normalisePhone(input.phone);
  if (!phone) {
    errors.phone = "Please enter your mobile number.";
  } else if (!/^[6-9]\d{9}$/.test(phone)) {
    errors.phone = "Enter a 10-digit Indian mobile number.";
  }

  const email = input.email.trim();
  if (!email) {
    errors.email = "Please enter your email.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    errors.email = "That email address doesn't look right.";
  }

  if (!input.program) {
    errors.program = "Pick a program, or choose “Not sure yet”.";
  } else if (!PROGRAM_OPTIONS.includes(input.program as never)) {
    errors.program = "Pick a program from the list.";
  }

  return errors;
}

export function hasErrors(errors: EnquiryErrors): boolean {
  return Object.keys(errors).length > 0;
}
