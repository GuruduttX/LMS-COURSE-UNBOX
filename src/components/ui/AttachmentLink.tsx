import { Download, FileText, ImageIcon } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatBytes, type FileKind, type UploadedFile } from "@/lib/uploads/kinds";

/**
 * One uploaded file, offered as a link.
 *
 * The same file is shown in four places — the module page a teacher authors,
 * the course listing a student browses, the lesson sidebar they work in, and
 * the picker that uploaded it — and it should read the same in all of them:
 * an icon for the kind, the name the person chose, and how big it is.
 *
 * A **link**, not a viewer. This is the card that offers a file — on a staff
 * page, or beside a form. The one place a student *reads* a document is
 * `MaterialViewer`, which renders it in the page rather than handing it over.
 */

/** Which icon stands for which kind. Shared with the upload picker. */
export const FILE_KIND_ICON: Record<FileKind, typeof FileText> = {
  image: ImageIcon,
  photo: ImageIcon,
  pdf: FileText,
  document: FileText,
};

export function AttachmentLink({
  file,
  caption,
  variant = "card",
  className,
}: {
  file: UploadedFile;
  /** What this file *is* — "Study material", "The brief document". */
  caption?: string;
  /** `strip` is the one-line form for a row that is already a link elsewhere. */
  variant?: "card" | "strip";
  className?: string;
}) {
  const Icon = FILE_KIND_ICON[file.kind];

  // `download` asks for the original name rather than the slugged public id.
  // Cloudinary's raw delivery already sends one, so this is belt and braces.
  const common = {
    href: file.url,
    download: file.name,
    target: "_blank",
    rel: "noopener noreferrer",
  } as const;

  if (variant === "strip") {
    return (
      <a
        {...common}
        className={cn(
          "flex items-center gap-2 border-t border-border px-4 py-2 text-2xs font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900",
          className,
        )}
      >
        <Icon size={14} aria-hidden className="shrink-0 text-brand-600" />
        <span className="min-w-0 truncate">
          {caption ? `${caption}: ` : ""}
          {file.name}
        </span>
        <span className="shrink-0 text-ink-400">{formatBytes(file.bytes)}</span>
        <Download size={14} aria-hidden className="shrink-0 text-ink-400" />
      </a>
    );
  }

  return (
    <a
      {...common}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-ink-50 p-3 transition-colors hover:border-border-strong hover:bg-surface",
        className,
      )}
    >
      <Icon size={18} aria-hidden className="shrink-0 text-brand-600" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink-900">
          {file.name}
        </span>
        <span className="block text-2xs text-ink-500">
          {caption ? `${caption} · ` : ""}
          {formatBytes(file.bytes)}
        </span>
      </span>
      <Download size={16} aria-hidden className="shrink-0 text-ink-500" />
    </a>
  );
}
