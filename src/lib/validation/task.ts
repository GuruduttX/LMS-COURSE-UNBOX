/**
 * Rules for setting a task, shared by the composer and the action.
 *
 * Pure — no database, no auth, no `server-only` — so the client island imports
 * it and a missing title is caught before a round trip, and the action imports
 * the same functions because client validation is a convenience, never a
 * guarantee. Same pattern as `validation/batch.ts` and `validation/enquiry.ts`.
 *
 * What is *not* here: whether the program exists, whether the named student is
 * enrolled on it, and whether the attached file is one we hosted. Only the
 * database can answer the first two and only `parseUploadedFiles` the third, so
 * the action does all three.
 */
import {
  TASK_SUBMISSION_KINDS,
  isTaskSubmissionKind,
  type TaskSubmissionKind,
} from "@/lib/tasks/submission-kinds";
import { TASK_AUDIENCES, type TaskAudience } from "@/lib/tasks/audiences";

export type TaskLinkInput = { label: string; url: string };

export type TaskInput = {
  programSlug: string;
  audience: TaskAudience;
  /** Empty unless `audience` is "batch" — then it is a `Batch.name`. */
  batch: string;
  /** Empty unless `audience` is "student". */
  studentId: string;
  title: string;
  description: string;
  /** Whether a document came with it — the composer's checkbox, in effect. */
  hasDocument: boolean;
  links: TaskLinkInput[];
  /** What the student hands back. Empty means nothing is expected. */
  submissionKinds: TaskSubmissionKind[];
  /** Shown above the student's submission field. Ignored when nothing is asked. */
  submissionNote: string;
};

export type TaskErrors = Partial<
  Record<
    | "programSlug"
    | "audience"
    | "batch"
    | "studentId"
    | "title"
    | "description"
    | "links"
    | "submissionKinds"
    | "submissionNote",
    string
  >
>;

export const MAX_SUBMISSION_NOTE = 600;

export const MAX_TASK_LINKS = 8;

export const EMPTY_TASK: TaskInput = {
  programSlug: "",
  audience: "program",
  batch: "",
  studentId: "",
  title: "",
  description: "",
  hasDocument: false,
  links: [],
  submissionKinds: [],
  submissionNote: "",
};

/**
 * A task needs an instruction, and a document counts as one.
 *
 * The same call `Assignment` makes about `brief` / `briefFile`: a teacher whose
 * task *is* the attached PDF should not have to retype it into the box, and a
 * rule demanding both is one people satisfy by typing "see attached".
 */
export function validateTask(input: TaskInput): TaskErrors {
  const errors: TaskErrors = {};

  if (!input.programSlug) errors.programSlug = "Pick a program.";

  if (!TASK_AUDIENCES.includes(input.audience)) {
    errors.audience = "Say who this is for.";
  }

  if (input.audience === "batch" && !input.batch) {
    errors.batch = "Pick the batch this is for.";
  }

  if (input.audience === "student" && !input.studentId) {
    errors.studentId = "Pick the student this is for.";
  }

  const title = input.title.trim();
  if (!title) {
    errors.title = "Give the task a title.";
  } else if (title.length > 140) {
    errors.title = "Keep the title under 140 characters.";
  }

  const description = input.description.trim();
  if (!description && !input.hasDocument) {
    errors.description =
      "Describe the task, or attach a document that does — a task with neither says nothing.";
  } else if (description.length > 20_000) {
    errors.description = "That description is too long.";
  }

  const linkError = validateLinks(input.links);
  if (linkError) errors.links = linkError;

  const unknown = input.submissionKinds.filter((kind) => !isTaskSubmissionKind(kind));
  if (unknown.length > 0 || input.submissionKinds.length > TASK_SUBMISSION_KINDS.length) {
    errors.submissionKinds = "That isn't a way work can be handed in.";
  }

  /**
   * A note with nothing to attach it to is the one combination worth refusing.
   * It would be written expecting a student to read it above a field that is
   * never rendered — silently lost advice, which is worse than a form that says
   * so. The reverse (kinds, no note) is fine and common.
   */
  if (input.submissionNote.trim() && input.submissionKinds.length === 0) {
    errors.submissionNote =
      "This note only appears above the hand-in field, so pick what students submit — or clear the note.";
  } else if (input.submissionNote.trim().length > MAX_SUBMISSION_NOTE) {
    errors.submissionNote = `Keep the submission note under ${MAX_SUBMISSION_NOTE} characters.`;
  }

  return errors;
}

