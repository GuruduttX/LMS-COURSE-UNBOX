"use client";

import { Archive } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { archiveFeePlan } from "@/lib/actions/fee-plans";
import { EMPTY_ACTION_STATE, type ActionState } from "@/lib/actions/curriculum-state";

/**
 * Take a plan off the menu.
 *
 * Archive, never delete — every `Payment` row points at the plan that was in
 * force, and a receipt referring to a price nobody can look up is the one thing
 * a fee dispute cannot survive. Students already on this plan stay on it and
 * keep the price they signed up at; this only stops new ones being put on it.
 *
 * No confirmation dialog, deliberately: nothing is destroyed and the button
 * that reverses it — "Add plan" — is on the same screen.
 */
export function ArchivePlanButton({
  programSlug,
  planId,
}: {
  programSlug: string;
  planId: string;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    archiveFeePlan,
    EMPTY_ACTION_STATE,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="programSlug" value={programSlug} />
      <input type="hidden" name="planId" value={planId} />

      <Button type="submit" variant="ghost" size="sm" disabled={isPending}>
        <Archive size={14} aria-hidden />
        {isPending ? "Archiving…" : "Archive"}
      </Button>

      {state.error ? (
        <p role="alert" className="mt-1 text-xs font-medium text-danger-700">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
