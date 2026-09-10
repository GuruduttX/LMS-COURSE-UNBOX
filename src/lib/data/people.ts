import "server-only";

import { connectToDatabase } from "@/lib/db";
import { isRole, type Role } from "@/lib/auth/roles";
import { COURSES } from "@/lib/data/home";
import { Batch } from "@/models/Batch";
import { Course } from "@/models/Course";
import { Program } from "@/models/Program";
import { User } from "@/models/User";

/**
 * Reads behind the admin's people screens. The single seam: pages never build a
 * Mongo query themselves, so the projection that keeps `passwordHash` out of
 * every response is written once here rather than remembered five times.
 */

export type PersonRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: "active" | "suspended";
  assignments: { programSlug: string; courseIds: string[]; batches: string[] }[];
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type PeopleFilters = {
  role: Role | null;
  status: "active" | "suspended" | null;
  q: string;
};

/** Unknown filter values read as "no filter" rather than 404ing. */
export function parsePeopleFilters(query: {
  role?: string;
  status?: string;
  q?: string;
}): PeopleFilters {
  return {
    role: isRole(query.role) ? query.role : null,
    status:
      query.status === "active" || query.status === "suspended"
        ? query.status
        : null,
    q: (query.q ?? "").trim(),
  };
}

export async function listPeople(filters: PeopleFilters): Promise<PersonRow[]> {
  await connectToDatabase();

  const where: Record<string, unknown> = {};
  if (filters.role) where.role = filters.role;
  if (filters.status) where.status = filters.status;
  if (filters.q) {
    // Escaped: a name with "(" in it is a search term, not a broken regex.
    const safe = filters.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    where.$or = [
      { name: { $regex: safe, $options: "i" } },
      { email: { $regex: safe, $options: "i" } },
    ];
  }

  const docs = await User.find(where)
    .select("name email phone role status assignments mustChangePassword lastLoginAt createdAt")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return docs.map(toRow);
}

export async function getPerson(id: string): Promise<PersonRow | null> {
  await connectToDatabase();

  // A malformed id is "no such person", not a 500.
  if (!/^[0-9a-fA-F]{24}$/.test(id)) return null;

  const doc = await User.findById(id)
    .select("name email phone role status assignments mustChangePassword lastLoginAt createdAt")
    .lean();

  return doc ? toRow(doc) : null;
}

/**
 * Programs and their courses, for the assignment picker.
 *
 * Real programs now, drafts included: an admin assigning a teacher to a program
 * still being written is the normal case, and a picker that hid it would make
 * the program unstaffable until it went live.
 *
 * Three queries rather than one per program. The **batches** are what a teacher
 * is actually assigned to (see models/User.ts), so they are the picker's main
 * event; `courseIds` is a narrower scope nothing currently sets, but the picker
 * keeps offering it, so the courses come along too.
 *
 * Closed batches are included, unlike the enrol picker's `batchOptionsFor`: a
 * cohort that has stopped taking students is still being taught, and staffing
 * one is exactly the thing an admin might be here to fix.
 */
export async function assignablePrograms(): Promise<
  {
    slug: string;
    title: string;
    courses: { id: string; title: string }[];
    batches: string[];
  }[]
> {
  await connectToDatabase();

  const [programs, courses, batches] = await Promise.all([
    Program.find({ status: { $ne: "archived" } })
      .sort({ order: 1, title: 1 })
      .select("_id slug title")
      .lean(),
    Course.find({ status: { $ne: "archived" } })
      .sort({ order: 1 })
      .select("programId key title")
      .lean(),
    Batch.find({}).sort({ name: 1 }).select("programSlug name").lean(),
  ]);

  return programs.map((program) => ({
    slug: program.slug,
    title: program.title,
    courses: courses
      .filter((course) => String(course.programId) === String(program._id))
      .map((course) => ({ id: course.key, title: course.title })),
    batches: batches
      .filter((batch) => batch.programSlug === program.slug)
      .map((batch) => batch.name),
  }));
}

/** Program titles for an assignment list, falling back to the raw slug. */
export function programTitle(slug: string): string {
  return COURSES.find((course) => course.slug === slug)?.title ?? slug;
}

type Lean = {
  _id: unknown;
  name: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
  assignments?: {
    programSlug: string;
    courseIds?: string[];
    batches?: string[];
  }[];
  mustChangePassword?: boolean;
  lastLoginAt?: Date | null;
  createdAt?: Date;
};

function toRow(doc: Lean): PersonRow {
  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    phone: doc.phone ?? "",
    role: doc.role as Role,
    status: doc.status as "active" | "suspended",
    assignments: (doc.assignments ?? []).map((item) => ({
      programSlug: item.programSlug,
      courseIds: item.courseIds ?? [],
      batches: item.batches ?? [],
    })),
    mustChangePassword: Boolean(doc.mustChangePassword),
    lastLoginAt: doc.lastLoginAt ? doc.lastLoginAt.toISOString() : null,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
  };
}
