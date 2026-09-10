/**
 * What a task can ask a student to hand back.
 *
 * Deliberately **its own vocabulary**, not `SUBMISSION_FORMATS` from
 * `curriculum/submission-formats.ts`. That list exists to describe a graded
 * assignment's hand-in — it carries `zip`, it maps onto a `Submission` row with
 * a mark out of `ASSIGNMENT_MAX`, and it is what the marksheet reads. A task is
 * not graded and nothing unlocks from one, so reusing that enum would have tied
 * a task's shape to the curriculum's rules and put `zip` in a picker that has
 * nowhere to put a zip.
 *
 * Three kinds, and the third is the odd one:
 *
 * - `document` and `image` are **uploads**, each backed by a `FileKind`, so the
 *   same signed-upload path and the same `parseUploadedFiles` check apply.
 * - `link` is a **URL the student pastes**, which is how work that does not fit
 *   in a file — a live landing page, a Drive folder, an ad account screenshot
 *   shared from somewhere else — gets handed in at all.
 *
 * Pure and dependency-free (types only), so the composer, the student's form,
 * the action and the model all read the same list.
 */
import type { FileKind } from "@/lib/uploads/kinds";

export const TASK_SUBMISSION_KINDS = ["document", "image", "link"] as const;

export type TaskSubmissionKind = (typeof TASK_SUBMISSION_KINDS)[number];

export const TASK_SUBMISSION_LABEL: Record<TaskSubmissionKind, string> = {
  document: "A document",
  image: "An image",
  link: "A link to their work",
};

/** The line under each checkbox in the composer — what the student will get. */
export const TASK_SUBMISSION_HINT: Record<TaskSubmissionKind, string> = {
  document: "PDF or Word, uploaded here.",
  image: "A WebP image, uploaded here.",
  link: "A URL they paste — a live page, a Drive folder, a shared report.",
};

/**
 * The upload kind behind each, or null for the one that is a URL.
 *
 * Null for `link` is the whole of "a pasted link is not a file we host", stated
 * once, in data — the same shape as `SUBMISSION_FORMAT_KIND`.
 */
export const TASK_SUBMISSION_FILE_KIND: Record<
  TaskSubmissionKind,
  FileKind | null
> = {
  document: "document",
  image: "image",
  link: null,
};

/**
 * The `FileKind`s a task's accepted kinds allow, for the upload field.
 *
 * `document` covers both PDFs and Word files: a student told to hand in a
 * document should not be refused for choosing the wrong one of the two, and the
 * distinction matters to nothing downstream.
 */
export function uploadableFileKinds(
  kinds: readonly TaskSubmissionKind[],
): FileKind[] {
  const allowed: FileKind[] = [];

  if (kinds.includes("document")) allowed.push("pdf", "document");
  if (kinds.includes("image")) allowed.push("image");

  return allowed;
}

/** Which kind an uploaded file counts as. Null for one the task didn't ask for. */
export function kindForFileKind(fileKind: FileKind): TaskSubmissionKind | null {
  if (fileKind === "image") return "image";
  if (fileKind === "pdf" || fileKind === "document") return "document";
  return null;
}

/** "a document or a link" — for the student's copy and the error messages. */
export function describeSubmissionKinds(
  kinds: readonly TaskSubmissionKind[],
): string {
  const labels = kinds.map((kind) =>
    TASK_SUBMISSION_LABEL[kind].replace(/^An? /, "").replace(" to their work", ""),
  );

  if (labels.length === 0) return "nothing";
  if (labels.length === 1) return labels[0];

  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

export function isTaskSubmissionKind(
  value: unknown,
): value is TaskSubmissionKind {
  return (
    typeof value === "string" &&
    (TASK_SUBMISSION_KINDS as readonly string[]).includes(value)
  );
}
