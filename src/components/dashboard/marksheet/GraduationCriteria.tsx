"use client";

import { Check, GraduationCap } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/curriculum/format";
import type { Criterion } from "@/lib/data/marksheet-db";

/**
 * "View graduation criteria" and the dialog it opens.
 *
 * The ticks are **earned, not decorative**: each criterion is evaluated against
 * the student's actual marks in `getMarksheet`. A criterion not yet met shows an
 * empty circle, so the dialog answers "what is left?" rather than just listing
 * rules — which is the only reason a student opens it.
 *
 * Trigger and dialog live in one component so the page stays a server component
 * and only this island ships JavaScript.
 */
export function GraduationCriteria({
  criteria,
  deadline,
}: {
  criteria: Criterion[];
  /** Null when the program has no completion date set. */
  deadline: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();

  const remaining = criteria.filter((item) => !item.met).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-xs font-semibold text-brand-600 hover:text-brand-700"
      >
        View graduation criteria
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        labelledBy={titleId}
      >
        <div className="p-6 text-center md:p-8">
          <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand-50">
            <GraduationCap size={30} aria-hidden className="text-brand-600" />
          </span>

          <h2 id={titleId} className="mt-4 text-lg font-extrabold text-ink-900">
            Graduation criteria
          </h2>
          <p className="mx-auto mt-1 max-w-[46ch] text-sm text-ink-600">
            The requirements to be eligible for the graduation certificate are as
            follows.
          </p>

          <ol className="mt-5 space-y-3 rounded-xl border border-border p-4 text-left">
            {criteria.map((item, index) => (
              <li key={item.id} className="flex gap-3">
                <Marker met={item.met} />
                <span
                  className={cn(
                    "text-sm",
                    item.met ? "text-ink-700" : "text-ink-900",
                  )}
                >
                  {index + 1}. {item.label}
                </span>
              </li>
            ))}

            {/* Dropped entirely when the program has no date, rather than
                printed as "by —", which reads as a broken deadline. */}
            {deadline ? (
              <li className="border-t border-border pt-3 text-sm text-ink-600">
                All of the above by{" "}
                <span className="font-bold text-ink-900">{formatDate(deadline)}</span>
              </li>
            ) : null}
          </ol>

          <p className="mt-4 text-xs font-medium text-ink-500">
            {remaining === 0
              ? "You have met every requirement."
              : `${remaining} of ${criteria.length} still to go.`}
          </p>

          <Button className="mt-5 w-full" onClick={() => setIsOpen(false)}>
            Okay, got it
          </Button>
        </div>
      </Modal>
    </>
  );
}

function Marker({ met }: { met: boolean }) {
  return met ? (
    <Check
      size={16}
      aria-label="Met"
      className="mt-0.5 shrink-0 text-success-500"
    />
  ) : (
    <span
      aria-label="Not met yet"
      role="img"
      className="mt-1 size-3.5 shrink-0 rounded-full border-2 border-ink-300"
    />
  );
}
