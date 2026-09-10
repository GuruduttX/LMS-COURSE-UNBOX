"use client";

import { AlertCircle, Check, Info, Sparkles, Wallet } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { EMPTY_ACTION_STATE, type ActionState } from "@/lib/actions/curriculum-state";
import { chooseFeePlan } from "@/lib/actions/fee-choice";
import type { FeePlanOption } from "@/lib/data/fees";
import { cn } from "@/lib/cn";
import { formatPaise } from "@/lib/payments/money";

/**
 * How the student picks a way to pay.
 *
 * A card per option with its own submit button, rather than radios plus one
 * Continue. Picking a payment plan is a decision made by comparing the cards,
 * and the button belongs on the thing being decided — a separate Continue makes
 * you choose twice and, on a phone, scroll back up to check what you chose.
 *
 * The chosen card keeps its place in the list rather than jumping to the top:
 * this list is short, and a card that moves when you press it reads as an error.
 *
 * ## Switching later
 *
 * Once money has moved, `canChoose` is false and only paying in full stays live
 * — that is the "changed my mind, let me settle up" path, and the action
 * enforces it independently of what this renders. The other cards go quiet and
 * say why rather than disappearing: an option that vanishes looks like a bug,
 * and the student may well be looking for the one they are on.
 *
 * ## Recommended, not chosen
 *
 * Staff can badge one option. It is a suggestion and nothing else — no card is
 * preselected by it, and the student's own choice always wins. The badge is
 * deliberately quiet next to the "Chosen" one, so the two are never confused.
 *
 * ## Recommending something they cannot take
 *
 * Instalment plans are configured but not collectable yet, so staff can end up
 * recommending an option the student is then refused. Badging it and stopping
 * there is a screen that promises and refuses in the same breath, so the
 * recommended-but-unavailable case gets its own line at the top and its own
 * wording on the card: what it is, why it is not payable here, and who to ask.
 *
 * When instalments go live this stops firing on its own — nothing here needs
 * changing but `available` in `data/fees.ts`.
 */
export function PlanChooser({
  programSlug,
  options,
  chosenId,
  canChoose,
  amountPaid,
}: {
  programSlug: string;
  options: FeePlanOption[];
  chosenId: string | null;
  canChoose: boolean;
  amountPaid: number;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    chooseFeePlan,
    EMPTY_ACTION_STATE,
  );

  // Staff pointed at something the student cannot actually take. Worth saying
  // plainly; see the header.
  const blockedRecommendation =
    options.find(
      (option) => option.recommended && !option.available && option.id !== chosenId,
    ) ?? null;

  return (
    <div>
      <h2 className="text-base font-bold text-ink-900">
        {chosenId ? "Your payment plan" : "Choose how to pay"}
      </h2>

      {!canChoose && chosenId ? (
        <p className="mt-1 text-sm text-ink-600">
          You&rsquo;ve paid {formatPaise(amountPaid)} on this plan. You can still
          switch to paying the balance in full at any time.
        </p>
      ) : null}

      {/* Said once, up front, rather than left for the student to discover by
          pressing a button that isn't there. */}
      {blockedRecommendation ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-warning-50 p-3 text-sm text-warning-700">
          <Info size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Your program manager suggested{" "}
            <strong>{blockedRecommendation.label}</strong>, but instalments
            can&rsquo;t be set up online yet. Contact the office to arrange it,
            or pay in full below.
          </span>
        </p>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="mt-3 flex items-start gap-1.5 rounded-md bg-danger-50 p-3 text-sm font-medium text-danger-700"
        >
          <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {options.map((option) => {
          const chosen = option.id === chosenId;
          // Two independent reasons a card may be dead: the option is not
          // collectable yet (instalments), or they have already started paying
          // on another plan and only the full option remains open.
          const openToSwitch = canChoose || option.kind === "full";
          const selectable = !chosen && option.available && openToSwitch;

          return (
            <li
              key={option.id}
              className={cn(
                "rounded-xl border p-4",
                chosen
                  ? "border-brand-600 bg-brand-50/40 ring-1 ring-brand-600"
                  : "border-border bg-surface",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-semibold text-ink-900">
                    {option.label}
                    {chosen ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-2xs font-semibold text-white">
                        <Check size={11} aria-hidden />
                        Chosen
                      </span>
                    ) : option.recommended ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold",
                          // A suggestion they can act on is an invitation; one
                          // they cannot is just a note. Colouring them the same
                          // is what made the card read as a live choice.
                          option.available
                            ? "bg-brand-50 text-brand-700"
                            : "bg-ink-100 text-ink-600",
                        )}
                      >
                        <Sparkles size={11} aria-hidden />
                        Suggested
                      </span>
                    ) : null}
                  </p>

                  <p className="mt-1 text-sm text-ink-700">
                    {planTerms(option)}
                  </p>

                  {option.description ? (
                    <p className="mt-1 text-xs text-ink-500">
                      {option.description}
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-ink-900">
                    {formatPaise(option.totalAmount)}
                  </p>
                  {option.listAmount ? (
                    <p className="text-xs text-ink-500 line-through">
                      {formatPaise(option.listAmount)}
                    </p>
                  ) : null}
                </div>
              </div>

              {chosen ? null : selectable ? (
                <form action={formAction} className="mt-3">
                  <input type="hidden" name="programSlug" value={programSlug} />
                  <input type="hidden" name="planId" value={option.id} />
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={isPending}
                  >
                    <Wallet size={14} aria-hidden />
                    {canChoose
                      ? `Choose ${option.label}`
                      : "Switch to paying in full"}
                  </Button>
                </form>
              ) : !option.available ? (
                <p className="mt-3 text-xs text-ink-500">
                  {option.recommended
                    ? "Suggested for you, but not payable online yet — contact the office to set it up."
                    : "Instalments aren’t available online yet — ask the office about this plan."}
                </p>
              ) : (
                <p className="mt-3 text-xs text-ink-500">
                  Not available once you&rsquo;ve started paying on another plan.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One plain line describing what the option actually asks for. */
function planTerms(option: FeePlanOption): string {
  if (option.kind === "full") return "One payment, no recurring charge.";

  const parts: string[] = [];

  if (option.upfrontAmount) {
    parts.push(`${formatPaise(option.upfrontAmount)} to start`);
  }
  if (option.cycleAmount && option.totalCycles) {
    parts.push(
      `${option.totalCycles} × ${formatPaise(option.cycleAmount)} monthly`,
    );
  }

  return parts.length > 0 ? `${parts.join(", then ")}.` : "Paid in instalments.";
}
