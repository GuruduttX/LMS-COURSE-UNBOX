/**
 * The curriculum, read from the database.
 *
 * This replaces the static `data/curriculum.ts` and is the seam every screen
 * goes through. Three things about how it works are load-bearing:
 *
 * **A whole program is six queries, not a walk.** Courses, modules, topics,
 * subtopics, assessments and assignments are each fetched flat by `programId`
 * and assembled in memory. Depth costs nothing; a per-node lookup would cost
 * hundreds of round trips.
 *
 * **Draft filtering happens here, once.** `includeDrafts` is false for students
 * and true for the authoring screens. No page decides this for itself, because
 * a page that forgets shows unfinished work to a student. Archived nodes are
 * excluded from both — they exist only so old progress and marks still resolve.
 *
 * **Status is joined, never read.** A subtopic document has no per-student
 * state. What a student has done comes from `SubtopicProgress`, and it is
 * applied as the tree is built, so nothing downstream can confuse "this lesson
 * exists" with "this student finished it".
 */
import "server-only";
import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { Assessment } from "@/models/Assessment";
import type { UploadedFile } from "@/lib/uploads/kinds";
import { reconcileVideo } from "@/lib/video/reconcile";
import type { StoredVideo } from "@/lib/video/shared";
import { Assignment } from "@/models/Assignment";
import { Course } from "@/models/Course";
import { Module } from "@/models/Module";
import { Program } from "@/models/Program";
import { Subtopic } from "@/models/Subtopic";
import { Topic } from "@/models/Topic";
import type { SubtopicKind } from "@/lib/curriculum/kinds";
import { learnHref } from "@/lib/curriculum/links";
import { nextAfterLessons } from "@/lib/curriculum/next-step";
import { toAuthoredQuestion } from "@/lib/curriculum/question-kinds";
import {
  MAX_FINAL_ATTEMPTS,
  MAX_TERM_ATTEMPTS,
  type NodeStatus,
} from "@/lib/curriculum/rules";
import type { SubmissionFormat } from "@/lib/curriculum/submission-formats";
import {
  assignmentStatus,
  checkpointLockReason,
  finalTestLockReason,
  moduleStatus,
  moduleSubtopics,
  nextCourseLockReason,
} from "@/lib/curriculum/status";
import type {
  AssessmentView,
  AssignmentView,
  CourseItem,
  CourseView,
  LearnScreen,
  LearnStep,
  ModuleView,
  ProgramCurriculum,
  ProgramView,
  Status,
  SubtopicView,
  TopicView,
} from "@/lib/curriculum/types";
import {
  emptyHistory,
  loadAttempts,
  loadProgress,
  loadSubmissions,
  type AttemptIndex,
  type ProgressIndex,
  type SubmissionIndex,
} from "./progress";

export type TreeOptions = {
  /** True only for the authoring screens. */
  includeDrafts?: boolean;
  /** Whose progress to join. Omit for a syllabus-only read. */
  studentId?: string | null;
};

/**
 * A whole program, as one student sees it.
 *
 * Returns null when there is no such program, or when it isn't published and
 * the caller isn't authoring — the pages turn that into a 404, which is the
 * same answer either way and so leaks nothing.
 */
export async function getProgramCurriculum(
  slug: string,
  options: TreeOptions = {},
): Promise<ProgramCurriculum | null> {
  await connectToDatabase();

  const includeDrafts = options.includeDrafts ?? false;

  // Archived nodes are excluded from both reads — they exist only so that
  // progress and marks pointing at removed content still resolve.
  const visible: VisibilityFilter = includeDrafts
    ? { status: { $ne: "archived" } }
    : { status: "published" };

  const program = await Program.findOne({ slug, ...visible }).lean();
  if (!program) return null;

  const programId = program._id;

  // Six flat reads, in parallel. Assembly happens below, in memory.
  const [courses, modules, topics, subtopics, assessments, assignments] =
    await Promise.all([
      Course.find({ programId, ...visible }).sort({ order: 1 }).lean(),
      Module.find({ programId, ...visible }).sort({ order: 1 }).lean(),
      Topic.find({ programId, ...visible }).sort({ order: 1 }).lean(),
      Subtopic.find({ programId, ...visible }).sort({ order: 1 }).lean(),
      Assessment.find({ programId, ...visible }).lean(),
      Assignment.find({ programId, ...visible }).sort({ order: 1 }).lean(),
    ]);

  const history = options.studentId
    ? await loadHistory(options.studentId, programId)
    : emptyHistory();

  const view: ProgramView = {
    slug: program.slug,
    title: program.title,
    summary: program.summary ?? "",
    nodeStatus: program.status as NodeStatus,
    hasDetails: program.marketing != null,
  };

  const built = buildCourses(
    { courses, modules, topics, subtopics, assessments, assignments },
    history,
  );

  const items = built.flatMap((course) => course.items);
  const done = items.filter((item) => isFinished(item.status)).length;

  return {
    program: view,
    deadline: program.deadline ? program.deadline.toISOString() : null,
    courses: built,
    totals: {
      done,
      total: items.length,
      percent: items.length === 0 ? 0 : Math.round((done / items.length) * 100),
    },
  };
}

