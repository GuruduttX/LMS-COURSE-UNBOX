import { AlertTriangle, CheckCircle2, Clock, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumb } from "@/components/staff/curriculum/Breadcrumb";
import { PageHeading, StatTile } from "@/components/staff/StatTile";
import { ArchivePlanButton } from "@/components/staff/fees/ArchivePlanButton";
import { CustomPriceLegend, FeeRoster } from "@/components/staff/fees/FeeRoster";
import { FeePlanForm } from "@/components/staff/fees/FeePlanForm";
import { ProgramFeeForm } from "@/components/staff/fees/ProgramFeeForm";
import { requireRole } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db";
import { getProgramCurriculum } from "@/lib/data/curriculum-db";
import {
  groupRosterByBatch,
  programFeeRoster,
  type FeePlanOption,
} from "@/lib/data/fees";
import { formatPaise } from "@/lib/payments/money";
import { MAX_FEE_PLANS_PER_PROGRAM } from "@/lib/payments/plan-kinds";
import { mode } from "@/lib/payments/razorpay";
import { FeePlan } from "@/models/FeePlan";
import { Program } from "@/models/Program";

/**
 * What one program costs, and who has paid.
 *
 * Two jobs on one screen because they are the same job in practice: an admin
 * setting a price immediately wants to know who is now on it, and an admin
 * chasing an unpaid student immediately wants to know what they were charged.
 *
 * The order of the two forms is the order of the decisions. **The fee comes
 * first** — one number, and the whole of paying in full — and instalment plans
 * are ways of paying it, which is why `createFeePlan` refuses until a fee
 * exists.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/admin/programs/[program]/fees">): Promise<Metadata> {
  const { program } = await params;
  const curriculum = await getProgramCurriculum(program, { includeDrafts: true });

  return { title: curriculum ? `Fees — ${curriculum.program.title}` : "Fees" };
}

export default async function ProgramFeesPage({
  params,
}: PageProps<"/admin/programs/[program]/fees">) {
  await requireRole("admin");

  const { program: slug } = await params;

  await connectToDatabase();
  const program = await Program.findOne({ slug })
    .select("_id title feeAmount listAmount")
    .lean();
  if (!program) notFound();

  const [plans, roster] = await Promise.all([
    FeePlan.find({ programId: program._id }).sort({ status: 1, order: 1 }).lean(),
    programFeeRoster(slug),
  ]);

  const active = plans.filter((row) => row.status === "active");
  const archived = plans.filter((row) => row.status === "archived");

  const unpaid = roster.filter((row) => !row.isPaid);
  const collected = roster.reduce((total, row) => total + row.amountPaid, 0);
  const outstanding = unpaid.reduce((total, row) => total + row.amountDue, 0);
  const groups = groupRosterByBatch(roster);

  // Part-paid, not settled — the people a price change actually moves, and the
  // number the confirmation dialog quotes.
  const midPayment = roster.filter(
    (row) => row.hasStartedPaying && !row.isPaid,
  ).length;

  const planOptions: FeePlanOption[] = active.map((plan) => ({
    id: String(plan._id),
    kind: "emi",
    label: plan.label,
    description: plan.description ?? "",
    totalAmount: plan.totalAmount,
    listAmount: null,
    cycleAmount: plan.cycleAmount,
    totalCycles: plan.totalCycles,
    upfrontAmount: plan.upfrontAmount,
    available: false,
    recommended: false,
  }));

  const slotsLeft = MAX_FEE_PLANS_PER_PROGRAM - active.length;
  const paymentsMode = mode();

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Programs", href: "/admin/programs" },
          { label: program.title, href: `/admin/programs/${slug}` },
          { label: "Fees" },
        ]}
      />

      <PageHeading
        title="Fees"
        description={`What ${program.title} costs, and who has paid.`}
      />

      {paymentsMode !== "live" ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning-500/40 bg-warning-50 p-3 text-sm font-medium text-warning-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          {paymentsMode === "mock"
            ? "Razorpay isn't configured, so students can settle fees without paying. Fine for development — add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET before anyone real uses this."
            : "Razorpay isn't configured, so the Pay button is switched off for students. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to take payments."}
        </p>
      ) : null}

      {/* The loudest state on the screen. Without a fee this program is free to
          reach, which is a legitimate choice and an easy oversight, and this is
          the only place either shows up. */}
      {!program.feeAmount ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning-500/40 bg-warning-50 p-3 text-sm text-warning-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            <strong>This program has no fee.</strong> Every student on it reaches
            the course without paying. Set one below if that isn&rsquo;t intended.
          </span>
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Collected"
          value={formatPaise(collected)}
          icon={CheckCircle2}
        />
        <StatTile
          label="Outstanding"
          value={formatPaise(outstanding)}
          icon={Wallet}
        />
        <StatTile
          label="Students unpaid"
          value={unpaid.length}
          icon={AlertTriangle}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-ink-900">
              Instalment plans
            </h2>
            <p className="text-xs text-ink-500">
              {active.length} of {MAX_FEE_PLANS_PER_PROGRAM} · paying in full is
              always offered
            </p>
          </div>

          {active.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-surface-muted p-4 text-sm text-ink-600">
              No instalment plans. Students pay the fee in one go, which is
              always available and needs no plan.
            </p>
          ) : (
            <ul className="space-y-3">
              {active.map((plan) => (
                <li
                  key={String(plan._id)}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">{plan.label}</p>
                    <p className="mt-0.5 text-sm text-ink-600">
                      {formatPaise(plan.totalAmount)} —{" "}
                      {plan.upfrontAmount > 0
                        ? `${formatPaise(plan.upfrontAmount)} down, then `
                        : ""}
                      {plan.totalCycles} × {formatPaise(plan.cycleAmount)}{" "}
                      {plan.period}
                    </p>
                    {plan.description ? (
                      <p className="mt-1 text-xs text-ink-500">
                        {plan.description}
                      </p>
                    ) : null}

                    {/* Configured, agreed, and not yet collectable. Students see
                        the same thing on their side rather than an option that
                        silently isn't there. */}
                    <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-2xs font-semibold text-ink-500">
                      <Clock size={11} aria-hidden />
                      Not collectable until Subscriptions is live
                    </p>
                  </div>

                  <ArchivePlanButton
                    programSlug={slug}
                    planId={String(plan._id)}
                  />
                </li>
              ))}
            </ul>
          )}

          {archived.length > 0 ? (
            <details className="rounded-xl border border-border bg-surface-muted p-4">
              <summary className="cursor-pointer text-sm font-medium text-ink-700">
                {archived.length} archived{" "}
                {archived.length === 1 ? "plan" : "plans"}
              </summary>
              <ul className="mt-3 space-y-2">
                {archived.map((plan) => (
                  <li key={String(plan._id)} className="text-sm text-ink-600">
                    {plan.label} — {formatPaise(plan.totalAmount)}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
            <h2 className="text-base font-bold text-ink-900">Who has paid</h2>
            <CustomPriceLegend />
          </div>

          {roster.length === 0 ? (
            <p className="text-sm text-ink-500">
              {program.feeAmount
                ? "Nobody is enrolled yet."
                : "Set a fee to see who owes what."}
            </p>
          ) : (
            <FeeRoster
              programSlug={slug}
              groups={groups}
              planOptions={planOptions}
              programFeeLabel={
                program.feeAmount ? String(program.feeAmount / 100) : "0"
              }
            />
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-base font-bold text-ink-900">The fee</h2>
            <p className="mt-1 mb-4 text-sm text-ink-600">
              What the program costs paid in one go. Always available to
              students — it needs no plan.
            </p>
            <ProgramFeeForm
              programSlug={slug}
              feeAmount={program.feeAmount ?? null}
              listAmount={program.listAmount ?? null}
              midPaymentCount={midPayment}
            />
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-base font-bold text-ink-900">
              Add an instalment plan
            </h2>
            <p className="mt-1 mb-4 text-sm text-ink-600">
              Plans can&rsquo;t be edited once created — add a new one and
              archive the old to change terms.
            </p>

            {!program.feeAmount ? (
              <p className="rounded-lg bg-surface-muted p-3 text-sm text-ink-600">
                Set the fee first. Instalments are a way of paying it.
              </p>
            ) : slotsLeft > 0 ? (
              <FeePlanForm programSlug={slug} />
            ) : (
              <p className="rounded-lg bg-surface-muted p-3 text-sm text-ink-600">
                This program already offers {MAX_FEE_PLANS_PER_PROGRAM}{" "}
                instalment plans, which with paying in full is the most a student
                should have to choose between. Archive one to add another.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
