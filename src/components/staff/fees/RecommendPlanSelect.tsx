"use client";

import { useActionState } from "react";

import { Select } from "@/components/ui/Field";
import { EMPTY_ACTION_STATE, type ActionState } from "@/lib/actions/curriculum-state";
import { recommendFeePlan } from "@/lib/actions/fee-plans";
import type { FeePlanOption } from "@/lib/data/fees";

/**
 * Suggest a plan to one student. **Advisory, never binding.**
 *
 * The student still chooses on their own fee page; this only badges one option
 * as recommended there. That is why there is no "already paid" lock as there
 * would be on an assignment — a suggestion cannot change what anybody owes, so
 * it stays editable for the life of the enrolment.
 *
 * It lives on the fees screen rather than on the enrol form deliberately. The
 * enrol form's job is putting somebody on a program; a fee dropdown there would
 * imply the plan is the admin's to decide, which is exactly what this is not.
 * Setting it here, straight after enrolling, costs one click and says the right
 * thing about who chooses.
 *
 * Submits on change, with no Save button: it is one field, and a Save that only
 * ever applies to the dropdown beside it is a second click for nothing.
 *
 * ## It says when the suggestion cannot be acted on
 *
 * Instalments are configured but not collectable yet, so recommending one today
 * points a student at something they will be refused. That is sometimes still
 * the right thing to do — the office may be arranging it by hand — but it must
 * be a decision rather than a surprise, so the line under the dropdown says so
 * at the moment of choosing. `collectable` goes true when subscriptions land.
 */
export function RecommendPlanSelect({
  programSlug,
  studentId,
  options,
  recommendedPlanId,
  collectable = false,
}: {
  programSlug: string;
  studentId: string;
  options: FeePlanOption[];
  recommendedPlanId: string | null;
  /** Whether an instalment plan can actually be paid yet. */
  collectable?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    recommendFeePlan,
    EMPTY_ACTION_STATE,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="programSlug" value={programSlug} />
      <input type="hidden" name="studentId" value={studentId} />

      <Select
        aria-label="Recommended plan"
        name="planId"
        defaultValue={recommendedPlanId ?? ""}
        className="h-9 text-xs"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {/* The empty option recommends paying in full, which is also what a
            student with no recommendation sees highlighted. Either way it is
            the default, so there is no "nothing suggested" state to explain. */}
        <option value="">Recommend paying in full</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </Select>

      {state.error ? (
        <p role="alert" className="mt-1 text-xs font-medium text-danger-700">
          {state.error}
        </p>
      ) : recommendedPlanId && !collectable ? (
        <p className="mt-1 text-2xs text-ink-500">
          They&rsquo;ll see this suggested but can&rsquo;t pay it online yet.
        </p>
      ) : null}
    </form>
  );
}
