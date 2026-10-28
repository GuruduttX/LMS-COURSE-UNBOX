import { History, Paperclip } from "lucide-react";

import { formatDate } from "@/lib/curriculum/format";
import { SUBMISSION_FORMAT_LABEL } from "@/lib/curriculum/submission-formats";
import type { SubmissionVersionView } from "@/lib/curriculum/types";

/**
 * Every version of a hand-in that was sent back, oldest first.
 *
 * No hooks and no `"use client"`, so the student's dialog (a client island) and
 * the teacher's grading queue (a server component) render the same list — the
 * two of them disagreeing about what version 1 was would be a strange thing to
 * have to explain.
 *
 * A native `<details>`, closed: history answers "what happened before?", which
 * is worth one tap, not the top of the screen. What matters now — the mark, or
 * the request — is always shown above it, open.
 */
export function SubmissionHistory({
  history,
}: {
  history: readonly SubmissionVersionView[];
}) {
  if (history.length === 0) return null;

  return (
    <details className="group rounded-lg border border-border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50">
        <History size={16} aria-hidden className="text-ink-500" />
        Earlier versions ({history.length})
      </summary>

      <ol className="divide-y divide-border border-t border-border">
        {history.map((entry) => (
          <li key={entry.version} className="space-y-1.5 p-3 text-sm">
            <p className="font-semibold text-ink-900">
              Version {entry.version}
              <span className="font-normal text-ink-500">
                {" · submitted "}
                {formatDate(entry.submittedAt)}
              </span>
            </p>

            <a
              href={entry.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 text-2xs font-semibold text-brand-600 hover:underline"
            >
              <Paperclip size={12} aria-hidden className="shrink-0" />
              <span className="truncate">{entry.file?.name ?? entry.fileUrl}</span>
              <span className="shrink-0 font-normal text-ink-500">
                · {SUBMISSION_FORMAT_LABEL[entry.format]}
              </span>
            </a>

            <p className="text-2xs text-ink-600">
              {entry.scored !== null ? (
                <>
                  Graded{" "}
                  <span className="font-bold tabular-nums text-ink-900">
                    {entry.scored} / {entry.maxMarks}
                  </span>
                  {entry.evaluatedAt ? ` on ${formatDate(entry.evaluatedAt)}` : ""}
                  {" · "}
                </>
              ) : (
                "Not graded · "
              )}
              resubmission requested {formatDate(entry.resubmissionRequestedAt)}
            </p>

            {entry.feedback ? (
              <p className="whitespace-pre-line text-2xs text-ink-700">
                <span className="font-semibold text-ink-500">Feedback: </span>
                {entry.feedback}
              </p>
            ) : null}

            {entry.resubmissionReason ? (
              <p className="whitespace-pre-line text-2xs text-ink-700">
                <span className="font-semibold text-ink-500">
                  Reason for resubmission:{" "}
                </span>
                {entry.resubmissionReason}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  );
}