/**
 * Resolve a learning screen from the URL.
 *
 * Anything that doesn't resolve returns null (→ 404); an unknown *subtopic*
 * instead falls back to the module's first, because a stale `?s=` should still
 * land somewhere useful rather than 404ing a student out of their own course.
 */
export async function getLearnScreen(
  programSlug: string,
  courseId: string,
  moduleId: string,
  subtopicId: string | undefined,
  options: TreeOptions = {},
): Promise<LearnScreen | null> {
  const curriculum = await getProgramCurriculum(programSlug, options);
  if (!curriculum) return null;

  const course = curriculum.courses.find((item) => item.id === courseId);
  if (!course) return null;

  // A locked course is not a 404 — it exists, they just can't be in it yet.
  // The curriculum page explains why, so send them there.
  if (course.locked) return null;

  const activeModule = course.modules.find((item) => item.id === moduleId);
  if (!activeModule) return null;

  const subtopics = moduleSubtopics(activeModule.topics);
  const subtopic =
    subtopics.find((item) => item.id === subtopicId) ?? subtopics[0];
  if (!subtopic) return null;

  const topic = course.modules
    .flatMap((item) => item.topics)
    .find((item) => item.subtopics.some((sub) => sub.id === subtopic.id));
  if (!topic) return null;

  /**
   * Prev/Next run across the whole course, not just the open module — that is
   * what "next" means to someone working through it front to back.
   *
   * And **past the end of it**: the last lesson of a course is not the end of
   * anything a student can see, it is the point where the assignment and the
   * paper are what remain. `nextAfterLessons` picks that up; without it the
   * control simply went grey on the one screen where a student most needs
   * telling what is left. Nothing follows the last lesson of the last course
   * once everything is handed in, and there Next is inert on purpose.
   */
  const flat = course.modules.flatMap((item) =>
    moduleSubtopics(item.topics).map((sub) => ({
      moduleId: item.id,
      subtopicId: sub.id,
      title: sub.title,
    })),
  );
  const at = flat.findIndex((item) => item.subtopicId === subtopic.id);

  const behind = at > 0 ? flat[at - 1] : null;
  const ahead = at >= 0 && at < flat.length - 1 ? flat[at + 1] : null;

  const prev: LearnStep | null = behind
    ? {
        href: learnHref(programSlug, course.id, behind.moduleId, behind.subtopicId),
        label: "Prev",
        title: behind.title,
        note: null,
      }
    : null;

  const next: LearnStep | null = ahead
    ? {
        href: learnHref(programSlug, course.id, ahead.moduleId, ahead.subtopicId),
        label: "Next",
        title: ahead.title,
        note: null,
      }
    : nextAfterLessons(curriculum, course);

  /**
   * One video, checked against Bunny only while the cached status still says
   * it is encoding — see `reconcileVideo`. This is the screen that gates the
   * player on that field, so a stale `processing` here is a finished lesson a
   * student cannot watch.
   *
   * Deliberately not in `getProgramCurriculum` above: that is six flat reads on
   * every curriculum screen, and asking about every video in a program would
   * put an HTTP call per lesson on it.
   */
  const video = await reconcileVideo(subtopic.video);

  return {
    program: curriculum.program,
    course,
    modules: course.modules,
    module: activeModule,
    subtopic: video === subtopic.video ? subtopic : { ...subtopic, video },
    topic,
    prev,
    next,
  };
}

/* ------------------------------- assembly -------------------------------- */

/** "Published only", or "anything a teacher can still see". */
type VisibilityFilter =
  | { status: NodeStatus }
  | { status: { $ne: NodeStatus } };

type Rows = {
  courses: RawCourse[];
  modules: RawModule[];
  topics: RawTopic[];
  subtopics: RawSubtopic[];
  assessments: RawAssessment[];
  assignments: RawAssignment[];
};

