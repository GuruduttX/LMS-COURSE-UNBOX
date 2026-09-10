"use server";

/**
 * The student picking how they will pay.
 *
 * A student action, not a staff one, so the order is the one
 * `actions/submissions.ts` uses rather than the staff house order: **requireUser
 * → an explicit student check → the fee status → validate → write → audit**.
 *
 * `requireUser` then `role !== "student"`, deliberately, rather than
 * `requireRole("student")` — that admits an admin, and an admin has no fees.
 * Letting one through would set a payment plan on an enrolment they do not have.
 *
 * `getFeeStatus` **is** the scope check. It already answers "is this student on
 * this program, what may they pick, and have they paid anything" — the same
 * questions the fee page asked to decide what to render. Re-deriving them from
 * the models here would be a second copy of the gate, and two copies drift.
 */
import { revalidatePath } from "next/cache";

import { writeAudit } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/guards";
import { getFeeStatus } from "@/lib/data/fees";
import { connectToDatabase } from "@/lib/db";
import { formatPaise } from "@/lib/payments/money";
import { Enrollment } from "@/models/Enrollment";

import type { ActionState } from "./curriculum-state";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Choose how to pay, or move to something else.
 *
 * Paying in full is the default and needs no choice — a student who never opens
 * the chooser is already on it. This exists to move *onto* an instalment plan,
 * and to come back off one.
 *
 * ## Switching after money has moved
 *
 * Allowed **only back onto paying in full**, and that exception is the point
 * rather than a loophole. A student who signed up for instalments and later
 * comes into the money must have somewhere to settle up, and the arithmetic
 * already works: `amountDue` is `total − paid`, so the full option asks for
 * exactly the balance.
 *
 * Every other switch after a payment is refused. Moving between plans of
 * different totals would rewrite what somebody owes — a cheaper one silently
 * marks them paid up, a dearer one reopens a settled fee — and neither is a
 * thing to do quietly.
 *
 * The one case that could still surprise: a full fee lower than what they have
 * already paid on a dearer instalment plan would leave them owing nothing and
 * having overpaid. Refused too, rather than handing out a course and a silent
 * credit.
 */
export async function chooseFeePlan(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  if (user.role !== "student") {
    return { ok: false, error: "Only a student can choose a payment plan." };
  }

  const programSlug = text(formData, "programSlug");
  const planId = text(formData, "planId");

  const status = await getFeeStatus(user.id, programSlug);
  if (!status) return { ok: false, error: "You aren't enrolled on that program." };

  if (status.unconfigured) {
    return { ok: false, error: "There's no fee set for this program yet." };
  }

  // Only from what the program currently offers. An archived plan is off the
  // menu — binding on whoever is already on it, but not choosable.
  const picked = status.options.find((option) => option.id === planId);
  if (!picked) return { ok: false, error: "That isn't an option on this program." };

  if (status.chosen?.id === picked.id) return { ok: true };

  // Instalments are configured but not collectable yet. The chooser already
  // renders them as unavailable; this is what makes that a rule.
  if (!picked.available) {
    return {
      ok: false,
      error:
        "Instalment plans aren't available yet. You can pay in full today, or contact the office.",
    };
  }

  if (!status.canChoose) {
    if (picked.kind !== "full") {
      return {
        ok: false,
        error:
          "You've already paid on your current plan, so it can't be swapped for another instalment plan. You can switch to paying the balance in full at any time.",
      };
    }

    if (picked.totalAmount < status.amountPaid) {
      return {
        ok: false,
        error: `You've already paid ${formatPaise(status.amountPaid)}, which is more than the ${formatPaise(picked.totalAmount)} full fee. Please contact the office.`,
      };
    }
  }

  await connectToDatabase();

  await Enrollment.updateOne(
    { _id: status.enrollmentId },
    // Null is "paying in full" — there is no row for it, and that is why the
    // option can never be taken away. See models/Enrollment.ts.
    { $set: { feePlanId: picked.kind === "full" ? null : picked.id } },
  );

  await writeAudit(user, {
    action: "fee.choose",
    targetType: "Enrollment",
    targetId: status.enrollmentId,
    summary: `Chose ${picked.kind === "full" ? "to pay in full" : `"${picked.label}"`} (${formatPaise(picked.totalAmount)}) for ${programSlug}`,
    meta: {
      programSlug,
      planId: picked.kind === "full" ? null : picked.id,
      kind: picked.kind,
      // Worth recording: a switch after paying is the interesting event, and
      // it is the one somebody will ask about later.
      switchedAfterPaying: !status.canChoose,
      amountPaid: status.amountPaid,
    },
  });

  revalidatePath(`/dashboard/${programSlug}/fees`);
  revalidatePath("/dashboard");

  return { ok: true };
}
