"use server";

import { revalidatePath } from "next/cache";

import { writeAudit } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db";
import { destroyAsset } from "@/lib/uploads/cloudinary";
import { AVATAR_KINDS, parseUploadedFiles } from "@/lib/uploads/kinds";
import {
  normaliseExperience,
  validateProfile,
  type ProfileInput,
} from "@/lib/validation/profile";
import { User } from "@/models/User";

import type { ProfileState } from "./state";

/**
 * Edit your own profile.
 *
 * Deliberately narrow in one respect: email and role are what the account *is*
 * to everyone else — an admin changes those, or nobody does. Letting someone
 * edit their own role here would be a privilege escalation with a form around
 * it. Everything else on this screen is the person describing themselves, and
 * is theirs to change.
 *
 * `requireUser` re-reads the database, so the id written to is always the
 * signed-in user's; nothing about the target comes from the form.
 */
export async function updateProfile(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const current = await requireUser();

  const text = (key: string) => String(formData.get(key) ?? "").trim();

  const input: ProfileInput = {
    name: text("name"),
    phone: text("phone"),
    address: text("address"),
    qualification: {
      title: text("qualificationTitle"),
      institution: text("institution"),
      completedYear: text("completedYear"),
      marks: text("marks"),
    },
    experience: {
      hasExperience: formData.get("hasExperience") === "on",
      role: text("experienceRole"),
      company: text("company"),
      duration: text("duration"),
    },
  };

  const errors = validateProfile(input);

  // The upload field posts JSON, so a forged post could name any URL on the
  // internet — `parseUploadedFiles` is what re-checks that we hosted it.
  const parsed = parseUploadedFiles(String(formData.get("avatar") ?? ""), [
    ...AVATAR_KINDS,
  ]);
  if (parsed.error) errors.avatar = parsed.error;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  await connectToDatabase();

  const previous = await User.findById(current.id)
    .select("name phone address avatar qualification experience")
    .lean();
  const avatar = parsed.files[0] ?? null;
  const experience = normaliseExperience(input.experience);
  const year = input.qualification.completedYear;

  await User.updateOne(
    { _id: current.id },
    {
      $set: {
        name: input.name,
        phone: input.phone,
        address: input.address,
        avatar,
        qualification: {
          title: input.qualification.title,
          institution: input.qualification.institution,
          completedYear: year ? Number(year) : null,
          marks: input.qualification.marks,
        },
        experience,
      },
    },
  ).exec();

  // The old picture is only destroyed once the row pointing at it is gone —
  // the other order leaves a record referencing bytes we have already deleted.
  const old = previous?.avatar;
  if (old?.publicId && old.publicId !== avatar?.publicId) {
    await destroyAsset(
      old.publicId,
      old.resourceType as "image" | "raw",
    ).catch(() => {
      // A stranded asset is untidy; a failed save over it would be worse.
    });
  }

  // Which fields moved, not what they moved to: an audit reader wants to know
  // that someone changed their phone number, not to be handed a directory of
  // everyone's phone numbers by scrolling the log.
  const changed = [
    previous?.name !== input.name && "name",
    (previous?.phone ?? "") !== input.phone && "phone",
    (previous?.address ?? "") !== input.address && "address",
    (previous?.avatar?.publicId ?? null) !== (avatar?.publicId ?? null) &&
      "photo",
    JSON.stringify(previous?.qualification ?? null) !==
      JSON.stringify(input.qualification) && "qualification",
    JSON.stringify(previous?.experience ?? null) !== JSON.stringify(experience) &&
      "experience",
  ].filter((field): field is string => typeof field === "string");

  if (changed.length > 0) {
    await writeAudit(current, {
      action: "account.profile.update",
      targetType: "User",
      targetId: current.id,
      summary: `Updated their own ${listOut(changed)}`,
      meta: { fields: changed },
    });
  }

  // The header greeting and avatar are rendered from this record.
  revalidatePath("/", "layout");

  return { ok: true, saved: true, errors: {} };
}

/** "name, phone and photo" — the summary is a sentence, not an array literal. */
function listOut(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