type RawCourse = {
  _id: Types.ObjectId;
  key: string;
  number?: number | null;
  title: string;
  summary?: string;
  completeBy?: Date | null;
  startMonth?: number | null;
  endMonth?: number | null;
  status: NodeStatus;
};
type RawModule = {
  _id: Types.ObjectId;
  courseId: Types.ObjectId;
  key: string;
  title: string;
  number: number;
  status: NodeStatus;
  material?: UploadedFile | null;
  materialTitle?: string;
};
type RawTopic = {
  _id: Types.ObjectId;
  moduleId: Types.ObjectId;
  key: string;
  title: string;
  number: number;
  status: NodeStatus;
};
type RawSubtopic = {
  _id: Types.ObjectId;
  topicId: Types.ObjectId;
  key: string;
  title: string;
  kind: string;
  video?: StoredVideo | null;
  videoUrl?: string;
  pdf?: UploadedFile | null;
  seconds?: number;
  caption?: string;
  body?: string;
  readMinutes?: number;
  questions?: unknown[];
  status: NodeStatus;
};
type RawAssessment = {
  _id: Types.ObjectId;
  courseId: Types.ObjectId;
  moduleId?: Types.ObjectId | null;
  scope: string;
  term?: string | null;
  title: string;
  durationMinutes: number;
  marksPerQuestion: number;
  countsTowardMerit: boolean;
  proctored: boolean;
  questions?: unknown[];
  status: NodeStatus;
};
type RawAssignment = {
  briefFile?: UploadedFile | null;
  _id: Types.ObjectId;
  courseId: Types.ObjectId;
  key: string;
  title: string;
  brief?: string;
  dueDate?: Date | null;
  maxMarks: number;
  acceptedFormats?: string[];
  status: NodeStatus;
};

type History = {
  progress: ProgressIndex;
  attempts: AttemptIndex;
  submissions: SubmissionIndex;
};

async function loadHistory(
  studentId: string,
  programId: Types.ObjectId,
): Promise<History> {
  if (!Types.ObjectId.isValid(studentId)) return emptyHistory();
  const id = new Types.ObjectId(studentId);

  const [progress, attempts, submissions] = await Promise.all([
    loadProgress(id, programId),
    loadAttempts(id, programId),
    loadSubmissions(id, programId),
  ]);

  return { progress, attempts, submissions };
}

function buildCourses(rows: Rows, history: History): CourseView[] {
  const byCourse = groupBy(rows.modules, (row) => String(row.courseId));
  const byModule = groupBy(rows.topics, (row) => String(row.moduleId));
  const byTopic = groupBy(rows.subtopics, (row) => String(row.topicId));
  const assignmentsByCourse = groupBy(rows.assignments, (row) =>
    String(row.courseId),
  );

  const built: CourseView[] = [];

  for (const course of rows.courses) {
    const courseKey = String(course._id);

    const modules: ModuleView[] = (byCourse.get(courseKey) ?? []).map((row) => ({
      id: row.key,
      number: row.number,
      title: row.title,
      nodeStatus: row.status,
      topics: buildTopics(row._id, byModule, byTopic, history),
      material: row.material ?? null,
      materialTitle: row.materialTitle ?? "",
      test: findAssessment(
        rows.assessments,
        (test) => String(test.moduleId ?? "") === String(row._id),
        history,
      ),
    }));

    const assignments: AssignmentView[] = (
      assignmentsByCourse.get(courseKey) ?? []
    ).map((assignment) => ({
      id: assignment.key,
      nodeStatus: assignment.status,
      title: assignment.title,
      brief: assignment.brief ?? "",
      briefFile: assignment.briefFile ?? null,
      dueDate: assignment.dueDate ? assignment.dueDate.toISOString() : null,
      maxMarks: assignment.maxMarks,
      acceptedFormats: (assignment.acceptedFormats ?? []) as SubmissionFormat[],
      submission: history.submissions.get(String(assignment._id)) ?? null,
    }));

    const finalTest = findAssessment(
      rows.assessments,
      (row) =>
        row.scope === "final_test" && String(row.courseId) === courseKey,
      history,
    );

    // A checkpoint's paper. Looked up the same way, kept in its own field: the
    // two are graded differently and gate differently, and one nullable field
    // holding "whichever kind this course has" is how that distinction gets
    // lost at the first call site that forgets to check `number`.
    const termTest = findAssessment(
      rows.assessments,
      (row) => row.scope === "term_test" && String(row.courseId) === courseKey,
      history,
    );

    // Modules first, then the graded work — the order a student meets them.
    const items: CourseItem[] = [
      ...modules.map((view) => ({
        id: view.id,
        title: `Module ${view.number}: ${view.title}`,
        type: "module" as const,
        status: moduleStatus(view),
        score: null,
        dueDate: null,
        module: view,
      })),
      ...assignments.map((assignment) => ({
        id: assignment.id,
        title: assignment.title,
        type: "assignment" as const,
        status: assignmentStatus(assignment),
        score: assignment.submission?.scored ?? null,
        dueDate: assignment.dueDate,
        assignment,
      })),
    ];

    const finalTestLockedReason = finalTestLockReason(modules, assignments);

    built.push({
      id: course.key,
      nodeStatus: course.status,
      number: course.number ?? null,
      title: course.title,
      summary: course.summary ?? "",
      completeBy: course.completeBy ? course.completeBy.toISOString() : null,
      startMonth: course.startMonth ?? null,
      endMonth: course.endMonth ?? null,
      items,
      modules,
      assignments,
      finalTest,
      termTest,
      // Filled in below, once every course exists — a gate is about the one
      // before it, which isn't built yet at this point in the loop.
      locked: false,
      lockedReason: null,
      finalTestLocked: finalTestLockedReason !== null,
      finalTestLockedReason,
    });
  }

  return applyGates(built);
}