/**
 * The composer posts the picked kinds as JSON, the same one-hidden-field
 * pattern as the links — and unknown entries are dropped here rather than
 * carried through to `validateTask`, so a stale client sending a kind we have
 * since removed loses that option instead of failing the whole save.
 */
export function parseSubmissionKinds(raw: string): TaskSubmissionKind[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];

    // Ordered by our own list, not the click order, so two tasks asking for the
    // same things always read the same way on the student's screen.
    return TASK_SUBMISSION_KINDS.filter((kind) => parsed.includes(kind));
  } catch {
    return [];
  }
}

/**
 * Resource links: http(s) only, and a label each.
 *
 * The scheme check is the security-shaped one — a stored `javascript:` URL
 * rendered into an `href` on a page students open is the whole of that bug, and
 * refusing it here means no renderer has to remember to.
 */
export function validateLinks(links: TaskLinkInput[]): string | null {
  const filled = links.filter((link) => link.label.trim() || link.url.trim());

  if (filled.length > MAX_TASK_LINKS) {
    return `Up to ${MAX_TASK_LINKS} links.`;
  }

  for (const link of filled) {
    if (!link.url.trim()) return "Every link needs a URL.";
    if (!link.label.trim()) return "Every link needs a label, so students know what it is.";
    if (!isHttpUrl(link.url.trim())) {
      return "Links must start with http:// or https://.";
    }
    if (link.label.trim().length > 120) return "Keep link labels under 120 characters.";
    if (link.url.trim().length > 2000) return "That URL is too long.";
  }

  return null;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Drop the blank rows the composer leaves behind, and trim what is left. */
export function cleanLinks(links: TaskLinkInput[]): TaskLinkInput[] {
  return links
    .filter((link) => link.label.trim() || link.url.trim())
    .map((link) => ({ label: link.label.trim(), url: link.url.trim() }));
}

/**
 * The composer posts its links as JSON in one hidden field — the
 * `QuestionBuilder` / `FileUpload` pattern — so the action parses one field
 * rather than `links[0][url]` name soup, and the payload matches `TaskLinkInput`
 * exactly so this same validator runs on both sides.
 */
export function parseLinks(raw: string): TaskLinkInput[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];

    return parsed.slice(0, MAX_TASK_LINKS + 1).map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      return {
        label: typeof item.label === "string" ? item.label : "",
        url: typeof item.url === "string" ? item.url : "",
      };
    });
  } catch {
    return [];
  }
}

/* ----------------------------- the student's side ---------------------------- */

export type TaskSubmissionInput = {
  /** Where the work is: the pasted URL, or the uploaded file's URL. */
  url: string;
  note: string;
};

export type TaskSubmissionErrors = Partial<Record<"url" | "note", string>>;

export const EMPTY_TASK_SUBMISSION: TaskSubmissionInput = { url: "", note: "" };

/**
 * A hand-in against what its task asked for.
 *
 * `uploaded` says an upload came through the file field, and it is passed
 * separately rather than inferred from `url` because the two failure messages
 * differ: an empty upload field and an unparseable link are different mistakes
 * and a student fixes them differently. When a file is there the URL is ours,
 * so the http(s) check is only ever run against something a person typed.
 *
 * The scheme check is the security-shaped one, for the same reason as the
 * task's resource links: a stored `javascript:` URL rendered into an `href` on
 * a teacher's screen is the whole of that bug, and refusing it here means no
 * renderer has to remember to.
 */
export function validateTaskSubmission(
  input: TaskSubmissionInput,
  options: { uploaded: boolean; accepts: readonly TaskSubmissionKind[] },
): TaskSubmissionErrors {
  const errors: TaskSubmissionErrors = {};
  const url = input.url.trim();

  if (options.accepts.length === 0) {
    errors.url = "This task doesn't ask for anything to be handed in.";
    return errors;
  }

  if (!url) {
    errors.url = options.accepts.includes("link")
      ? "Attach your work, or paste a link to it."
      : "Attach your work.";
  } else if (!options.uploaded && !isHttpUrl(url)) {
    errors.url = "That link must start with http:// or https://.";
  } else if (!options.uploaded && !options.accepts.includes("link")) {
    errors.url = "This task takes an uploaded file, not a link.";
  } else if (url.length > 2000) {
    errors.url = "That URL is too long.";
  }

  if (input.note.trim().length > MAX_SUBMISSION_NOTE) {
    errors.note = `Keep your note under ${MAX_SUBMISSION_NOTE} characters.`;
  }

  return errors;
}

export function hasTaskErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean);
}
