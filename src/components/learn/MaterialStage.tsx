import { Download } from "lucide-react";

import { FILE_KIND_ICON } from "@/components/ui/AttachmentLink";
import { FILE_KIND_SPECS, formatBytes, type UploadedFile } from "@/lib/uploads/kinds";

import { MaterialViewer } from "./MaterialViewer";

/**
 * A module's study material, in the pane — not in a new tab, and not in
 * somebody else's viewer.
 *
 * The document is part of the module, so it is read where the lessons are read.
 * Sending a student out to a browser tab loses the outline, the course header
 * and their place in it, which is the whole point of the screen.
 *
 * This is the server half: the heading, the download, and the frame around the
 * document. The rendering itself is `MaterialViewer`, a client component,
 * because pdf.js and docx-preview both need the browser.
 *
 * The **title is the teacher's**, never the filename: `Q3 notes FINAL v2 (1).pdf`
 * is what it was called on their laptop, not what the reading is. The filename
 * survives only as the download name, which is where it belongs.
 *
 * Download sits beside the title and is not decoration — it is what makes the
 * viewer's failure case survivable. See `ViewerError`.
 */
export function MaterialStage({
  file,
  title,
}: {
  file: UploadedFile;
  title: string;
}) {
  const Icon = FILE_KIND_ICON[file.kind];

  return (
    <div className="flex h-full flex-col px-4 py-4 md:px-6">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 pb-3">
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
            Study material
          </p>
          <h1 className="mt-0.5 flex items-center gap-2 text-base font-bold text-ink-900">
            <Icon size={18} aria-hidden className="shrink-0 text-ink-500" />
            <span className="min-w-0 truncate">{title}</span>
          </h1>
        </div>

        <a
          href={file.url}
          download={file.name}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
        >
          <Download size={14} aria-hidden />
          Download
          <span className="font-normal text-ink-500">
            ({FILE_KIND_SPECS[file.kind].label} · {formatBytes(file.bytes)})
          </span>
        </a>
      </div>

      {/* Keyed on the URL so replacing the file mounts a fresh viewer rather
          than leaving the previous document's page count on screen. */}
      <MaterialViewer
        key={file.url}
        url={file.url}
        kind={file.kind}
        title={title}
      />
    </div>
  );
}
