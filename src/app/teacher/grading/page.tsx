import { ClipboardCheck, Paperclip, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SubmissionHistory } from "@/components/dashboard/curriculum/SubmissionHistory";
import { GradeForm } from "@/components/staff/grading/GradeForm";
import { PageHeading } from "@/components/staff/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { requireRole } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/curriculum/format";
import { SUBMISSION_FORMAT_LABEL } from "@/lib/curriculum/submission-formats";
import { gradingQueue, type GradingRow } from "@/lib/data/grading";

/**
 * The grading queue: hand-ins waiting for a mark, oldest first.
 *
 * The nav has pointed here since it was written — `{ label: "Grading", href:
 * "/teacher/grading", … soon: true }` — and this is the screen that lets the
 * `soon` come off. Everything a teacher needs to mark one hand-in is on its
 * card: who handed it in and out of which cohort, where it sits in the
 * programme, the work itself, whatever note they left with it, and the two
 * fields that close it. No drill-down, because marking twenty hand-ins should
 * not be twenty round trips.
 *
 * `?show=all` widens it to include work already marked, which is how a mark
 * gets corrected. Pending stays the default: this is a queue, and a queue that
 * opens full of finished work does not read as one.
 *
 * Per request, always — a queue is stale the moment somebody hands something in.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Grading" };

export default async function GradingPage({
  searchParams,
}: PageProps<"/teacher/grading">) {
  const user = await requireRole("teacher");

  // `requireRole` admits an admin by the superset rule and says nothing about
  // grading. A teacher role that loses the capability should lose the screen,
  // not find it and be refused by the action — see the note in permissions.ts
  // about nav, buttons and guards reading the same map.
  if (!can(user, "submission.grade")) notFound();

  const { show } = await searchParams;
  const includeMarked = show === "all";

  const rows = await gradingQueue(user, { includeMarked });
  const waiting = rows.filter((row) => row.status === "submitted").length;

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeading
        title="Grading"
        description={
          user.role === "admin"
            ? "Hand-ins across every program, oldest first."
            : "Hand-ins from your cohorts, oldest first."
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Tab href="/teacher/grading" isActive={!includeMarked}>
          Awaiting marking{waiting > 0 ? ` (${waiting})` : ""}
        </Tab>
        <Tab href="/teacher/grading?show=all" isActive={includeMarked}>
          All hand-ins
        </Tab>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={
            includeMarked ? "No hand-ins yet" : "Nothing waiting to be marked"
          }
          description={
            includeMarked
              ? "Once a student hands an assignment in it appears here to be marked."
              : "Every hand-in from your cohorts has been marked. New ones land here as they arrive."
          }
        />
      ) : (
        <ul className="space-y-4">
          {rows.map((row) => (
            <li key={row.id}>
              <SubmissionCard row={row} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SubmissionCard({ row }: { row: GradingRow }) {
  const marked = row.status === "evaluated";
  const sentBack = row.status === "resubmission_requested";

  return (
    <article className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink-900">{row.studentName}</p>
          <p className="mt-0.5 text-2xs text-ink-500">
            {row.studentEmail}
            {/* Only when there is one. A student on no cohort is a real state
                — only a program-wide holder can see them at all — and printing
                an empty separator for it looks like a rendering bug. */}
            {row.batch ? ` · ${row.batch}` : ""}
          </p>
        </div>

        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide",
            marked
              ? "bg-success-50 text-success-700"
              : sentBack
                ? "bg-ink-100 text-ink-600"
                : "bg-warning-50 text-warning-700",
          )}
        >
          {marked
            ? `${row.scored} / ${row.maxMarks}`
            : sentBack
              ? "Resubmission requested"
              : row.version > 1
                ? "Resubmitted · awaiting marking"
                : "Awaiting marking"}
        </span>
      </div>

      <p className="mt-2 text-sm font-semibold text-ink-800">
        {row.assignmentTitle}
      </p>
      <p className="mt-0.5 text-2xs text-ink-500">
        {row.programTitle} · {row.courseTitle} · out of {row.maxMarks}
      </p>

      {/* The work. `noopener noreferrer` because this is student-supplied and
          may be a link they pasted rather than a file we host. */}
      <a
        href={row.fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
      >
        <Paperclip size={14} aria-hidden className="shrink-0" />
        <span className="truncate">{row.fileName}</span>
      </a>
      <p className="mt-1 text-2xs text-ink-500">
        {SUBMISSION_FORMAT_LABEL[row.format]}
        {row.version > 1 ? ` · version ${row.version}` : ""} · handed in{" "}
        {formatDate(row.submittedAt)}
        {row.evaluatedAt ? ` · marked ${formatDate(row.evaluatedAt)}` : ""}
      </p>

      {row.note ? (
        <p className="mt-3 rounded-lg bg-surface-muted p-3 text-sm text-ink-700">
          <span className="font-semibold text-ink-500">Their note: </span>
          {row.note}
        </p>
      ) : null}

      {row.history.length > 0 ? (
        <div className="mt-3">
          <SubmissionHistory history={row.history} />
        </div>
      ) : null}

      {/* Sent back: nothing to mark until the student hands in again, so the
          form gives way to what was asked and when. */}
      {sentBack ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-border bg-surface-muted p-3">
          <RotateCcw size={16} aria-hidden className="mt-0.5 shrink-0 text-ink-500" />
          <div className="min-w-0 text-sm text-ink-700">
            <p className="font-semibold text-ink-900">
              Waiting for the student to resubmit
            </p>
            {row.resubmission ? (
              <p className="mt-0.5 text-2xs text-ink-500">
                Requested {formatDate(row.resubmission.requestedAt)}
              </p>
            ) : null}
            {row.resubmission?.reason ? (
              <p className="mt-2 whitespace-pre-line">
                <span className="font-semibold text-ink-500">Your reason: </span>
                {row.resubmission.reason}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <GradeForm row={row} />
      )}
    </article>
  );
}

/** The two views of the queue. A link, not a control — it is a URL. */
function Tab({
  href,
  isActive,
  children,
}: {
  href: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
        isActive
          ? "bg-brand-50 text-brand-700"
          : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
      )}
    >
      {children}
    </Link>
  );
}
