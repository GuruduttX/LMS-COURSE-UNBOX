/**
 * The kinds of subtopic — the atom of the curriculum tree.
 *
 * Dependency-free and shared by everything: the Mongoose enum, the "add a
 * subtopic" picker, the sidebar icons, and the learning screen's pane switch.
 * Adding a fifth kind is one entry here plus a pane — nothing else enumerates
 * them.
 *
 * A note on `video` and `pdf`: there is no media service yet. Both store a
 * hosted URL string and nothing more — the teacher uploads the file wherever
 * they already keep files, and pastes the link.
 *
 * A note on `video`: there is no media service yet. A video subtopic stores a
 * hosted URL string and nothing more — no upload, no transcode, no quality
 * ladder. See `VideoStage` for the player side of that decision.
 */
import {
  FileText,
  FileType2,
  ListChecks,
  PlayCircle,
  type LucideIcon,
} from "lucide-react";

export const SUBTOPIC_KINDS = ["video", "text", "pdf", "quiz"] as const;

export type SubtopicKind = (typeof SUBTOPIC_KINDS)[number];

/** Singular, as used in a badge, a row, or the "new subtopic" picker. */
export const SUBTOPIC_KIND_LABEL: Record<SubtopicKind, string> = {
  video: "Video",
  text: "Reading",
  pdf: "PDF",
  quiz: "Quiz",
};

/** One line telling a teacher what they are about to author. */
export const SUBTOPIC_KIND_HINT: Record<SubtopicKind, string> = {
  video: "A recorded lecture, hosted elsewhere and linked here.",
  text: "Written material the student reads on screen.",
  pdf: "A hosted PDF, shown in the page and downloadable.",
  quiz: "Multiple-choice questions with an explanation for each.",
};

export const SUBTOPIC_KIND_ICON: Record<SubtopicKind, LucideIcon> = {
  video: PlayCircle,
  text: FileText,
  pdf: FileType2,
  quiz: ListChecks,
};

export function isSubtopicKind(value: unknown): value is SubtopicKind {
  return (
    typeof value === "string" &&
    (SUBTOPIC_KINDS as readonly string[]).includes(value)
  );
}
