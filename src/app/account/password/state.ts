/**
 * Form state for the change-password screen. Separate from actions.ts because a
 * `"use server"` file may only export async functions.
 */
export type PasswordState = {
  ok: boolean;
  errors: {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  };
};

export const EMPTY_PASSWORD_STATE: PasswordState = { ok: false, errors: {} };
