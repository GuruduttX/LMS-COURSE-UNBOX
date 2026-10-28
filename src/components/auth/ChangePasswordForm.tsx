"use client";

import { useActionState } from "react";

import { changePassword } from "@/app/account/password/actions";
import {
  EMPTY_PASSWORD_STATE,
  type PasswordState,
} from "@/app/account/password/state";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { MIN_PASSWORD_LENGTH } from "@/lib/validation/auth";

export function ChangePasswordForm({ canCancel }: { canCancel: boolean }) {
  const [state, formAction, isPending] = useActionState<PasswordState, FormData>(
    changePassword,
    EMPTY_PASSWORD_STATE,
  );

  return (
    <form action={formAction} noValidate className="space-y-4">
      <Field
        id="currentPassword"
        label="Current password"
        error={state.errors.currentPassword}
        required
      >
        <PasswordInput
          id="currentPassword"
          name="currentPassword"
          autoComplete="current-password"
          hasError={Boolean(state.errors.currentPassword)}
        />
      </Field>

      <Field
        id="newPassword"
        label="New password"
        error={state.errors.newPassword}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters, with a letter and a number.`}
        required
      >
        <PasswordInput
          id="newPassword"
          name="newPassword"
          autoComplete="new-password"
          hasError={Boolean(state.errors.newPassword)}
        />
      </Field>

      <Field
        id="confirmPassword"
        label="Confirm new password"
        error={state.errors.confirmPassword}
        required
      >
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          hasError={Boolean(state.errors.confirmPassword)}
        />
      </Field>

      <div className="flex flex-wrap gap-3 pt-1">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Update password"}
        </Button>
        {/* No way out while the temporary password is still in force. */}
        {canCancel ? (
          <Button type="reset" variant="secondary">
            Clear
          </Button>
        ) : null}
      </div>
    </form>
  );
}
