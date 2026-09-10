"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SESSION_KIND_LABEL } from "@/lib/data/session-kinds";
import type { AttendanceSummary } from "@/lib/data/sessions";

/**
 * The attendance headline, plus the breakdown behind "View details".
 *
 * Trigger and dialog live in one client island so the page around them stays a
 * server component — same pattern as the marksheet's graduation criteria.
 *
 * The dialog answers a question the percentage can't: *which* sessions the
 * number is made of. Totals and attended counts are derived in
 * `getCourseSessions`, so this component only formats them.
 */
export function AttendanceBand({ attendance }: { attendance: AttendanceSummary }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-sm font-medium text-ink-600 sm:text-base">
            Session attendance
          </span>
          <span className="text-xl font-extrabold text-ink-900 sm:text-2xl">
            {attendance.percent}%
          </span>
        </p>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="text-brand-600 hover:bg-brand-50 hover:text-brand-700"
        >
          View details
          <ChevronRight size={15} aria-hidden />
        </Button>
      </div>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        labelledBy="attendance-details-title"
      >
        <div className="p-5 sm:p-6">
          <h2
            id="attendance-details-title"
            className="text-base font-bold text-ink-900 sm:text-lg"
          >
            Attendance details
          </h2>

          <dl className="mt-5 space-y-5">
            <div className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-1">
              <dt className="text-sm font-semibold text-ink-600">
                Total sessions
              </dt>
              <dd className="space-y-1">
                {attendance.byKind.map((row) => (
                  <p key={row.kind} className="text-sm text-ink-900">
                    {SESSION_KIND_LABEL[row.kind]} — {row.total}
                  </p>
                ))}
              </dd>
            </div>

            <div className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-1">
              <dt className="text-sm font-semibold text-ink-600">Attendance</dt>
              <dd>
                <p className="text-sm font-bold text-ink-900">
                  {attendance.percent}%
                </p>
                <ul className="mt-2 space-y-1">
                  {attendance.byKind.map((row) => (
                    <li
                      key={row.kind}
                      className="flex flex-wrap items-baseline gap-x-3 text-sm text-ink-700"
                    >
                      <span className="min-w-[9.5rem]">
                        {SESSION_KIND_LABEL[row.kind]}
                      </span>
                      <span className="font-semibold text-ink-900">
                        {row.attended}/{row.total} attended
                      </span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>

          <div className="mt-6 flex justify-end">
            <Button onClick={() => setIsOpen(false)}>Close</Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
