"use client";

import { AlertCircle } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { signIn } from "@/app/login/actions";
import {
  EMPTY_SIGN_IN_STATE,
  type SignInState,
} from "@/lib/auth/sign-in-state";
import { validateCredentials, hasErrors } from "@/lib/validation/auth";

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
      className="space-y-4"
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
          autoComplete="email"
          autoFocus
          placeholder="you@courseunbox.com"
          hasError={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
          value={values.email}
          onChange={(event) =>
            setValues((current) => ({ ...current, email: event.target.value }))
          }
        />
      </Field>

      <Field id="password" label="Password" error={errors.password} required>
        <TextInput
          id="password"
          name="password"
          type="password"
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

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
