"use client";

import { Receipt } from "lucide-react";
import { useCallback, useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import type { StudentFeeRecord } from "@/lib/data/fees";

/**
 * One student's fee ledger, on the staff student page. **Admin only.**
 *
 * The question this answers is not "have they paid" — the roster already says
 * that. It is "what actually happened", asked by whoever is on the phone to a
 * student claiming they were charged twice, or that a payment failed and the
 * money left their account anyway. So it shows **every** row, including the
 * failed and refunded ones that every other reader filters out, and the
 * Razorpay ids needed to look one up on their dashboard.
 *
 * ## Wider than design.md §5 allows, deliberately
 *
 * The rule is "modal max 480px, only for confirms and short focused content;
 * anything longer is a page". A ledger is a table, and a table at 480px is
 * unreadable. The alternative — a real page — is the better answer if this
 * grows filters or a date range; it is a dialog today because it is a lookup
 * somebody does *while reading the student's page*, and sending them somewhere
 * else loses that place. Widened to `2xl` and scrolled internally rather than
 * squeezed. If a fourth column is ever wanted, make it a page instead.
 *
 * ## The data arrives as a prop, already authorised
 *
 * `studentFeeRecord` does the `fee.manage` check server-side and returns null
 * for anyone else, and the screen renders nothing at all in that case. This
 * component never fetches, so there is no endpoint to forget to guard.
 */

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Paise as rupees. Kept local — `money.ts` is server-shaped by convention. */
function rupees(paise: number): string {
  return money.format(paise / 100);
}

function when(value: Date | string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_TONE: Record<string, string> = {
  captured: "bg-success-50 text-success-700",
  created: "bg-ink-100 text-ink-600",
  failed: "bg-danger-50 text-danger-700",
  refunded: "bg-warning-50 text-warning-700",
};

const KIND_LABEL: Record<string, string> = {
  full: "Paid in full",
  emi_upfront: "Down payment + cycle 1",
  emi_cycle: "Instalment",
};

export function FeeRecordDialog({ record }: { record: StudentFeeRecord }) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const close = useCallback(() => setOpen(false), []);

  const { status, rows } = record;

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Receipt size={15} aria-hidden />
        Fee record
      </Button>

      <Modal
        isOpen={open}
        onClose={close}
        labelledBy={headingId}
        className="md:max-w-2xl"
      >
        <div className="border-b border-border p-5">
          <h2 id={headingId} className="text-lg font-bold text-ink-900">
            Fee record
          </h2>
          <p className="mt-0.5 text-sm text-ink-600">
            {record.student.name} · {record.programTitle}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {status.unconfigured ? (
            <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-ink-600">
              This program has no fee set, so nothing is owed and nothing is
              gated.
            </p>
          ) : (
            <>
              {/* The summary every other screen shows, so this dialog and the
                  roster can never quote different numbers — both come from
                  `getFeeStatus`. */}
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Figure label="Total fee" value={rupees(status.totalAmount)} />
                <Figure label="Paid" value={rupees(status.amountPaid)} />
                <Figure
                  label="Balance"
                  value={rupees(status.amountDue)}
                  tone={status.isPaid ? "good" : "warn"}
                />
                <Figure
                  label="Plan"
                  value={status.chosen?.label ?? "—"}
                  hint={
                    status.cyclesTotal > 0
                      ? `${status.cyclesPaid} of ${status.cyclesTotal} instalments`
                      : undefined
                  }
                />
              </dl>

              {status.hasCustomPrice ? (
                <p className="mt-3 rounded-lg bg-warning-50 px-3 py-2 text-xs font-medium text-warning-700">
                  This student is on a custom price set by an admin, not the
                  program&rsquo;s.
                </p>
              ) : null}

              {record.subscriptionId ? (
                <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-xs text-ink-500">
                  <span className="font-semibold text-ink-600">
                    Subscription
                  </span>
                  <code className="font-mono">{record.subscriptionId}</code>
                </p>
              ) : null}

              <h3 className="mt-6 text-xs font-bold uppercase tracking-wide text-ink-500">
                Transactions
              </h3>

              {rows.length === 0 ? (
                <p className="mt-3 rounded-lg border border-border bg-surface-muted p-4 text-sm text-ink-600">
                  Nothing yet — this student has not started a payment.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {rows.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-lg border border-border p-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="inline-flex items-center gap-2">
                          <span className="text-base font-bold text-ink-900">
                            {rupees(row.amount)}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide",
                              STATUS_TONE[row.status] ?? "bg-ink-100 text-ink-600",
                            )}
                          >
                            {row.status}
                          </span>
                          {row.offline ? (
                            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-ink-600">
                              Offline
                            </span>
                          ) : null}
                        </span>

                        <span className="text-xs text-ink-500">
                          {/* `paidAt` on a settled row, otherwise when the
                              attempt was opened — a `created` row has no
                              payment date and never will. */}
                          {row.paidAt ? when(row.paidAt) : when(row.createdAt)}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-ink-600">
                        {KIND_LABEL[row.kind] ?? row.kind}
                        {row.cycleNumber ? ` · cycle ${row.cycleNumber}` : ""}
                        {row.method ? ` · ${row.method}` : ""}
                      </p>

                      {row.failureReason ? (
                        <p className="mt-1.5 text-xs font-medium text-danger-700">
                          {row.failureReason}
                        </p>
                      ) : null}

                      {row.note ? (
                        <p className="mt-1.5 text-xs text-ink-600">{row.note}</p>
                      ) : null}

                      {/* The ids somebody reads back to Razorpay support. Only
                          the ones a row actually has: an abandoned attempt has
                          an order and no payment. */}
                      <dl className="mt-2 space-y-0.5 text-2xs text-ink-500">
                        <IdLine label="Payment" value={row.razorpayPaymentId} />
                        <IdLine label="Order" value={row.razorpayOrderId} />
                        <IdLine
                          label="Subscription"
                          value={row.razorpaySubscriptionId}
                        />
                        <IdLine label="Ledger row" value={row.id} />
                      </dl>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-border p-4">
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
        </div>
      </Modal>
    </>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted p-3">
      <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-500">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-sm font-bold",
          tone === "good" && "text-success-700",
          tone === "warn" && "text-warning-700",
          !tone && "text-ink-900",
        )}
      >
        {value}
      </dd>
      {hint ? <p className="mt-0.5 text-2xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

function IdLine({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="font-semibold">{label}</dt>
      <dd className="font-mono break-all">{value}</dd>
    </div>
  );
}
