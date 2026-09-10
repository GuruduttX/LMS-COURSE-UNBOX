"use client";

import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";

import type { FileKind } from "@/lib/uploads/kinds";

/**
 * The document viewer, kept off the server.
 *
 * `"use client"` alone is not enough: a client component is still rendered once
 * on the server for the initial HTML, and pdf.js reaches for `DOMMatrix` the
 * moment it is imported. That threw during SSR and turned the whole learn route
 * into a 500 — invisibly, because the page then hydrated and looked correct in
 * the browser. `ssr: false` is what actually keeps the parser in the browser,
 * and it has to live in a client component because a server component may not
 * pass `ssr: false` to `dynamic`.
 *
 * Hence this file: a boundary, and nothing else. The viewer itself is
 * `MaterialDocument`.
 */
const MaterialDocument = dynamic(
  () => import("./MaterialDocument").then((module) => module.MaterialDocument),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-ink-50 text-sm text-ink-500">
        <Loader2 size={16} aria-hidden className="animate-spin" />
        Opening the document…
      </div>
    ),
  },
);

export function MaterialViewer(props: {
  url: string;
  kind: FileKind;
  title: string;
  /**
   * Called with whether the last page is the one on screen. Only a PDF can
   * answer it — a Word file is one continuous scroll — and only the learning
   * screen asks, so that a reading records itself complete when it has been
   * got to the end of.
   */
  onReachedEnd?: (atEnd: boolean) => void;
}) {
  return <MaterialDocument {...props} />;
}
