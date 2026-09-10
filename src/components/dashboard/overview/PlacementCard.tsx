import { Lock } from "lucide-react";

/**
 * Placement sessions and aptitude training — **not built yet**.
 *
 * Shown, disabled, and honest about why, the same treatment `StaffNav` gives
 * Enquiries and Settings. There is no placement model, no collection and no
 * `/dashboard/[course]/placement` route, so the counts this used to print were
 * hardcoded for two demo programs and the button led to a 404.
 *
 * Kept rather than removed because the slot is a decision somebody made about
 * the shape of this screen, and a student who was told about placement support
 * should see where it will appear. Numbers arrive when the model does.
 */
export function PlacementCard() {
  return (
    <section
      aria-labelledby="placement-heading"
      className="rounded-xl border border-dashed border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="placement-heading"
            className="flex items-center gap-2 text-lg font-bold text-ink-500"
          >
            <Lock size={16} aria-hidden />
            Placement hub
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Your placement sessions and aptitude training will appear here.
          </p>
        </div>

        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-500">
          Soon
        </span>
      </div>
    </section>
  );
}
