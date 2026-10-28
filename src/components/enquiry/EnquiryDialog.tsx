"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  Phone,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { modalPanel, sheet, fade } from "@/lib/motion";
import {
  EMPTY_ENQUIRY,
  hasErrors,
  programOptions,
  validateEnquiry,
  type EnquiryErrors,
  type EnquiryInput,
} from "@/lib/validation/enquiry";

type Status = "editing" | "submitting" | "done";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function EnquiryDialog({
  isOpen,
  onClose,
  source,
  programs,
  defaultProgram = "",
}: {
  isOpen: boolean;
  onClose: () => void;
  source: string;
  /** Published program titles, loaded on the server — see EnquiryProvider. */
  programs: string[];
  /** Pre-selected when the dialog opens from a program's own page. */
  defaultProgram?: string;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const reduced = useReducedMotion();

  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
          <motion.div
            aria-hidden
            onClick={onClose}
            variants={reduced ? undefined : fade}
            initial="hidden"
            animate="show"
            exit="hidden"
            className="absolute inset-0 bg-night-900/60 backdrop-blur-[2px]"
          />

          <motion.div
            variants={reduced ? undefined : isDesktop ? modalPanel : sheet}
            initial="hidden"
            animate="show"
            exit="exit"
            className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-lg md:max-w-lg md:rounded-2xl"
          >
            <EnquiryDialogContent
              onClose={onClose}
              source={source}
              programs={programs}
              defaultProgram={defaultProgram}
            />
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function EnquiryDialogContent({
  onClose,
  source,
  programs,
  defaultProgram,
}: {
  onClose: () => void;
  source: string;
  programs: string[];
  defaultProgram: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Pre-selected only when the program is one actually on offer: a stale link
  // must not put a program nobody publishes into the dropdown.
  const [values, setValues] = useState<EnquiryInput>(() => ({
    ...EMPTY_ENQUIRY,
    program: programs.includes(defaultProgram) ? defaultProgram : "",
  }));
  const [errors, setErrors] = useState<EnquiryErrors>({});
  const [status, setStatus] = useState<Status>("editing");
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Only start showing inline errors after the first submit attempt —
  // don't scold someone who is still typing their name. design.md §7.
  const [validateLive, setValidateLive] = useState(false);

  // Lock the page, restore focus to whatever opened the dialog.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const timer = window.setTimeout(() => firstFieldRef.current?.focus(), 60);

    return () => {
      document.body.style.overflow = overflow;
      window.clearTimeout(timer);
      previouslyFocused?.focus?.();
    };
  }, []);

  // Escape closes; Tab stays inside the panel.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const setField = useCallback(
    (key: keyof EnquiryInput, value: string) => {
      setValues((current) => {
        const next = { ...current, [key]: value };
        if (validateLive) setErrors(validateEnquiry(next, { programs }));
        return next;
      });
    },
    [validateLive, programs],
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const nextErrors = validateEnquiry(values, { programs });
    setErrors(nextErrors);
    setValidateLive(true);
    setSubmitError(null);

    if (hasErrors(nextErrors)) {
      // Send focus to the first problem so it is never off-screen.
      const firstKey = Object.keys(nextErrors)[0];
      panelRef.current
        ?.querySelector<HTMLElement>(`[name="${firstKey}"]`)
        ?.focus();
      return;
    }

    setStatus("submitting");
    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, source }),
      });

      if (response.status === 422) {
        const data = (await response.json()) as { errors?: EnquiryErrors };
        setErrors(data.errors ?? {});
        setStatus("editing");
        return;
      }

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "Something went wrong.");
      }

      setStatus("done");
    } catch (error) {
      // Values stay in the form — never make someone retype after a failure.
      setStatus("editing");
      setSubmitError(
        error instanceof Error && error.message
          ? error.message
          : "We couldn't reach the server. Please check your connection and try again.",
      );
    }
  }

  if (status === "done") {
    return (
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="p-6 text-center md:p-8">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-50 text-success-700">
            <CheckCircle2 size={28} aria-hidden />
          </span>
          <h2 id={titleId} className="text-xl font-bold text-ink-900">
            Enquiry received
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-600">
            Thanks {values.fullName.trim().split(" ")[0]} — a counsellor will call you
            on {values.phone} within one working day.
          </p>
          <Button onClick={onClose} size="lg" className="mt-6 w-full sm:w-auto">
            Done
          </Button>
        </div>
      </div>
    );
  }

  const isSubmitting = status === "submitting";

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* Grab handle — mobile only, signals the sheet can be dismissed. */}
      <div aria-hidden className="pt-2 md:hidden">
        <span className="mx-auto block h-1 w-10 rounded-full bg-ink-200" />
      </div>

      <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-4 md:px-6 md:pt-6">
        <div>
          <h2 id={titleId} className="text-lg font-bold text-ink-900">
            Talk to a counsellor
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Free counselling · No upfront payment · We reply within one working day
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
        >
          <X size={18} />
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto border-t border-border px-5 py-5 md:px-6">
          {submitError ? (
            <div
              role="alert"
              className="flex gap-2.5 rounded-lg border border-danger-500/30 bg-danger-50 p-3"
            >
              <AlertTriangle
                size={18}
                className="mt-px shrink-0 text-danger-700"
                aria-hidden
              />
              <p className="text-sm text-danger-700">{submitError}</p>
            </div>
          ) : null}

          <Field id="fullName" label="Full name" error={errors.fullName} required>
            <TextInput
              ref={firstFieldRef}
              id="fullName"
              name="fullName"
              autoComplete="name"
              placeholder="Priya Sharma"
              leadingIcon={<User size={16} />}
              hasError={!!errors.fullName}
              aria-invalid={!!errors.fullName}
              aria-describedby={errors.fullName ? "fullName-error" : undefined}
              value={values.fullName}
              onChange={(event) => setField("fullName", event.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="phone" label="Mobile number" error={errors.phone} required>
              <TextInput
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="98765 43210"
                leadingIcon={<Phone size={16} />}
                hasError={!!errors.phone}
                aria-invalid={!!errors.phone}
                aria-describedby={errors.phone ? "phone-error" : undefined}
                value={values.phone}
                onChange={(event) => setField("phone", event.target.value)}
              />
            </Field>

            <Field id="email" label="Email" error={errors.email} required>
              <TextInput
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@email.com"
                leadingIcon={<Mail size={16} />}
                hasError={!!errors.email}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
                value={values.email}
                onChange={(event) => setField("email", event.target.value)}
              />
            </Field>
          </div>

          <Field
            id="program"
            label="Which program?"
            error={errors.program}
            required
          >
            <Select
              id="program"
              name="program"
              hasError={!!errors.program}
              aria-invalid={!!errors.program}
              aria-describedby={errors.program ? "program-error" : undefined}
              value={values.program}
              onChange={(event) => setField("program", event.target.value)}
            >
              <option value="">Select a program</option>
              {programOptions(programs).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>

        </div>

        <div className="border-t border-border bg-surface-muted px-5 py-4 md:px-6">
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} className="animate-spin" aria-hidden />
                Sending…
              </>
            ) : (
              "Request a callback"
            )}
          </Button>
          <p className="mt-3 text-center text-xs text-ink-500">
            Your details are never shared with third parties.
          </p>
        </div>
      </form>
    </div>
  );
}
