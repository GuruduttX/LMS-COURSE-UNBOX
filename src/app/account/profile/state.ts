import type { ProfileErrors } from "@/lib/validation/profile";
import type { UploadedFile } from "@/lib/uploads/kinds";

/**
 * Form state for the profile screen. Separate from actions.ts because a
 * `"use server"` file may only export async functions.
 */
export type ProfileState = {
  ok: boolean;
  /** Shown once after a successful save; cleared on the next submit. */
  saved?: boolean;
  errors: ProfileErrors;
};

export const EMPTY_PROFILE_STATE: ProfileState = { ok: false, errors: {} };

/**
 * The profile as the screen needs it — every field a string, because that is
 * what an input holds. The page reads the document; this is the shape it hands
 * to the form.
 */
export type ProfileView = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  avatar: UploadedFile | null;
  qualification: {
    title: string;
    institution: string;
    completedYear: string;
    marks: string;
  };
  experience: {
    hasExperience: boolean;
    role: string;
    company: string;
    duration: string;
  };
  /** ISO, or null on accounts old enough to predate timestamps. */
  joinedAt: string | null;
};
