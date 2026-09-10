"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { setTheme } from "@/lib/theme-actions";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/cn";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/**
 * Light / Dark / System, as a segmented control of three toggle buttons.
 *
 * Buttons with `aria-pressed` rather than a radio group: all three stay in the
 * tab order, which is what someone reaching for the theme control expects,
 * without owing the arrow-key roving-focus contract a real radiogroup implies.
 *
 * A click updates local state, an effect mirrors that onto `<html data-theme>`
 * so the page repaints immediately, and the cookie write happens in a
 * transition so the next *server* render agrees. Nothing waits on the round
 * trip, and a failed write costs the user a stale theme on their next hard
 * load, nothing more.
 *
 * `value` comes from the server (`getTheme`), so the correct segment is already
 * marked in the HTML — there is no hydration flicker to guard against.
 */
export function ThemeToggle({
  value,
  variant = "compact",
  className,
}: {
  value: Theme;
  /** "full" shows labels (sidebar); "compact" is icon-only (headers). */
  variant?: "full" | "compact";
  className?: string;
}) {
  const [selected, setSelected] = useState<Theme>(value);
  const [, startTransition] = useTransition();

  // The <html> attribute is the one piece of state React does not own here —
  // the server put it there, so we write it rather than render it.
  useEffect(() => {
    document.documentElement.dataset.theme = selected;
  }, [selected]);

  function choose(next: Theme) {
    setSelected(next);
    startTransition(() => {
      void setTheme(next);
    });
  }

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5",
        variant === "full" && "w-full",
        className,
      )}
    >
      {OPTIONS.map(({ value: option, label, Icon }) => {
        const isActive = selected === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isActive}
            aria-label={label}
            title={`${label} theme`}
            onClick={() => choose(option)}
            className={cn(
              "flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-colors duration-[120ms]",
              variant === "full" ? "flex-1 px-2" : "w-8",
              isActive
                ? "bg-brand-50 text-brand-700"
                : "text-ink-500 hover:bg-ink-100 hover:text-ink-900",
            )}
          >
            <Icon size={15} aria-hidden />
            {variant === "full" ? label : null}
          </button>
        );
      })}
    </div>
  );
}
