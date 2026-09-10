/**
 * Rules for the profile someone maintains about themselves.
 *
 * Its own module rather than more of `validation/user.ts`: that file is about
 * what an *admin* may set on an account (role, email, password), and this one
 * is about what the account holder may say about themselves. The one thing both
 * care about — name and phone — is imported, not repeated.
 *
 * Pure and dependency-free, so the form and the server action run the identical
 * rules; the client's copy is for fast inline errors, the server's is the one
 * that decides.
 */
import { validateOwnDetails } from "./user";

export type QualificationInput = {
  title: string;
  institution: string;
  completedYear: string;
  marks: string;
};

export type ExperienceInput = {
  hasExperience: boolean;
  role: string;
  company: string;
  duration: string;
};

export type ProfileInput = {
  name: string;
  phone: string;
  address: string;
  qualification: QualificationInput;
  experience: ExperienceInput;
};

export type ProfileErrors = Partial<{
  name: string;
  phone: string;
  address: string;
  avatar: string;
  qualificationTitle: string;
  institution: string;
  completedYear: string;
  marks: string;
  experienceRole: string;
  company: string;
  duration: string;
}>;

/** The earliest year worth accepting. Anything before this is a typo. */
const MIN_YEAR = 1950;

export function validateProfile(input: ProfileInput): ProfileErrors {
  const errors: ProfileErrors = { ...validateOwnDetails(input) };

  if (input.address.trim().length > 300) {
    errors.address = "Keep this under 300 characters.";
  }

  const qualification = input.qualification;

  if (qualification.title.trim().length > 120) {
    errors.qualificationTitle = "Keep this under 120 characters.";
  }
  if (qualification.institution.trim().length > 120) {
    errors.institution = "Keep this under 120 characters.";
  }
  if (qualification.marks.trim().length > 40) {
    errors.marks = "Keep this short — 78%, 8.4 CGPA, A.";
  }

  const year = qualification.completedYear.trim();
  if (year) {
    const parsed = Number(year);
    // One year ahead, because "graduating in 2026" is a thing people are.
    const latest = new Date().getFullYear() + 1;
    if (!/^\d{4}$/.test(year) || parsed < MIN_YEAR || parsed > latest) {
      errors.completedYear = `Enter a year between ${MIN_YEAR} and ${latest}.`;
    }
  }

  // Nothing under experience is checked unless they said they have some — the
  // fields are still in the DOM when the box is unticked, and half-typed
  // answers behind a "no" are not errors, they are ignored.
  if (input.experience.hasExperience) {
    const { role, company, duration } = input.experience;

    if (!role.trim()) {
      errors.experienceRole = "Enter the role you worked in.";
    } else if (role.trim().length > 100) {
      errors.experienceRole = "Keep this under 100 characters.";
    }

    if (!company.trim()) {
      errors.company = "Enter the company you worked at.";
    } else if (company.trim().length > 100) {
      errors.company = "Keep this under 100 characters.";
    }

    if (!duration.trim()) {
      errors.duration = "Enter how long — 6 months, 2 years.";
    } else if (duration.trim().length > 40) {
      errors.duration = "Keep this short — 6 months, 2 years.";
    }
  }

  return errors;
}

/**
 * What a "no experience" answer stores: the flag, and nothing else.
 *
 * Blanking the other three is deliberate — leaving a company name behind a
 * "no" is how a stale answer reappears the day somebody ticks the box again.
 */
export function normaliseExperience(input: ExperienceInput): ExperienceInput {
  if (!input.hasExperience) {
    return { hasExperience: false, role: "", company: "", duration: "" };
  }

  return {
    hasExperience: true,
    role: input.role.trim(),
    company: input.company.trim(),
    duration: input.duration.trim(),
  };
}
