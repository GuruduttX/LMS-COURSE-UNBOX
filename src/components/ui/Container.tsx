import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Page gutter + max width.
 *
 * Two sizes, for two jobs. `default` is design.md §8 — content caps at 1152px,
 * which is a reading measure and right for the marketing pages. `wide` caps at
 * 1440px with a smaller gutter, for the signed-in app screens: those are
 * dashboards, not prose, and holding them to a reading width leaves cards
 * cramped between empty margins on a laptop.
 */
export function Container({
  size = "default",
  className,
  children,
}: {
  size?: "default" | "wide";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full",
        size === "wide"
          ? "max-w-[90rem] px-4 sm:px-5 lg:px-8"
          : "max-w-[72rem] px-4 md:px-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
