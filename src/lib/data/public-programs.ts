import "server-only";

/**
 * What a visitor sees — the only module the public pages read programs through.
 *
 * This replaces the `COURSES` array that used to live in `data/home.ts`. That
 * array held four hand-written programs, so the home page advertised courses
 * that were not in the database and hid every program created since through the
 * admin UI. See `models/Program.ts` for why reading the database here is not the
 * entitlement problem it was once thought to be.
 *
 * ## Two rules everything below follows
 *
 * **Published means reachable, not merely flagged.** Every node denormalises
 * `programId`, so `Module.countDocuments({ programId, status: "published" })`
 * would count a published module sitting inside a *draft* course — lessons no
 * visitor could ever reach, added to a number shown to them as a promise. The
 * counts here are chained parent to child instead. (`curriculum-staff.ts` counts
 * the flat way on purpose: "how much have we written" is a different question
 * from "how much can they get to".)
 *
 * **Nothing is invented.** A program with no `marketing` renders as its title,
 * its summary and its real curriculum; a course with no month prints no month; a
 * program with no fee shows no price, not "Free". Every optional field here is
 * nullable rather than defaulted, so a page can tell "nobody said" from "zero".
 */
import { durationMonths } from "@/lib/curriculum/months";
import type { ProgramLevel } from "@/lib/curriculum/rules";
import type { UploadedFile } from "@/lib/uploads/kinds";
import { connectToDatabase } from "@/lib/db";
import { Course } from "@/models/Course";
import { Module } from "@/models/Module";
import { Program } from "@/models/Program";
import { Subtopic } from "@/models/Subtopic";
import { Topic } from "@/models/Topic";

import { getProgramCurriculum } from "./curriculum-db";

/** A cover, ready to render. `alt` is empty by design — see the page. */
export type PublicCover = { url: string; alt: string };

export type PublicProgramCard = {
  slug: string;
  title: string;
  /** The marketing tagline, falling back to the syllabus summary. */
  tagline: string;
  cover: PublicCover | null;
  level: ProgramLevel | null;
  isNew: boolean;
  /** Null when no published course carries a month. Never a guessed number. */
  durationMonths: number | null;
  courseCount: number;
  moduleCount: number;
  lessonCount: number;
  highlights: string[];
  tools: string[];
  placementGuarantee: boolean;
  offers: string[];
  /** Paise, both. Null means no price is published. */
  feeAmount: number | null;
  listAmount: number | null;
  /** "Next batch starts 8 Sep", or "" when nothing is claimed. */
  nextBatch: string;
};

export type PublicModule = {
  id: string;
  number: number;
  title: string;
  lessonCount: number;
};

export type PublicCourse = {
  id: string;
  /** Null for the standalone checkpoints, which print no "Course N". */
  number: number | null;
  title: string;
  summary: string;
  startMonth: number | null;
  endMonth: number | null;
  modules: PublicModule[];
  lessonCount: number;
};

export type PublicProgramDetail = PublicProgramCard & {
  summary: string;
  description: string;
  courses: PublicCourse[];
};

/* --------------------------------- lists ---------------------------------- */

/**
 * Every published program, in the order the admin arranged them.
 *
 * Five flat reads for the whole page rather than `getProgramCurriculum` per
 * program, which would be six queries each. The chain from program to lesson is
 * what makes the counts honest — see the note at the top of this file.
 */
export async function listPublicPrograms(): Promise<PublicProgramCard[]> {
  await connectToDatabase();

  const programs = await Program.find({ status: "published" })
    .sort({ order: 1, title: 1 })
    .lean();
  if (programs.length === 0) return [];

  const programIds = programs.map((program) => program._id);

  const courses = await Course.find({
    programId: { $in: programIds },
    status: "published",
  })
    .select("_id programId startMonth endMonth")
    .lean();

  const modules = await Module.find({
    courseId: { $in: courses.map((course) => course._id) },
    status: "published",
  })
    .select("_id courseId")
    .lean();

  const topics = await Topic.find({
    moduleId: { $in: modules.map((row) => row._id) },
    status: "published",
  })
    .select("_id moduleId")
    .lean();

  const subtopics = await Subtopic.find({
    topicId: { $in: topics.map((row) => row._id) },
    status: "published",
  })
    .select("topicId")
    .lean();

  // Walk back up: lessons per topic, per module, per course, per program.
  const lessonsByTopic = tally(subtopics.map((row) => String(row.topicId)));
  const lessonsByModule = new Map<string, number>();
  for (const topic of topics) {
    add(
      lessonsByModule,
      String(topic.moduleId),
      lessonsByTopic.get(String(topic._id)) ?? 0,
    );
  }

  const modulesByCourse = new Map<string, number>();
  const lessonsByCourse = new Map<string, number>();
  for (const row of modules) {
    add(modulesByCourse, String(row.courseId), 1);
    add(
      lessonsByCourse,
      String(row.courseId),
      lessonsByModule.get(String(row._id)) ?? 0,
    );
  }

  const byProgram = new Map<
    string,
    { courses: number; modules: number; lessons: number; spans: Span[] }
  >();
  for (const course of courses) {
    const key = String(course.programId);
    const entry = byProgram.get(key) ?? {
      courses: 0,
      modules: 0,
      lessons: 0,
      spans: [],
    };

    entry.courses += 1;
    entry.modules += modulesByCourse.get(String(course._id)) ?? 0;
    entry.lessons += lessonsByCourse.get(String(course._id)) ?? 0;
    entry.spans.push({
      startMonth: course.startMonth ?? null,
      endMonth: course.endMonth ?? null,
    });

    byProgram.set(key, entry);
  }

  return programs.map((program) => {
    const counts = byProgram.get(String(program._id));
    return toCard(program, {
      courseCount: counts?.courses ?? 0,
      moduleCount: counts?.modules ?? 0,
      lessonCount: counts?.lessons ?? 0,
      durationMonths: durationMonths(counts?.spans ?? []),
    });
  });
}

