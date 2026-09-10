import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The way back out of a page, as an arrow and a label.
 *
 * This markup was copy-pasted across the student screens — tasks, tests,
 * sessions, marksheet, fees, the course drill-down — always with the same
 * classes and always with a different `href`. One component now, so the affordance
 * looks and behaves the same everywhere and a new page gets it for free.
 *
 * The label names the *destination*, never "Back": a browser already has a Back
 * button, and the thing this adds over it is telling you where you will land.
 *
 * Deliberately a real `<Link>` to a known parent rather than `router.back()`.
 * History is not a tree — a student who arrived from a notification or a
 * bookmark has nothing useful behind them, and "back" would take them out of
 * the app. Pass `className="lg:hidden"` on pages whose desktop layout already
 * carries a breadcrumb.
 */
export function BackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700",
        className,
      )}
    >
      <ArrowLeft size={16} aria-hidden />
      {children}
    </Link>
  );
}
