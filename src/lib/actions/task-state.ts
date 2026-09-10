/**
 * The shape the task composer passes to `useActionState`.
 *
 * Separate from `actions/tasks.ts` because a `"use server"` module may only
 * export async functions — a seed object exported from there is a build error,
 * not a style choice. Same split as `curriculum-state.ts`.
 */
import {
  EMPTY_TASK,
  EMPTY_TASK_SUBMISSION,
  type TaskErrors,
  type TaskInput,
  type TaskSubmissionErrors,
  type TaskSubmissionInput,
} from "@/lib/validation/task";

export type TaskFormState = {
  ok: boolean;
  errors: TaskErrors;
  values: TaskInput;
  /** Set when the write succeeded, for the confirmation line. */
  message?: string;
};

export const EMPTY_TASK_FORM: TaskFormState = {
  ok: false,
  errors: {},
  values: EMPTY_TASK,
};

/**
 * Shared by delete and by complete/reopen: both are one button, and both can
 * only fail in ways there is nothing to fill back in for.
 */
export type DeleteTaskState = { ok: boolean; error?: string };

export const EMPTY_DELETE_TASK: DeleteTaskState = { ok: false };

/** The student's hand-in form. `error` is the whole-form failure, not a field. */
export type TaskSubmissionFormState = {
  ok: boolean;
  errors: TaskSubmissionErrors;
  values: TaskSubmissionInput;
  message?: string;
  error?: string;
};

export const EMPTY_TASK_SUBMISSION_FORM: TaskSubmissionFormState = {
  ok: false,
  errors: {},
  values: EMPTY_TASK_SUBMISSION,
};
