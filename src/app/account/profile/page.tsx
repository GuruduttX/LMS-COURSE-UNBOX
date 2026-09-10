import { AtSign, CalendarDays, Phone } from "lucide-react";
import type { Metadata } from "next";

import { AccountShell } from "@/components/auth/AccountShell";
import { Avatar } from "@/components/auth/Avatar";
import { ProfileForm } from "@/components/auth/ProfileForm";
import { requireUser } from "@/lib/auth/guards";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { getOwnProfile } from "@/lib/data/profile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile",
};

/**
 * Your own account: who the system thinks you are, and everything about that
 * you are allowed to change.
 *
 * Laid out as a profile rather than a settings form — an identity banner first,
 * because "which account am I signed in as" is the question that brings most
 * people here, then the editable sections beneath it. Email and role sit in the
 * banner as read-only facts; see `actions.ts` for why they are not fields.
 */
export default async function ProfilePage() {
  const [user, profile] = await Promise.all([requireUser(), getOwnProfile()]);

  const joined = profile.joinedAt
    ? new Date(profile.joinedAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <AccountShell
      role={user.role}
      width="wide"
      title="Profile"
      description="Your details, as they appear to your teachers and program manager."
      header={
        <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          {/* A band of brand colour rather than an uploadable cover image: one
              picture per person is enough to ask for, and this still gives the
              avatar something to sit against. */}
          <div className="h-24 bg-linear-to-r from-brand-600 to-brand-solid sm:h-28" />

          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Avatar
                  name={profile.name}
                  src={profile.avatar?.url}
                  size="lg"
                  className="border-4 border-surface bg-brand-100 shadow-sm"
                />

                <div className="min-w-0 pb-1">
                  <h1 className="truncate text-xl font-extrabold tracking-tight text-ink-900 sm:text-2xl">
                    {profile.name}
                  </h1>
                  <p className="mt-1 inline-flex rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-semibold text-ink-600">
                    {ROLE_LABEL[user.role]}
                  </p>
                </div>
              </div>
            </div>

            <dl className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
              <Fact Icon={AtSign} label="Email" value={profile.email} />
              <Fact
                Icon={Phone}
                label="Phone"
                value={profile.phone || "Not added yet"}
                muted={!profile.phone}
              />
              <Fact
                Icon={CalendarDays}
                label="Member since"
                value={joined ?? "—"}
                muted={!joined}
              />
            </dl>

            <p className="mt-4 text-xs text-ink-500">
              Your email address and role are set by the team. Ask your program
              manager if either needs to change.
            </p>
          </div>
        </section>
      }
    >
      <ProfileForm profile={profile} />
    </AccountShell>
  );
}

function Fact({
  Icon,
  label,
  value,
  muted = false,
}: {
  Icon: typeof AtSign;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={16} aria-hidden className="mt-0.5 shrink-0 text-ink-400" />
      <div className="min-w-0">
        <dt className="text-xs font-medium text-ink-500">{label}</dt>
        <dd
          className={`mt-0.5 truncate text-sm ${muted ? "text-ink-400" : "text-ink-900"}`}
        >
          {value}
        </dd>
      </div>
    </div>
  );
}
