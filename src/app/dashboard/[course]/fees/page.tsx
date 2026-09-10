import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Layers,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { PayPanel } from "@/components/dashboard/fees/PayPanel";
import { PlanChooser } from "@/components/dashboard/fees/PlanChooser";
import { Container } from "@/components/ui/Container";
import { studentBatchDeadline } from "@/lib/data/batches";
import { getProgramCurriculum } from "@/lib/data/curriculum-db";
import { getFeeStatus } from "@/lib/data/fees";
import { getStudent } from "@/lib/data/student";
import { formatDate } from "@/lib/curriculum/format";
import { formatPaise } from "@/lib/payments/money";
import { mode } from "@/lib/payments/razorpay";

/**
 * Where a student pays for a program.
 *
 * **Outside the `(paid)` route group on purpose** — this is the one page an
 * unpaid student is allowed to reach, and the gate redirects here. Putting it
 * inside would redirect it to itself.
 *
 * **Paying in full is the default**, so the Pay button is always there — there
 * is no "you must choose first" step to get stuck in. The chooser sits above it
 * offering the program's instalment plans, one of which staff may have
 * recommended; picking one changes what the button asks for.
 *
 * Today every instalment plan renders as configured-but-unavailable, because
 * nothing collects them yet. That is deliberate over hiding them: an admin has
 * agreed those terms with somebody, and a student who was told about a 9-month
 * plan should see it exists rather than conclude they were misled.
 *
 * A student who has already paid is sent to the course rather than shown a
 * receipt: they clicked something that led here, and what they wanted was the
 * course. The receipt belongs on the account screen, which is a later job.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/dashboard/[course]/fees">): Promise<Metadata> {
  const { course } = await params;
  const curriculum = await getProgramCurriculum(course);

  return { title: curriculum ? `Fees — ${curriculum.program.title}` : "Fees" };
}

export default async function FeesPage({
  params,
}: PageProps<"/dashboard/[course]/fees">) {
  const { course } = await params;
  const student = await getStudent();

  const status = await getFeeStatus(student.id, course);
  // No enrolment, or no such program — the same answer either way, as
  // everywhere else on the student side.
  if (!status) notFound();

  // Nothing to pay: either it's settled or fees were never configured. Both
  // mean "go to your course", which is where they were trying to get.
  if (status.isPaid) redirect(`/dashboard/${course}/overview`);

  const curriculum = await getProgramCurriculum(course, { studentId: student.id });
  if (!curriculum) notFound();

  const deadline = await studentBatchDeadline(student.id, course);
  const chosen = status.chosen;
  const paymentsMode = mode();

  const onInstalments = chosen?.kind === "emi";

  /**
   * Whether the standing instruction is already running.
   *
   * Read from the ledger — a settled cycle can only exist if a mandate was
   * authorised — rather than from `Enrollment.razorpaySubscriptionId`, which is
   * set the moment a subscription is *created* and so is also true for a
   * student who opened Checkout and closed it. That one should still see a Pay
   * button; this one must not.
   */
  const mandateLive = onInstalments && status.cyclesPaid > 0;

  /**
   * What pressing Pay collects **today**, which on an instalment plan is not
   * the balance.
   *
   * The first charge is the down payment and the first cycle together, because
   * Razorpay bills an addon inside the authorisation transaction. Showing
   * `amountDue` here — the whole remaining fee — would tell a student on a
   * 9-month plan that they owe ₹54,999 right now.
   */
  const dueNow =
    onInstalments && !mandateLive
      ? (chosen.upfrontAmount ?? 0) + (chosen.cycleAmount ?? 0)
      : status.amountDue;

  const moduleCount = curriculum.courses.reduce(
    (total, item) => total + item.modules.length,
    0,
  );

  return (
    <>
      <DashboardHeader />

      <main id="main" className="flex-1 py-8 md:py-10">
        <Container>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
          >
            <ArrowLeft size={16} aria-hidden />
            Back to dashboard
          </Link>

          <h1 className="mt-4 text-xl font-bold text-ink-900 md:text-2xl">
            Pay for {curriculum.program.title}
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Your seat is held. The course opens as soon as this is paid.
          </p>

          {paymentsMode === "mock" ? <MockNotice /> : null}

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
            {/* What they are buying, before what it costs. */}
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-base font-bold text-ink-900">
                What&rsquo;s included
              </h2>

              <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Fact
                  icon={<Layers size={16} aria-hidden />}
                  label="Courses"
                  value={String(curriculum.courses.length)}
                />
                <Fact
                  icon={<BookOpen size={16} aria-hidden />}
                  label="Modules"
                  value={String(moduleCount)}
                />
                <Fact
                  icon={<Users size={16} aria-hidden />}
                  label="Lessons"
                  value={String(curriculum.totals.total)}
                />
                {deadline ? (
                  <Fact
                    icon={<CalendarDays size={16} aria-hidden />}
                    label="Ends"
                    value={formatDate(deadline)}
                  />
                ) : null}
              </dl>

              {curriculum.program.summary ? (
                <p className="mt-4 border-t border-border pt-4 text-sm text-ink-600">
                  {curriculum.program.summary}
                </p>
              ) : null}
            </section>

            <aside className="space-y-6">
              {/* One option means no decision to present — a chooser with a
                  single card is a question nobody asked. It appears the moment
                  the program offers an instalment plan. */}
              {status.options.length > 1 ? (
                <PlanChooser
                  programSlug={course}
                  options={status.options}
                  chosenId={chosen?.id ?? null}
                  canChoose={status.canChoose}
                  amountPaid={status.amountPaid}
                />
              ) : null}

              {chosen ? (
                <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
                  <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
                    {chosen.label} · {onInstalments ? "due today" : "due now"}
                  </p>

                  <p className="mt-2 text-3xl font-bold text-ink-900">
                    {formatPaise(dueNow)}
                  </p>

                  {/* On an instalment plan the big number is not the balance,
                      so it has to say what it is. The first charge carries the
                      down payment and the first cycle together — that is
                      Razorpay's doing, not ours, and a student who expected to
                      pay ₹9,999 today should not be surprised by ₹14,999. */}
                  {onInstalments && !mandateLive ? (
                    <p className="mt-1 text-sm text-ink-600">
                      {chosen.upfrontAmount
                        ? `${formatPaise(chosen.upfrontAmount)} down payment plus your first instalment of ${formatPaise(chosen.cycleAmount ?? 0)}. `
                        : ""}
                      Then {(chosen.totalCycles ?? 1) - 1} × {formatPaise(chosen.cycleAmount ?? 0)}, collected automatically each month.
                    </p>
                  ) : null}

                  {/* Only on a first payment. Once they are part-way through,
                      the struck price is a fact about the fee and the number
                      above it is a balance — putting them side by side would
                      advertise a saving against something they aren't paying. */}
                  {chosen.listAmount && status.amountPaid === 0 ? (
                    <p className="mt-1 flex flex-wrap items-baseline gap-2 text-sm">
                      <span className="text-ink-500 line-through">
                        {formatPaise(chosen.listAmount)}
                      </span>
                      <span className="font-semibold text-success-700">
                        You save{" "}
                        {formatPaise(chosen.listAmount - chosen.totalAmount)}
                      </span>
                    </p>
                  ) : null}

                  {/* Only once something has been paid — a "₹0 paid" line on a
                      first payment is noise. */}
                  {status.amountPaid > 0 ? (
                    <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
                      <Row
                        label="Total fee"
                        value={formatPaise(status.totalAmount)}
                      />
                      <Row
                        label="Already paid"
                        value={`− ${formatPaise(status.amountPaid)}`}
                      />
                      <Row
                        label="Balance"
                        value={formatPaise(status.amountDue)}
                        strong
                      />
                    </dl>
                  ) : null}

                  <div className="mt-5">
                    {/* Once a mandate is live there is nothing to press: the
                        remaining instalments are debited on their own, and a
                        Pay button would invite a student to authorise a second
                        subscription against a fee they are already paying. */}
                    {mandateLive ? (
                      <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-muted p-4 text-sm text-ink-600">
                        <CalendarClock
                          size={16}
                          className="mt-0.5 shrink-0 text-ink-400"
                          aria-hidden
                        />
                        Your instalment plan is running. The next{" "}
                        {status.cyclesRemaining === 1
                          ? "payment is"
                          : `${status.cyclesRemaining} payments are`}{" "}
                        collected automatically — nothing to do here.
                      </p>
                    ) : (
                      <PayPanel
                        programSlug={course}
                        amountLabel={formatPaise(dueNow)}
                        plan={
                          onInstalments
                            ? {
                                label: chosen.label,
                                cycles: chosen.totalCycles ?? 1,
                              }
                            : undefined
                        }
                        disabled={paymentsMode === "off"}
                        disabledReason="Online payments aren't set up yet. Please contact the office to pay."
                      />
                    )}
                  </div>

                  <ul className="mt-4 space-y-2 border-t border-border pt-4">
                    {[
                      "Card, UPI, netbanking and wallets",
                      "Access opens immediately",
                    ].map((line) => (
                      <li
                        key={line}
                        className="flex items-start gap-2 text-xs text-ink-600"
                      >
                        <CheckCircle2
                          size={14}
                          className="mt-0.5 shrink-0 text-success-500"
                          aria-hidden
                        />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </aside>
          </div>
        </Container>
      </main>
    </>
  );
}

/**
 * Says out loud that no money will move.
 *
 * Loud rather than tasteful: the one unrecoverable outcome of a mock mode is
 * somebody believing a student paid. It cannot render in production — `mode()`
 * returns "off", never "mock", when NODE_ENV is production and keys are absent.
 */
function MockNotice() {
  return (
    <p className="mt-5 rounded-lg border border-warning-500/40 bg-warning-50 p-3 text-sm font-medium text-warning-700">
      Razorpay isn&rsquo;t configured, so this is a <strong>test payment</strong>.
      Pressing Pay marks the fee as settled without charging anything. Add
      RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to <code>.env.local</code> for the
      real thing.
    </p>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-surface-muted p-3">
      <span className="text-ink-400">{icon}</span>
      <div>
        <dt className="text-2xs uppercase tracking-wide text-ink-500">{label}</dt>
        <dd className="text-sm font-semibold text-ink-900">{value}</dd>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-600">{label}</dt>
      <dd
        className={
          strong ? "font-bold text-ink-900" : "font-medium text-ink-800"
        }
      >
        {value}
      </dd>
    </div>
  );
}
