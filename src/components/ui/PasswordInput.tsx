"use client";

import { Eye, EyeOff, Lock } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { TextInput } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

/**
 * A password field with a show/hide toggle — design.md §5 Input, plus the one
 * affordance people reach for most on a phone keyboard: checking what they typed.
 *
 * The toggle is a real button with its own label and `aria-pressed`, kept out
 * of the tab order's way by sitting after the input. `type="button"` so it can
 * never submit the form it lives in.
 */
export function PasswordInput({
  hasError,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { hasError?: boolean }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <TextInput
        {...props}
        type={visible ? "text" : "password"}
        hasError={hasError}
        leadingIcon={<Lock size={16} />}
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
      >
        {visible ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
      </button>
    </div>
  );
}
