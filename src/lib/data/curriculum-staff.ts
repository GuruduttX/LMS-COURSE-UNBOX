/**
 * Curriculum reads for the staff side.
 *
 * The student reads (`curriculum-db.ts`) answer "what may this person see and
 * how far have they got". These answer a different question — "what exists, and
 * how much of it is finished" — so they include drafts, count things a student
 * never needs counted, and carry no progress at all.
 *
 * Scope is applied **in the query**, not after it: a teacher's course list is
 * built from their assignments rather than filtered down from everything, so a
 * bug here under-fetches rather than leaking.
 */
import "server-only";
import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/guards";
import { Assessment } from "@/models/Assessment";
import { Assignment } from "@/models/Assignment";
import { Course } from "@/models/Course";
import { Module } from "@/models/Module";
import { Program } from "@/models/Program";
import { Subtopic } from "@/models/Subtopic";
import { Topic } from "@/models/Topic";
import type { NodeStatus } from "@/lib/curriculum/rules";

export type ProgramSummary = {
  slug: string;
  title: string;
  summary: string;
  status: NodeStatus;
  courses: number;
  modules: number;
  subtopics: number;
  /** How much is still unpublished — the number a teacher is working through. */
  drafts: number;
};

/** Every program, with enough shape to see what state it is in. */
export async function listProgramsForStaff(): Promise<ProgramSummary[]> {
  await connectToDatabase();

  const programs = await Program.find({ status: { $ne: "archived" } })
    .sort({ order: 1, title: 1 })
    .lean();

  if (programs.length === 0) return [];

  const ids = programs.map((program) => program._id);
  const live = { programId: { $in: ids }, status: { $ne: "archived" as const } };

  // Three grouped counts rather than a query per program.
  const [courses, modules, subtopics] = await Promise.all([
    countBy(Course, live),
    countBy(Module, live),
    countBy(Subtopic, live),
  ]);

  const [courseDrafts, moduleDrafts, subtopicDrafts] = await Promise.all([
    countBy(Course, { ...live, status: "draft" }),
    countBy(Module, { ...live, status: "draft" }),
    countBy(Subtopic, { ...live, status: "draft" }),
  ]);

  return programs.map((program) => {
    const id = String(program._id);
    return {
      slug: program.slug,
      title: program.title,
      summary: program.summary ?? "",
      status: program.status as NodeStatus,
      courses: courses.get(id) ?? 0,
      modules: modules.get(id) ?? 0,
      subtopics: subtopics.get(id) ?? 0,
      drafts:
        (courseDrafts.get(id) ?? 0) +
        (moduleDrafts.get(id) ?? 0) +
        (subtopicDrafts.get(id) ?? 0),
    };
  });
}

export type TeacherProgram = {
  slug: string;
  title: string;
  summary: string;
  courses: number;
  modules: number;
  subtopics: number;
  drafts: number;
};

/**
 * The programs this teacher authors.
 *
 * **Staff are assigned to programs, not to courses.** A teacher who owns a
 * program owns everything inside it — its courses are how the content is
 * organised, not a separate thing to be granted. `Assignment.courseIds` still
 * exists and `ownsCourse` still honours it, so a narrower scope stays
 * expressible, but nothing sets one and this list does not filter on it.
 *
 * An admin gets every program, because `requireRole` admits them everywhere and
 * a list that then showed nothing would be a confusing lie.
 */
export async function programsForTeacher(
  user: CurrentUser,
): Promise<TeacherProgram[]> {
  const all = await listProgramsForStaff();

  if (user.role === "admin") return all;

  const mine = new Set(user.assignments.map((row) => row.programSlug));
  return all.filter((program) => mine.has(program.slug));
}

export type AuthoredCounts = {
  topics: number;
  subtopics: number;
  assignments: number;
  moduleTests: number;
  finalTests: number;
  termTests: number;
  /** Tests that exist but have no questions — the "not ready" number. */
  emptyTests: number;
};

/** What a program actually contains, for the admin's program page. */
export async function authoredCounts(
  programSlug: string,
): Promise<AuthoredCounts | null> {
  await connectToDatabase();

  const program = await Program.findOne({ slug: programSlug }).select("_id").lean();
  if (!program) return null;

  const live = { programId: program._id, status: { $ne: "archived" as const } };

  const [topics, subtopics, assignments, assessments] = await Promise.all([
    Topic.countDocuments(live),
    Subtopic.countDocuments(live),
    Assignment.countDocuments(live),
    Assessment.find(live).select("scope questions").lean(),
  ]);

  return {
    topics,
    subtopics,
    assignments,
    moduleTests: assessments.filter((row) => row.scope === "module_test").length,
    finalTests: assessments.filter((row) => row.scope === "final_test").length,
    termTests: assessments.filter((row) => row.scope === "term_test").length,
    emptyTests: assessments.filter((row) => (row.questions?.length ?? 0) === 0)
      .length,
  };
}

/* --------------------------------- helpers -------------------------------- */

async function countBy(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: { aggregate: (pipeline: any[]) => Promise<any[]> },
  match: Record<string, unknown>,
  field: "programId" | "courseId" = "programId",
): Promise<Map<string, number>> {
  const rows = await model.aggregate([
    { $match: match },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  ]);

  return new Map(
    rows.map((row: { _id: Types.ObjectId; count: number }) => [
      String(row._id),
      row.count,
    ]),
  );
}
