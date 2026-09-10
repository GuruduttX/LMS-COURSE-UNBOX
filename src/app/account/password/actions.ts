"use server";

import { redirect } from "next/navigation";

import { requestContext, writeAudit } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/guards";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { ROLE_HOME } from "@/lib/auth/roles";
import { connectToDatabase } from "@/lib/db";
import { validateNewPassword } from "@/lib/validation/auth";
import { User } from "@/models/User";

import type { PasswordState } from "./state";

/**
 * Change your own password.
 *
 * Always requires the current password, even when `mustChangePassword` is set:
 * the flag means "this password is known to someone else", not "let anyone
 * holding this session set a new one". That check is what stops a borrowed
 * laptop from becoming a permanent account takeover.
 */
export async function changePassword(
  _previous: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  // skipPasswordGate: this screen is where the gate sends people.
  const current = await requireUser({ skipPasswordGate: true });

  const input = {
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  };

  const errors: PasswordState["errors"] = {};

  if (!input.currentPassword) {
    errors.currentPassword = "Enter your current password.";
  }

  const newPasswordError = validateNewPassword(input.newPassword);
  if (newPasswordError) errors.newPassword = newPasswordError;

  if (input.newPassword && input.newPassword === input.currentPassword) {
    errors.newPassword = "Choose a password you haven't used here before.";
  }

  if (input.confirmPassword !== input.newPassword) {
    errors.confirmPassword = "Both passwords must match.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  await connectToDatabase();
  const user = await User.findById(current.id).select("+passwordHash").exec();

  if (!user) redirect("/login");

  const matches = await verifyPassword(
    input.currentPassword,
    user.passwordHash,
  );
  if (!matches) {
    return {
      ok: false,
      errors: { currentPassword: "That isn't your current password." },
    };
  }

  const wasForced = user.mustChangePassword;

  user.passwordHash = await hashPassword(input.newPassword);
  user.mustChangePassword = false;
  await user.save();

  await writeAudit(current, {
    action: "account.password.change",
    targetType: "User",
    targetId: current.id,
    summary: wasForced
      ? "Replaced their temporary password"
      : "Changed their own password",
    request: await requestContext(),
  });

  redirect(ROLE_HOME[current.role]);
}
