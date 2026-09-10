/**
 * Who teaches a batch, who teaches a program, and who could.
 *
 * Assignment lives on the **user** (`User.assignments[]`), not on the batch:
 * few rows, always read with the user, and it is what every guard already
 * consults. So "the teachers on this cohort" is a query against users, and
 * adding one is an update to that user's document.
 *
 * The one wrinkle a batch introduces is that "covers this batch" is two things:
 * the batch is named on the assignment, **or** the assignment names no batches
 * at all, which means every one of them (models/User.ts). Both readers below
 * spell that out as a two-branch `$or` rather than filtering in memory, so the
 * database returns the answer the guards would give.
 */
import "server-only";
import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { LiveSession } from "@/models/LiveSession";
import { User } from "@/models/User";

import { sessionBatchFilter } from "./session-batches";

export type BatchTeacher = {
  id: string;
  name: string;
  email: string;
  status: "active" | "suspended";
  /**
   * True when they hold the whole program rather than this cohort by name —
   * an assignment written before batches existed, or one made from the admin's
   * person form. They cannot be removed *from this batch*, only from the
   * program, so the panel says so instead of offering a button that refuses.
   */
  coversWholeProgram: boolean;
  /**
   * Sessions of this cohort still ahead of them — this batch's own, plus the
   * program-wide ones every cohort attends.
   *
   * Shown before removing someone: taking a teacher off a batch does not
   * unbook the classes they were down to take, and whoever removes them should
   * know that before they click rather than after.
   */
  upcomingSessions: number;
};

/** The teachers who cover one cohort — named on it, or holding the program. */
export async function teachersOnBatch(
  programSlug: string,
  batchName: string,
): Promise<BatchTeacher[]> {
  await connectToDatabase();

  const teachers = await User.find({
    role: "teacher",
    assignments: {
      $elemMatch: {
        programSlug,
        $or: [{ batches: batchName }, { batches: { $size: 0 } }],
      },
    },
  })
    .select("name email status assignments")
    .sort({ name: 1 })
    .lean();

  if (teachers.length === 0) return [];

  // `sessionBatchFilter` already folds the program-wide session into every
  // cohort's answer, so this batch's own classes and the shared ones both count
  // — each is a class this teacher would still be taking these students.
  const counts = await upcomingByTeacher(
    programSlug,
    teachers.map((teacher) => teacher._id),
    [batchName],
  );

  return teachers.map((teacher) => ({
    id: String(teacher._id),
    name: teacher.name,
    email: teacher.email,
    status: teacher.status as "active" | "suspended",
    coversWholeProgram:
      (teacher.assignments ?? []).find(
        (item) => item.programSlug === programSlug,
      )?.batches?.length === 0,
    upcomingSessions: counts.get(String(teacher._id)) ?? 0,
  }));
}

export type ProgramTeacher = {
  id: string;
  name: string;
  email: string;
  status: "active" | "suspended";
  /** The cohorts they take. Empty means every batch — see `coversWholeProgram`. */
  batches: string[];
  coversWholeProgram: boolean;
  /** Upcoming sessions anywhere on this program. */
  upcomingSessions: number;
};

/**
 * Everyone teaching anywhere on a program, with the cohorts each one takes.
 *
 * The program screen's roll-up: staffing is decided per batch, and this is
 * where you see the shape of it in one place. Read-only by design — the one
 * thing it can do is take somebody off the program entirely, which is the only
 * staffing change a batch panel cannot express.
 */
export async function teachersOnProgram(
  programSlug: string,
): Promise<ProgramTeacher[]> {
  await connectToDatabase();

  const teachers = await User.find({
    role: "teacher",
    "assignments.programSlug": programSlug,
  })
    .select("name email status assignments")
    .sort({ name: 1 })
    .lean();

  if (teachers.length === 0) return [];

  const counts = await upcomingByTeacher(
    programSlug,
    teachers.map((teacher) => teacher._id),
    null,
  );

  return teachers.map((teacher) => {
    const batches =
      (teacher.assignments ?? []).find(
        (item) => item.programSlug === programSlug,
      )?.batches ?? [];

    return {
      id: String(teacher._id),
      name: teacher.name,
      email: teacher.email,
      status: teacher.status as "active" | "suspended",
      batches: [...batches].sort((a, b) => a.localeCompare(b)),
      coversWholeProgram: batches.length === 0,
      upcomingSessions: counts.get(String(teacher._id)) ?? 0,
    };
  });
}

export type AssignableTeacher = { id: string; name: string; email: string };

/**
 * Teachers who could be added to this cohort.
 *
 * Active accounts only. A suspended teacher already on the batch stays listed
 * by `teachersOnBatch` — suspension is not removal — but there is no reason to
 * offer one as a new choice. Anyone who already covers the cohort, by name or
 * by holding the program, is left out for the same reason.
 */
export async function assignableTeachersForBatch(
  programSlug: string,
  batchName: string,
): Promise<AssignableTeacher[]> {
  await connectToDatabase();

  const teachers = await User.find({
    role: "teacher",
    status: "active",
    assignments: {
      $not: {
        $elemMatch: {
          programSlug,
          $or: [{ batches: batchName }, { batches: { $size: 0 } }],
        },
      },
    },
  })
    .select("name email")
    .sort({ name: 1 })
    .lean();

  return teachers.map((teacher) => ({
    id: String(teacher._id),
    name: teacher.name,
    email: teacher.email,
  }));
}

/* -------------------------------- internals ------------------------------- */

/**
 * Upcoming scheduled sessions per teacher, in one grouped count.
 *
 * `batches` null counts the whole program; a list narrows to those cohorts plus
 * the program-wide sessions they all attend.
 */
async function upcomingByTeacher(
  programSlug: string,
  teacherIds: unknown[],
  batches: string[] | null,
): Promise<Map<string, number>> {
  if (teacherIds.length === 0) return new Map();

  const rows = await LiveSession.aggregate<{
    _id: Types.ObjectId;
    count: number;
  }>([
    {
      $match: {
        programSlug,
        status: "scheduled",
        startsAt: { $gte: new Date() },
        teacherId: { $in: teacherIds },
        ...sessionBatchFilter(batches),
      },
    },
    { $group: { _id: "$teacherId", count: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [String(row._id), row.count]));
}
