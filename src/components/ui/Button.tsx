import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

/** design.md §5 — Button. Blue = action, gold = celebration only. */
type Variant =
  | "primary"
  | "secondary"
  | "ghost"
  | "gold"
  | "inverse"
  | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-solid text-white hover:bg-brand-solid-hover active:bg-brand-solid-active shadow-sm",
  secondary:
    "bg-surface text-ink-800 border border-border hover:border-border-strong hover:bg-ink-50",
  ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
  gold: "bg-gold-400 text-on-gold hover:bg-gold-500 active:bg-gold-600 shadow-sm",
  inverse: "bg-white text-brand-solid-hover hover:bg-brand-50 shadow-sm",
  danger: "bg-danger-500 text-white hover:bg-danger-700 shadow-sm",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

const BASE =
  "inline-flex items-center justify-center rounded-lg font-semibold whitespace-nowrap " +
  "transition-colors duration-[120ms] active:scale-[0.98] " +
  "disabled:opacity-50 disabled:pointer-events-none";

type SharedProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: SharedProps & ComponentProps<"button">) {
  return (
    <button
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: SharedProps & ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    />
  );
}
