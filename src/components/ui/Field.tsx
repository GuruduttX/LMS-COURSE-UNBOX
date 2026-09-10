import { AlertCircle, ChevronDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Form primitives — design.md §5.
 * Label always above and always visible; placeholder is an example, not an
 * instruction. On error the helper text is replaced by the error message.
 */

const CONTROL =
  "w-full rounded-md border bg-surface text-sm text-ink-900 placeholder:text-ink-400 " +
  "transition-colors outline-none disabled:bg-ink-50 disabled:text-ink-400";

const CONTROL_OK = "border-border hover:border-border-strong focus:border-brand-600";
const CONTROL_ERROR = "border-danger-500 hover:border-danger-500";

function controlClasses(hasError: boolean, extra?: string) {
  return cn(CONTROL, hasError ? CONTROL_ERROR : CONTROL_OK, extra);
}

export function Field({
  id,
  label,
  error,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-ink-700"
      >
        {label}
        {required ? null : (
          <span className="ml-1.5 text-xs font-normal text-ink-400">
            (optional)
          </span>
        )}
      </label>

      {children}

      {error ? (
        <p
          id={`${id}-error`}
          className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-danger-700"
        >
          <AlertCircle size={14} className="mt-px shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  hasError,
  leadingIcon,
  className,
  ...props
}: ComponentProps<"input"> & { hasError?: boolean; leadingIcon?: ReactNode }) {
  return (
    <div className="relative">
      {leadingIcon ? (
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
        >
          {leadingIcon}
        </span>
      ) : null}
      <input
        className={controlClasses(
          !!hasError,
          cn("h-11 px-3 md:h-10", leadingIcon ? "pl-9" : undefined, className),
        )}
        {...props}
      />
    </div>
  );
}

export function Select({
  hasError,
  className,
  children,
  ...props
}: ComponentProps<"select"> & { hasError?: boolean }) {
  return (
    <div className="relative">
      <select
        className={controlClasses(
          !!hasError,
          cn("h-11 appearance-none pl-3 pr-9 md:h-10", className),
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
      />
    </div>
  );
}

export function Textarea({
  hasError,
  className,
  ...props
}: ComponentProps<"textarea"> & { hasError?: boolean }) {
  return (
    <textarea
      className={controlClasses(!!hasError, cn("min-h-24 p-3", className))}
      {...props}
    />
  );
}
