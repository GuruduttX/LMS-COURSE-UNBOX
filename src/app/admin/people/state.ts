import type { PersonErrors, PersonInput } from "@/lib/validation/user";

/** Form state for the create/edit person forms. (`"use server"` files may only
 *  export async functions, so this can't live in actions.ts.) */
export type PersonFormState = {
  ok: boolean;
  errors: PersonErrors;
  values: PersonInput;
};

export const EMPTY_PERSON_FORM: PersonFormState = {
  ok: false,
  errors: {},
  values: { name: "", email: "", phone: "", role: "", password: "" },
};
