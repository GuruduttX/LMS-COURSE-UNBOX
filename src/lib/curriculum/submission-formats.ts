/**
 * The file formats a teacher can accept for an assignment.
 *
 * The program's creator decides what a hand-in looks like — a zip of source
 * files, a PDF report, a screenshot, a Word document — so this list feeds the
 * Mongoose enum, the teacher's checkbox group, the student's "accepted formats"
 * line, and the validator that checks a submission against it.
 *
 * ## Upload for three of them, a link for the fourth
 *
 * Three formats can be uploaded to Cloudinary, so for those the accepted list
 * is a real rule: the file picker only offers them and the server re-checks
 * what came back. **ZIP archives are deliberately not uploaded** — an
 * assignment accepting one has to accept a link to it, and there the format is
 * only ever guidance: we can check it when the URL happens to end in a file
 * extension, and a Drive or Dropbox link tells us nothing. The UI has to say
 * which of the two situations a student is in rather than implying we verified
 * anything. `EXTENSIONS` is what makes the best-effort check possible.
 */
import type { FileKind } from "@/lib/uploads/kinds";
import {
  FileArchive,
  FileImage,
  FileText,
  FileType,
  type LucideIcon,
} from "lucide-react";

export const SUBMISSION_FORMATS = ["zip", "pdf", "image", "docx"] as const;

export type SubmissionFormat = (typeof SUBMISSION_FORMATS)[number];

export const SUBMISSION_FORMAT_LABEL: Record<SubmissionFormat, string> = {
  zip: "ZIP archive",
  pdf: "PDF",
  image: "Image",
  docx: "Word document",
};

/** Lower-case, no leading dot. Used for the best-effort URL check only. */
export const SUBMISSION_FORMAT_EXTENSIONS: Record<
  SubmissionFormat,
  readonly string[]
> = {
  zip: ["zip", "rar", "7z", "tar", "gz"],
  pdf: ["pdf"],
  image: ["png", "jpg", "jpeg", "webp", "avif", "gif", "heic"],
  docx: ["doc", "docx", "odt", "rtf"],
};

export const SUBMISSION_FORMAT_ICON: Record<SubmissionFormat, LucideIcon> = {
  zip: FileArchive,
  pdf: FileText,
  image: FileImage,
  docx: FileType,
};

/**
 * The upload kind behind each format, or null for one we cannot host.
 *
 * The bridge between what a teacher accepts (`SubmissionFormat`) and what the
 * upload field can take (`FileKind`). Null for `zip` — that is the whole of
 * "zips are not uploaded to Cloudinary", stated once, in data.
 */
export const SUBMISSION_FORMAT_KIND: Record<SubmissionFormat, FileKind | null> = {
  zip: null,
  pdf: "pdf",
  image: "image",
  docx: "document",
};

/** The kinds an assignment's accepted formats allow a student to upload. */
export function uploadableKinds(
  formats: readonly SubmissionFormat[],
): FileKind[] {
  return formats.flatMap((format) => {
    const kind = SUBMISSION_FORMAT_KIND[format];
    return kind ? [kind] : [];
  });
}

/** Back the other way: what an uploaded file counts as when it is handed in. */
export function formatForKind(kind: FileKind): SubmissionFormat | null {
  return (
    SUBMISSION_FORMATS.find(
      (format) => SUBMISSION_FORMAT_KIND[format] === kind,
    ) ?? null
  );
}

/** Formats that can only ever arrive as a link — today, just the zip. */
export function linkOnlyFormats(
  formats: readonly SubmissionFormat[],
): SubmissionFormat[] {
  return formats.filter((format) => SUBMISSION_FORMAT_KIND[format] === null);
}

export function isSubmissionFormat(value: unknown): value is SubmissionFormat {
  return (
    typeof value === "string" &&
    (SUBMISSION_FORMATS as readonly string[]).includes(value)
  );
}

/** "PDF or ZIP archive" — for the line telling a student what to hand in. */
export function formatList(formats: readonly SubmissionFormat[]): string {
  const labels = formats.map((format) => SUBMISSION_FORMAT_LABEL[format]);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

/**
 * The extension at the end of a URL, if it has one.
 *
 * Returns null for the common case of a share link with no filename in it,
 * which callers must treat as "can't tell", never as "wrong format".
 */
export function extensionFromUrl(url: string): string | null {
  const path = url.split(/[?#]/)[0] ?? "";
  const match = /\.([a-z0-9]{1,5})$/i.exec(path.trim());
  return match ? match[1].toLowerCase() : null;
}
