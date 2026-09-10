/**
 * Credential rules, shared by the login form and the sign-in action — the same
 * arrangement as validation/enquiry.ts. The client validates for instant inline
 * errors; the server runs the identical rules because client-side validation is
 * a convenience, never a guarantee.
 */

export const MIN_PASSWORD_LENGTH = 8;

export type CredentialsInput = { email: string; password: string };
export type CredentialErrors = Partial<Record<keyof CredentialsInput, string>>;

export const EMPTY_CREDENTIALS: CredentialsInput = { email: "", password: "" };

export function validateEmail(raw: string): string | undefined {
  const email = raw.trim();
  if (!email) return "Please enter your email.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    return "That email address doesn't look right.";
  return undefined;
}

/**
 * Used when *setting* a password, not when checking one at login — an existing
 * password shorter than the current rule must still be able to sign in.
 */
export function validateNewPassword(raw: string): string | undefined {
  if (!raw) return "Please enter a password.";
  if (raw.length < MIN_PASSWORD_LENGTH)
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (raw.length > 200) return "That password is too long.";
  if (!/[a-zA-Z]/.test(raw) || !/[0-9]/.test(raw))
    return "Include at least one letter and one number.";
  return undefined;
}

/** Login only checks that something was typed; the hash comparison decides. */
export function validateCredentials(input: CredentialsInput): CredentialErrors {
  const errors: CredentialErrors = {};

  const email = validateEmail(input.email);
  if (email) errors.email = email;

  if (!input.password) errors.password = "Please enter your password.";

  return errors;
}

export function hasErrors(errors: Record<string, unknown>): boolean {
  return Object.keys(errors).length > 0;
}
