/**
 * The shape the login form and the sign-in action pass between them.
 *
 * Its own module because a `"use server"` file may only export async functions —
 * a type is fine, but the initial-state object next to it is a build error.
 */
export type SignInState = {
  ok: boolean;
  errors: { email?: string; password?: string; form?: string };
  values: { email: string };
};

export const EMPTY_SIGN_IN_STATE: SignInState = {
  ok: false,
  errors: {},
  values: { email: "" },
};
