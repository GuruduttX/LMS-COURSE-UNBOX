"use server";

import { redirect } from "next/navigation";

import {
  recordAudit,
  requestContext,
  writeAudit,
  type AuditActor,
} from "@/lib/auth/audit";
import { getCurrentUser } from "@/lib/auth/guards";
import { createSession, destroySession } from "@/lib/auth/session";
import { DUMMY_HASH, verifyPassword } from "@/lib/auth/password";
import { ROLE_HOME, areaFor, type Role } from "@/lib/auth/roles";
import { connectToDatabase } from "@/lib/db";
import { validateCredentials, hasErrors } from "@/lib/validation/auth";
import type { SignInState } from "@/lib/auth/sign-in-state";
import { User } from "@/models/User";

/** Attempts allowed before the account is locked, and for how long. */
const MAX_ATTEMPTS = 10;
const LOCKOUT_MINUTES = 15;

/**
 * Sign in.
 *
 * Three things here are deliberate and easy to undo by accident:
 *
 * - **One message for every failure.** "Email or password is incorrect" —
 *   never "no such user", which turns the login form into a tool for finding
 *   out who has an account.
 * - **A hash comparison always runs**, against DUMMY_HASH when the email is
 *   unknown. Otherwise a missing account answers in ~1ms and a real one in
 *   ~250ms, and the timing says what the message refused to.
 * - **Lockout after MAX_ATTEMPTS**, tracked on the user document rather than in
 *   memory, so it survives a serverless cold start.
 */
export async function signIn(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const input = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
  const next = String(formData.get("next") ?? "");
  const values = { email: input.email };

  const errors = validateCredentials(input);
  if (hasErrors(errors)) return { ok: false, errors, values };

  await connectToDatabase();
  const user = await User.findOne({ email: input.email.trim().toLowerCase() })
    .select("+passwordHash name email role status failedAttempts lockedUntil")
    .exec();

  // Logged for every branch below. The audit trail is allowed to know things
  // the *response* still refuses to say — none of this reaches the browser.
  const request = await requestContext();
  const attempted = input.email.trim().toLowerCase();

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    await recordAudit(actorFor(user, attempted), {
      action: "auth.login.failed",
      targetType: "Session",
      targetId: user ? String(user._id) : null,
      summary: `Sign-in refused for ${attempted} — account is locked`,
      request,
    });

    const minutes = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / 60_000,
    );
    return {
      ok: false,
      values,
      errors: {
        form: `Too many attempts. Try again in ${minutes} minute${
          minutes === 1 ? "" : "s"
        }.`,
      },
    };
  }

  const matches = await verifyPassword(
    input.password,
    user?.passwordHash ?? DUMMY_HASH,
  );

  // A suspended account is refused exactly like a wrong password: someone who
  // has been removed learns nothing about whether their login still exists.
  if (!user || !matches || user.status !== "active") {
    let locked = false;

    if (user && matches === false) {
      const failed = (user.failedAttempts ?? 0) + 1;
      user.failedAttempts = failed;
      if (failed >= MAX_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
        user.failedAttempts = 0;
        locked = true;
      }
      await user.save();
    }

    const actor = actorFor(user, attempted);
    await recordAudit(actor, {
      action: "auth.login.failed",
      targetType: "Session",
      targetId: user ? String(user._id) : null,
      summary: !user
        ? `Sign-in failed for ${attempted} — no such account`
        : user.status !== "active"
          ? `Sign-in refused for ${attempted} — account is suspended`
          : `Sign-in failed for ${attempted} — wrong password`,
      request,
    });

    if (locked && user) {
      await recordAudit(actor, {
        action: "auth.lockout",
        targetType: "User",
        targetId: String(user._id),
        summary: `Locked ${user.name} out for ${LOCKOUT_MINUTES} minutes after ${MAX_ATTEMPTS} failed sign-ins`,
        request,
      });
    }

    return {
      ok: false,
      values,
      errors: { form: "Email or password is incorrect." },
    };
  }

  user.failedAttempts = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  await user.save();

  await recordAudit(
    {
      kind: "user",
      id: String(user._id),
      name: user.name,
      role: user.role as Role,
      email: user.email,
    },
    {
      action: "auth.login",
      targetType: "Session",
      targetId: String(user._id),
      summary: "Signed in",
      request,
    },
  );

  await createSession({
    id: String(user._id),
    role: user.role as Role,
    name: user.name,
  });

  redirect(landingFor(user.role as Role, next));
}

export async function signOut(): Promise<void> {
  // Read who is leaving *before* the cookie is cleared — afterwards there is
  // nobody to attribute the entry to.
  const user = await getCurrentUser();
  if (user) {
    await writeAudit(user, {
      action: "auth.logout",
      targetType: "Session",
      targetId: user.id,
      summary: "Signed out",
      request: await requestContext(),
    });
  }

  await destroySession();
  redirect("/login");
}

/**
 * The actor for a failed sign-in: the account when the email matched one,
 * otherwise just the email that was typed. Either way the attempt is on record
 * — an unknown email tried a hundred times is exactly what you want to see.
 */
function actorFor(
  user: { _id: unknown; name: string; email: string; role: string } | null,
  attempted: string,
): AuditActor {
  return user
    ? {
        kind: "user",
        id: String(user._id),
        name: user.name,
        role: user.role as Role,
        email: user.email,
      }
    : { kind: "anonymous", email: attempted };
}

/**
 * Where a successful login lands.
 *
 * `?next=` is honoured only when it is a relative path *and* the role may
 * actually enter that area — otherwise it is an open-redirect hole, or a
 * bounce-loop straight back to the login page.
 */
function landingFor(role: Role, next: string): string {
  const home = ROLE_HOME[role];
  if (!next.startsWith("/") || next.startsWith("//")) return home;

  const area = areaFor(next);
  if (area && !area.roles.includes(role) && role !== "admin") return home;

  return next;
}
