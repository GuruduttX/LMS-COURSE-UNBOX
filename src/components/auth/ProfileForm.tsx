"use client";

import { Briefcase, CheckCircle2, GraduationCap, MapPin, UserRound } from "lucide-react";
import { useActionState, useState } from "react";

import { updateProfile } from "@/app/account/profile/actions";
import {
  EMPTY_PROFILE_STATE,
  type ProfileState,
  type ProfileView,
} from "@/app/account/profile/state";
import { Avatar } from "@/components/auth/Avatar";
import { Button } from "@/components/ui/Button";
import { Field, TextInput, Textarea } from "@/components/ui/Field";
import { FileUpload } from "@/components/ui/FileUpload";
import { AVATAR_KINDS, type UploadedFile } from "@/lib/uploads/kinds";

/**
 * Everything on the profile someone may change about themselves, as one form
 * across several cards.
 *
 * One `<form>` rather than one per card, deliberately: these are facts about
 * the same person, and four Save buttons would make a student wonder which of
 * them they had forgotten to press. The cards are grouping, not separate
 * transactions.
 *
 * Email and role are not here because they are not editable — the page shows
 * them as facts. See `actions.ts` for why.
 */
function Card({
  title,
  description,
  Icon,
  children,
}: {
  title: string;
  description?: string;
  Icon: typeof UserRound;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon size={17} aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-bold text-ink-900">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-ink-600">{description}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-5">{children}</div>
    </section>
  );
}

export function ProfileForm({ profile }: { profile: ProfileView }) {
  const [state, formAction, isPending] = useActionState<ProfileState, FormData>(
    updateProfile,
    EMPTY_PROFILE_STATE,
  );

  // Local, because the experience fields are revealed by it and the server
  // round trip is far too slow to hide a fieldset behind.
  const [hasExperience, setHasExperience] = useState(
    profile.experience.hasExperience,
  );
  // The picture is the one field with a preview worth showing before saving.
  const [avatar, setAvatar] = useState<UploadedFile | null>(profile.avatar);

  return (
    <form action={formAction} noValidate className="space-y-6">
      <Card
        title="Profile picture"
        description="A clear photo of your face. JPEG, PNG or WebP, up to 2 MB."
        Icon={UserRound}
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-2">
            <Avatar name={profile.name} src={avatar?.url} size="lg" />
            <span className="text-2xs font-medium uppercase tracking-wider text-ink-400">
              {avatar ? "Preview" : "No photo"}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <FileUpload
              name="avatar"
              scope="profile"
              accept={AVATAR_KINDS}
              required={false}
              defaultValue={profile.avatar ? [profile.avatar] : []}
              onChange={(files) => setAvatar(files[0] ?? null)}
              error={state.errors.avatar}
              hint="Remove the current photo to go back to your initials."
            />
          </div>
        </div>
      </Card>

      <Card
        title="Personal details"
        description="How we address you, and how we reach you."
        Icon={MapPin}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label="Full name" error={state.errors.name} required>
            <TextInput
              id="name"
              name="name"
              defaultValue={profile.name}
              autoComplete="name"
              maxLength={80}
              hasError={Boolean(state.errors.name)}
            />
          </Field>

          <Field id="phone" label="Phone" error={state.errors.phone}>
            <TextInput
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={profile.phone}
              autoComplete="tel"
              placeholder="9876543210"
              hasError={Boolean(state.errors.phone)}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field
              id="address"
              label="Address"
              error={state.errors.address}
              hint="Where you're based — city and state is enough."
            >
              <Textarea
                id="address"
                name="address"
                rows={3}
                maxLength={300}
                defaultValue={profile.address}
                autoComplete="street-address"
                hasError={Boolean(state.errors.address)}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card
        title="Education"
        description="The last thing you studied."
        Icon={GraduationCap}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              id="qualificationTitle"
              label="Qualification"
              error={state.errors.qualificationTitle}
            >
              <TextInput
                id="qualificationTitle"
                name="qualificationTitle"
                defaultValue={profile.qualification.title}
                placeholder="B.Tech Computer Science"
                maxLength={120}
                hasError={Boolean(state.errors.qualificationTitle)}
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field
              id="institution"
              label="College or school"
              error={state.errors.institution}
            >
              <TextInput
                id="institution"
                name="institution"
                defaultValue={profile.qualification.institution}
                placeholder="Delhi Technological University"
                maxLength={120}
                hasError={Boolean(state.errors.institution)}
              />
            </Field>
          </div>

          <Field
            id="completedYear"
            label="Year completed"
            error={state.errors.completedYear}
          >
            <TextInput
              id="completedYear"
              name="completedYear"
              inputMode="numeric"
              defaultValue={profile.qualification.completedYear}
              placeholder="2024"
              maxLength={4}
              hasError={Boolean(state.errors.completedYear)}
            />
          </Field>

          {/* Free text, not a number: a percentage, a CGPA and a letter grade
              are three different scales, and flattening them loses which. */}
          <Field
            id="marks"
            label="Marks"
            error={state.errors.marks}
            hint="Percentage, CGPA or grade."
          >
            <TextInput
              id="marks"
              name="marks"
              defaultValue={profile.qualification.marks}
              placeholder="78% or 8.4 CGPA"
              maxLength={40}
              hasError={Boolean(state.errors.marks)}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Work experience"
        description="Only if you've worked before — plenty of people haven't."
        Icon={Briefcase}
      >
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:border-border-strong">
          <input
            type="checkbox"
            name="hasExperience"
            checked={hasExperience}
            onChange={(event) => setHasExperience(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
          />
          <span>
            <span className="block text-sm font-medium text-ink-900">
              I have working experience
            </span>
            <span className="block text-xs text-ink-500">
              Tick this to add the role you held.
            </span>
          </span>
        </label>

        {hasExperience ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              id="experienceRole"
              label="Role"
              error={state.errors.experienceRole}
              required
            >
              <TextInput
                id="experienceRole"
                name="experienceRole"
                defaultValue={profile.experience.role}
                placeholder="Junior developer"
                maxLength={100}
                hasError={Boolean(state.errors.experienceRole)}
              />
            </Field>

            <Field
              id="company"
              label="Company"
              error={state.errors.company}
              required
            >
              <TextInput
                id="company"
                name="company"
                defaultValue={profile.experience.company}
                placeholder="Infosys"
                maxLength={100}
                hasError={Boolean(state.errors.company)}
              />
            </Field>

            <Field
              id="duration"
              label="How long"
              error={state.errors.duration}
              required
            >
              <TextInput
                id="duration"
                name="duration"
                defaultValue={profile.experience.duration}
                placeholder="2 years"
                maxLength={40}
                hasError={Boolean(state.errors.duration)}
              />
            </Field>
          </div>
        ) : null}
      </Card>

      {/* Sticky, because the form is taller than a phone screen and a Save
          button you have to scroll to find is a form people abandon. */}
      <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save profile"}
        </Button>

        {state.saved && !isPending ? (
          <p
            role="status"
            className="flex items-center gap-1.5 text-sm font-medium text-ink-600"
          >
            <CheckCircle2 size={15} aria-hidden className="text-success-700" />
            Saved.
          </p>
        ) : Object.keys(state.errors).length > 0 ? (
          <p role="status" className="text-sm font-medium text-danger-700">
            Check the highlighted fields.
          </p>
        ) : null}
      </div>
    </form>
  );
}
