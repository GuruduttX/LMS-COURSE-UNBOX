"use client";

import { useActionState } from "react";

import { changePassword } from "@/app/account/password/actions";
import {
  EMPTY_PASSWORD_STATE,
  type PasswordState,
} from "@/app/account/password/state";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
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
        <TextInput
          id="currentPassword"
          name="currentPassword"
          type="password"
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
        <TextInput
          id="newPassword"
          name="newPassword"
          type="password"
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
        <TextInput
          id="confirmPassword"
          name="confirmPassword"
          type="password"
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
