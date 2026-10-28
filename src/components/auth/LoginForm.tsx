"use client";

import { AlertCircle, ArrowRight, Info, Loader2, Mail } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { signIn } from "@/app/login/actions";
import {
  EMPTY_SIGN_IN_STATE,
  type SignInState,
} from "@/lib/auth/sign-in-state";
import { validateCredentials, hasErrors } from "@/lib/validation/auth";

/** No self-serve reset exists yet, so "forgot" is a pre-filled email to support. */
const RESET_HREF =
  "mailto:support@courseunbox.com?subject=" +
  encodeURIComponent("Password reset request");

/**
 * The one client island on the login page.
 *
 * Same behaviour as the enquiry dialog, for the same reasons: errors appear
 * only after the first submit attempt (not while someone is still typing their
 * email), and a failed attempt keeps the email in the form — nobody should
 * retype it because the password was wrong.
 */
export function LoginForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState<SignInState, FormData>(
    signIn,
    EMPTY_SIGN_IN_STATE,
  );

  const [attempted, setAttempted] = useState(false);
  const [values, setValues] = useState({ email: "", password: "" });

  const clientErrors = attempted ? validateCredentials(values) : {};
  const errors = { ...state.errors, ...clientErrors };

  return (
    <form
      action={formAction}
      noValidate
      onSubmit={(event) => {
        setAttempted(true);
        if (hasErrors(validateCredentials(values))) event.preventDefault();
      }}
      className="space-y-5"
    >
      <input type="hidden" name="next" value={next} />

      {state.errors.form ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger-500/30 bg-danger-50 p-3 text-sm font-medium text-danger-700"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          {state.errors.form}
        </p>
      ) : null}

      <Field id="email" label="Email" error={errors.email} required>
        <TextInput
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          placeholder="you@example.com"
          leadingIcon={<Mail size={16} />}
          hasError={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
          value={values.email}
          onChange={(event) =>
            setValues((current) => ({ ...current, email: event.target.value }))
          }
        />
      </Field>

      <div>
        <Field id="password" label="Password" error={errors.password} required>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            hasError={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : undefined}
            value={values.password}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                password: event.target.value,
              }))
            }
          />
        </Field>
        <div className="mt-2 text-right">
          <a
            href={RESET_HREF}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            Forgot password?
          </a>
        </div>
      </div>

      {/* Width is fixed by `w-full`, so swapping the icon for the spinner
          cannot resize the button mid-click. design.md §5. */}
      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 size={18} className="animate-spin" aria-hidden />
            Signing in…
          </>
        ) : (
          <>
            Sign in
            <ArrowRight size={18} aria-hidden />
          </>
        )}
      </Button>

      <div className="flex gap-3 rounded-xl border border-brand-100 bg-brand-50 p-4">
        <Info size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden />
        <p className="text-xs leading-relaxed text-ink-700">
          <span className="font-semibold text-ink-900">First time signing in?</span>{" "}
          Use the email and temporary password your program team shared with
          you. You&apos;ll choose your own password straight after.
        </p>
      </div>
    </form>
  );
}
