import {
  EMPTY_SESSION,
  type SessionErrors,
  type SessionInput,
} from "@/lib/validation/session";

/** Form state for scheduling. (`"use server"` files export only functions.) */
export type SessionFormState = {
  ok: boolean;
  /**
   * A problem with the request as a whole rather than with one field — in
   * practice, Google refusing to mint a Meet link. Kept apart from `errors`
   * because there is no input for the manager to correct.
   */
  error?: string;
  errors: SessionErrors;
  values: SessionInput;
};

export const EMPTY_SESSION_FORM: SessionFormState = {
  ok: false,
  errors: {},
  values: EMPTY_SESSION,
};
