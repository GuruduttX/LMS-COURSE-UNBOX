"use client";

import { AlertCircle, Plus } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { createFeePlan, type FeePlanFormState } from "@/lib/actions/fee-plans";
import { FEE_PLAN_PERIODS } from "@/lib/payments/plan-kinds";
import { EMPTY_FEE_PLAN } from "@/lib/validation/fee-plan";

/**
 * Add an instalment schedule to a program.
 *
 * **Every plan here is instalments.** Paying in full is the program's fee and
 * needs no plan — see `ProgramFeeForm` beside this one.
 *
 * **There is no edit form, and that is the point.** A Razorpay plan cannot be
 * changed once created, and terms a student already signed up on must not move
 * under them — so revising is "add the new one, archive the old one". A form
 * with a Save button would promise something the model cannot do; the note under
 * the total says so rather than leaving an admin to find out.
 *
 * The arithmetic is checked before anything is saved: `upfront + cycle × count`
 * must equal the total exactly, because every cycle of a Razorpay plan is the
 * same amount and there is no smaller last instalment to absorb a remainder.
 * A monthly amount over ₹15,000 is flagged too — above that, RBI requires the
 * student to authenticate every single debit, which is not an auto-debit.
 *
 * Rupees in, paise stored.
 */
const EMPTY_STATE: FeePlanFormState = {
  ok: false,
  errors: {},
  values: EMPTY_FEE_PLAN,
};

export function FeePlanForm({ programSlug }: { programSlug: string }) {
  const [state, formAction, isPending] = useActionState<
    FeePlanFormState,
    FormData
  >(createFeePlan, EMPTY_STATE);

  // A saved plan clears the form; a rejected one hands back what was typed.
  const values = state.ok ? EMPTY_FEE_PLAN : state.values;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="programSlug" value={programSlug} />

      {state.error ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-md bg-danger-50 p-3 text-sm font-medium text-danger-700"
        >
          <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <Field
        id="fee-label"
        label="Plan name"
        required
        error={state.errors.label}
        hint="What the student sees on the payment page."
      >
        <TextInput
          id="fee-label"
          name="label"
          defaultValue={values.label}
          hasError={!!state.errors.label}
          placeholder="9-month plan"
          maxLength={80}
        />
      </Field>

      <Field
        id="fee-total"
        label="Total on this plan (₹)"
        required
        error={state.errors.totalAmount}
        hint="Usually more than paying in full. Can't be edited later."
      >
        <TextInput
          id="fee-total"
          name="totalAmount"
          inputMode="decimal"
          defaultValue={values.totalAmount}
          hasError={!!state.errors.totalAmount}
          placeholder="38000"
        />
      </Field>

      <Field
        id="fee-upfront"
        label="Down payment (₹)"
        error={state.errors.upfrontAmount}
        hint="Taken at signup. Also where the rounding remainder goes."
      >
        <TextInput
          id="fee-upfront"
          name="upfrontAmount"
          inputMode="decimal"
          defaultValue={values.upfrontAmount}
          hasError={!!state.errors.upfrontAmount}
          placeholder="2000"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field
          id="fee-cycle"
          label="Each instalment (₹)"
          required
          error={state.errors.cycleAmount}
        >
          <TextInput
            id="fee-cycle"
            name="cycleAmount"
            inputMode="decimal"
            defaultValue={values.cycleAmount}
            hasError={!!state.errors.cycleAmount}
            placeholder="4000"
          />
        </Field>

        <Field
          id="fee-cycles"
          label="How many"
          required
          error={state.errors.totalCycles}
        >
          <TextInput
            id="fee-cycles"
            name="totalCycles"
            inputMode="numeric"
            defaultValue={values.totalCycles}
            hasError={!!state.errors.totalCycles}
            placeholder="9"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field id="fee-period" label="Charged" required error={state.errors.period}>
          <Select id="fee-period" name="period" defaultValue={values.period}>
            {FEE_PLAN_PERIODS.map((period) => (
              <option key={period} value={period}>
                {period}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          id="fee-interval"
          label="Every"
          required
          error={state.errors.interval}
          hint="1 = every period."
        >
          <TextInput
            id="fee-interval"
            name="interval"
            inputMode="numeric"
            defaultValue={values.interval}
            hasError={!!state.errors.interval}
          />
        </Field>
      </div>

      <Field
        id="fee-description"
        label="Description"
        error={state.errors.description}
        hint="One line under the price. Optional."
      >
        <TextInput
          id="fee-description"
          name="description"
          defaultValue={values.description}
          hasError={!!state.errors.description}
          placeholder="Spread over the length of the course"
          maxLength={300}
        />
      </Field>

      <Button type="submit" disabled={isPending}>
        <Plus size={16} aria-hidden />
        {isPending ? "Adding…" : "Add plan"}
      </Button>
    </form>
  );
}