/**
 * Walk the courses in order and decide what is open.
 *
 * Second pass rather than inline, because a course's lock depends on the one
 * before it being fully built. Once a course locks, everything after it locks
 * too — there is no reaching course 5 past a closed course 3.
 */
function applyGates(courses: CourseView[]): CourseView[] {
  let blocked: string | null = null;

  return courses.map((course, index) => {
    if (index === 0) return course;

    if (blocked) {
      return { ...course, locked: true, lockedReason: blocked };
    }

    const reason =
      course.number === null
        ? checkpointLockReason(courses.slice(0, index))
        : nextCourseLockReason(courses[index - 1]);

    if (reason) blocked = reason;

    return reason ? { ...course, locked: true, lockedReason: reason } : course;
  });
}

function buildTopics(
  moduleId: Types.ObjectId,
  byModule: Map<string, RawTopic[]>,
  byTopic: Map<string, RawSubtopic[]>,
  history: History,
): TopicView[] {
  return (byModule.get(String(moduleId)) ?? []).map((topic) => ({
    id: topic.key,
    number: topic.number,
    title: topic.title,
    nodeStatus: topic.status,
    subtopics: (byTopic.get(String(topic._id)) ?? []).map((subtopic) =>
      buildSubtopic(subtopic, history),
    ),
  }));
}

function buildSubtopic(row: RawSubtopic, history: History): SubtopicView {
  const state = history.progress.get(String(row._id));

  // A quiz is finished by having been submitted, not by pressing a button.
  const attempted = history.attempts.get(String(row._id))?.best;
  const status: Status =
    state === "completed" || (row.kind === "quiz" && attempted)
      ? "completed"
      : state === "in-progress"
        ? "in-progress"
        : "not-started";

  return {
    id: row.key,
    title: row.title,
    kind: row.kind as SubtopicKind,
    nodeStatus: row.status,
    status,
    // Mongoose gives back the subdocument with its own methods attached; the
    // view type wants a plain object, and only these six fields ever cross.
    video: row.video
      ? {
          videoId: row.video.videoId,
          libraryId: row.video.libraryId,
          status: row.video.status,
          seconds: row.video.seconds ?? 0,
          name: row.video.name,
          bytes: row.video.bytes ?? 0,
        }
      : null,
    videoUrl: row.videoUrl ?? "",
    seconds: row.seconds ?? 0,
    caption: row.caption ?? "",
    body: row.body ?? "",
    readMinutes: row.readMinutes ?? 0,
    pdf: row.pdf ?? null,
    questions: (row.questions ?? []).map(toAuthoredQuestion),
  };
}

function findAssessment(
  assessments: RawAssessment[],
  match: (row: RawAssessment) => boolean,
  history: History,
): AssessmentView | null {
  const row = assessments.find(match);
  if (!row) return null;

  const attempts = history.attempts.get(String(row._id));

  const scope = row.scope as AssessmentView["scope"];

  return {
    id: String(row._id),
    nodeStatus: row.status,
    scope,
    term: (row.term as "mid" | "end" | null) ?? null,
    // The rule, not a stored field: a term paper is one sitting, a final test
    // three, and a module test as many as a student likes.
    maxAttempts:
      scope === "term_test"
        ? MAX_TERM_ATTEMPTS
        : scope === "final_test"
          ? MAX_FINAL_ATTEMPTS
          : Number.POSITIVE_INFINITY,
    title: row.title,
    questionCount: row.questions?.length ?? 0,
    durationMinutes: row.durationMinutes,
    marksPerQuestion: row.marksPerQuestion,
    countsTowardMerit: row.countsTowardMerit,
    proctored: row.proctored,
    best: attempts?.best ?? null,
    attemptsUsed: attempts?.used ?? 0,
    openAttemptId: attempts?.openId ?? null,
  };
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const list = map.get(id);
    if (list) list.push(row);
    else map.set(id, [row]);
  }
  return map;
}

function isFinished(status: Status): boolean {
  return (
    status === "completed" ||
    status === "evaluated" ||
    status === "submitted" ||
    // Handed in and sent back: still handed in, as far as progress goes.
    // Same rule as `DONE` in curriculum/status.ts.
    status === "resubmission-requested"
  );
}
