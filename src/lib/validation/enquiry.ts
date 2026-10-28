/**
 * Enquiry validation, shared by the dialog and the API route.
 *
 * The client uses it for instant inline errors; the server runs the exact same
 * rules because client-side validation is a convenience, never a guarantee.
 */
/**
 * Always offered, whatever programs exist.
 *
 * A visitor who does not yet know which program they want is the *typical*
 * enquiry, not an edge case, and a dropdown that forces them to name one
 * produces a lead that says something they did not mean.
 */
export const NOT_SURE = "Not sure yet";

/** What the dropdown offers: the published programs, plus the escape hatch. */
export function programOptions(programs: readonly string[]): string[] {
  return [...programs, NOT_SURE];
}

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

/**
 * The same rules on both sides, with one deliberate asymmetry in the last field.
 *
 * Given `programs` — the client, which has the published titles as a prop — the
 * program must be one of them or `NOT_SURE`, so a typo in a `<select>` is caught
 * inline. Without them, the rule is only that something plausible was said.
 *
 * **The server calls it without the list, on purpose.** An enquiry is a lead. A
 * visitor whose page loaded ninety seconds before an admin renamed a program
 * would otherwise get a validation error on a field they filled in correctly,
 * and the cost of that is a lost sale against a benefit of tidier text in a
 * column that is already free-form (`models/Enquiry.ts`). Pass `programs` on the
 * server only if you would rather lose the lead than the tidiness.
 */
export function validateEnquiry(
  input: EnquiryInput,
  options: { programs?: readonly string[] } = {},
): EnquiryErrors {
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

  const program = input.program.trim();
  if (!program) {
    errors.program = `Pick a program, or choose “${NOT_SURE}”.`;
  } else if (options.programs) {
    if (!programOptions(options.programs).includes(program)) {
      errors.program = "Pick a program from the list.";
    }
  } else if (program.length > 140) {
    errors.program = "Pick a program from the list.";
  }

  return errors;
}

export function hasErrors(errors: EnquiryErrors): boolean {
  return Object.keys(errors).length > 0;
}
