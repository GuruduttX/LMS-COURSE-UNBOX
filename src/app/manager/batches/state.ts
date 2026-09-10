import { EMPTY_BATCH, type BatchErrors, type BatchInput } from "@/lib/validation/batch";

/** Form state for batches. (`"use server"` files export only functions.) */
export type BatchFormState = {
  ok: boolean;
  errors: BatchErrors;
  values: BatchInput;
  /** Set when the write succeeded, for the confirmation line. */
  message?: string;
};

export const EMPTY_BATCH_FORM: BatchFormState = {
  ok: false,
  errors: {},
  values: EMPTY_BATCH,
};