/** Just the titles — the enquiry dropdown, which offers nothing else. */
export async function publicProgramTitles(): Promise<string[]> {
  await connectToDatabase();

  const rows = await Program.find({ status: "published" })
    .select("title")
    .sort({ order: 1, title: 1 })
    .lean();

  return rows.map((row) => row.title);
}

/**
 * Published programs this student is not on — the dashboard catalogue.
 *
 * Here rather than in `data/dashboard.ts` because that module is imported by a
 * client component and so may never reach the database; see its header.
 */
export async function availablePrograms(
  enrolledSlugs: readonly string[],
): Promise<PublicProgramCard[]> {
  const enrolled = new Set(enrolledSlugs);
  const programs = await listPublicPrograms();

  return programs.filter((program) => !enrolled.has(program.slug));
}

/* --------------------------------- detail --------------------------------- */

/**
 * One program and its published curriculum, or null when there is no such
 * published program — which the page turns into a 404.
 *
 * The tree comes from `getProgramCurriculum` with no options, so draft filtering
 * stays in the one module that owns it and the counts printed at the top are
 * derived from the very outline printed underneath. They cannot disagree.
 *
 * ⚠️ That function runs `applyGates`, so with no student every course after the
 * first comes back `locked: true` with a reason about unfinished assignments.
 * That is meaningless to a visitor, and `PublicCourse` deliberately has no field
 * it could land in — the mapping below drops it along with `items`, `finalTest`,
 * `assignments`, `submission` and every per-student status.
 */
export async function getPublicProgram(
  slug: string,
): Promise<PublicProgramDetail | null> {
  await connectToDatabase();

  const program = await Program.findOne({ slug, status: "published" }).lean();
  if (!program) return null;

  const curriculum = await getProgramCurriculum(slug);
  if (!curriculum) return null;

  const courses: PublicCourse[] = curriculum.courses.map((course) => {
    const modules: PublicModule[] = course.modules.map((row) => ({
      id: row.id,
      number: row.number,
      title: row.title,
      lessonCount: row.topics.reduce(
        (total, topic) => total + topic.subtopics.length,
        0,
      ),
    }));

    return {
      id: course.id,
      number: course.number,
      title: course.title,
      summary: course.summary,
      startMonth: course.startMonth,
      endMonth: course.endMonth,
      modules,
      lessonCount: modules.reduce((total, row) => total + row.lessonCount, 0),
    };
  });

  const card = toCard(program, {
    courseCount: courses.length,
    moduleCount: courses.reduce((total, row) => total + row.modules.length, 0),
    lessonCount: courses.reduce((total, row) => total + row.lessonCount, 0),
    durationMonths: durationMonths(courses),
  });

  return {
    ...card,
    summary: program.summary ?? "",
    description: program.marketing?.description ?? "",
    courses,
  };
}

/* --------------------------------- shared --------------------------------- */

type Span = { startMonth: number | null; endMonth: number | null };

type StoredProgram = {
  slug: string;
  title: string;
  summary?: string | null;
  feeAmount?: number | null;
  listAmount?: number | null;
  marketing?: {
    tagline?: string | null;
    cover?: UploadedFile | null;
    level?: string | null;
    highlights?: string[] | null;
    tools?: string[] | null;
    placementGuarantee?: boolean | null;
    offers?: string[] | null;
    newBadge?: boolean | null;
    nextBatch?: string | null;
  } | null;
};

/**
 * A program document plus its counts, as a card.
 *
 * The one judgement here is the tagline: the marketing line if somebody wrote
 * one, otherwise the syllabus summary. A program that predates the Details
 * screen still reads as a program rather than as a title with a blank under it,
 * and the fallback costs nothing to a program that has both.
 */
function toCard(
  program: StoredProgram,
  counts: {
    courseCount: number;
    moduleCount: number;
    lessonCount: number;
    durationMonths: number | null;
  },
): PublicProgramCard {
  const marketing = program.marketing ?? null;
  const cover = marketing?.cover ?? null;

  return {
    slug: program.slug,
    title: program.title,
    tagline: marketing?.tagline?.trim() || (program.summary ?? "").trim(),
    // `alt` is empty on purpose: the cover sits beside a heading carrying the
    // same information, so naming it again is noise in a screen reader.
    cover: cover ? { url: cover.url, alt: "" } : null,
    level: (marketing?.level as ProgramLevel | null) ?? null,
    isNew: marketing?.newBadge ?? false,
    durationMonths: counts.durationMonths,
    courseCount: counts.courseCount,
    moduleCount: counts.moduleCount,
    lessonCount: counts.lessonCount,
    highlights: marketing?.highlights ?? [],
    tools: marketing?.tools ?? [],
    placementGuarantee: marketing?.placementGuarantee ?? false,
    offers: marketing?.offers ?? [],
    feeAmount: program.feeAmount ?? null,
    listAmount: program.listAmount ?? null,
    nextBatch: marketing?.nextBatch?.trim() ?? "",
  };
}

function tally(keys: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of keys) add(counts, key, 1);
  return counts;
}

function add(counts: Map<string, number>, key: string, by: number): void {
  counts.set(key, (counts.get(key) ?? 0) + by);
}
