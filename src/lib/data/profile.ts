import "server-only";

import type { ProfileView } from "@/app/account/profile/state";
import { requireUser } from "@/lib/auth/guards";
import type { UploadedFile } from "@/lib/uploads/kinds";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";

/**
 * The signed-in person's own profile, in full.
 *
 * Not part of `CurrentUser`: the guards carry only what an authorization
 * decision needs, and widening them would put an address on every request in
 * the app. This is read by the one screen that shows it.
 */
export async function getOwnProfile(): Promise<ProfileView> {
  const user = await requireUser();

  await connectToDatabase();
  const doc = await User.findById(user.id)
    .select("name email phone address avatar qualification experience createdAt")
    .lean();

  const qualification = doc?.qualification ?? null;
  const experience = doc?.experience ?? null;

  return {
    id: user.id,
    name: doc?.name ?? user.name,
    email: doc?.email ?? user.email,
    phone: doc?.phone ?? "",
    address: doc?.address ?? "",
    // Cast: the embedded schema mirrors `UploadedFile` field for field, and
    // everything stored went through `parseUploadedFiles` on the way in.
    avatar: (doc?.avatar as UploadedFile | null) ?? null,
    qualification: {
      title: qualification?.title ?? "",
      institution: qualification?.institution ?? "",
      completedYear: qualification?.completedYear
        ? String(qualification.completedYear)
        : "",
      marks: qualification?.marks ?? "",
    },
    experience: {
      hasExperience: Boolean(experience?.hasExperience),
      role: experience?.role ?? "",
      company: experience?.company ?? "",
      duration: experience?.duration ?? "",
    },
    joinedAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
  };
}
