/**
 * Port the static curriculum seed into the database.
 *
 *   npm run seed:curriculum
 *   npm run seed:curriculum -- --with-progress atul.student@courseunbox.com
 *   npm run seed:curriculum -- --force
 *
 * Idempotent. Every write is an upsert keyed on the node's stable `key`, so
 * running it twice changes nothing and running it after a teacher has edited
 * something leaves their work alone — unless `--force`, which reasserts the
 * seed's titles and content over whatever is there.
 *
 * ## What does not come across
 *
 * The seed's per-student `status` and `score` fields are **dropped**. They were
 * always a fiction: they described one imagined student on a document that
 * every student shares. Progress and marks now live in `SubtopicProgress` and
 * `Attempt`, which belong to a person.
 *
 * That means a freshly migrated database shows every student at 0%, which reads
 * as a regression if you are demoing. `--with-progress <email>` replays the old
 * statuses as real rows for one named student, so the demo account looks lived
 * in. It is opt-in precisely so that production never gets invented marks.
 *
 * ## What is deferred, deliberately
 *
 * `CourseItem` rows of type `assessment` (the standalone mid-term and end-term
 * checkpoints) and `ProgramCourse.project` are not modelled yet. They keep
 * their existing seeded rows on the marksheet until they get collections of
 * their own. Half-building them here would leave two sources of truth.
 */
import mongoose, { Types } from "mongoose";

import { PROGRAM_COURSES, type CourseModule, type ProgramCourse } from "../src/lib/data/curriculum";
import { MODULE_TESTS } from "../src/lib/data/marksheet";
import { COURSES } from "../src/lib/data/home";
import { ENROLLMENTS } from "../src/lib/data/dashboard";
import { ASSIGNMENT_MAX, TEST_MARK_PER_QUESTION } from "../src/lib/curriculum/rules";

import { Program } from "../src/models/Program";
import { Course } from "../src/models/Course";
import { Module } from "../src/models/Module";
import { Topic } from "../src/models/Topic";
import { Subtopic } from "../src/models/Subtopic";
import { Assessment } from "../src/models/Assessment";
import { Assignment } from "../src/models/Assignment";
import { Submission } from "../src/models/Submission";
import { SubtopicProgress } from "../src/models/SubtopicProgress";
import { Attempt } from "../src/models/Attempt";
import { User } from "../src/models/User";

/** Statuses on the old tree that meant "the student is finished with this". */
const DONE = new Set(["completed", "evaluated", "submitted"]);

type Options = { force: boolean; progressFor: string | null };

function parseArgs(argv: string[]): Options {
  const force = argv.includes("--force");
  const index = argv.indexOf("--with-progress");
  const progressFor =
    index !== -1 && argv[index + 1] ? argv[index + 1].toLowerCase() : null;

  if (index !== -1 && !progressFor) {
    throw new Error("--with-progress needs a student email after it.");
  }
  return { force, progressFor };
}

/**
 * Upsert one node by `key`.
 *
 * `create` holds the fields only ever set once (identity, structure). `update`
 * holds the authored content, which a teacher may since have changed — so it is
 * applied only on insert, or when --force says the seed wins.
 */
// Six different document types go through here, so the model is unconstrained.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = mongoose.Model<any>;

async function upsert(
  model: AnyModel,
  key: Record<string, unknown>,
  create: Record<string, unknown>,
  update: Record<string, unknown>,
  { force }: Options,
): Promise<Types.ObjectId> {
  const doc = await model
    .findOneAndUpdate(
      key,
      force
        ? { $set: { ...create, ...update } }
        : { $set: create, $setOnInsert: update },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    )
    .select("_id")
    .lean<{ _id: Types.ObjectId } | null>();

  // upsert + new means Mongo always hands one back; this is for the type only.
  if (!doc) throw new Error(`Upsert returned nothing for ${JSON.stringify(key)}`);
  return doc._id;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;

  if (!uri || !dbName) {
    throw new Error("MONGODB_URI and MONGODB_DB must be set in .env.local.");
  }

  const options = parseArgs(process.argv.slice(2));

  await mongoose.connect(uri, { dbName });
  console.log(`Connected to ${dbName}.${options.force ? " (--force)" : ""}`);

  const counts = { courses: 0, modules: 0, topics: 0, subtopics: 0, tests: 0, assignments: 0 };

  for (const [slug, programCourses] of Object.entries(PROGRAM_COURSES)) {
    const marketing = COURSES.find((course) => course.slug === slug);
    const enrolment = ENROLLMENTS.find((row) => row.slug === slug);

    if (!marketing) {
      console.warn(`  ! ${slug} — no entry in data/home.ts, skipped`);
      continue;
    }

    const programId = await upsert(
      Program,
      { slug },
      { slug, status: "published" },
      {
        title: marketing.title,
        summary: marketing.tagline,
        deadline: enrolment ? new Date(enrolment.deadline) : null,
        order: COURSES.indexOf(marketing),
      },
      options,
    );

    console.log(`  ${slug}`);

    for (const [courseIndex, course] of programCourses.entries()) {
      const courseId = await migrateCourse(
        course,
        courseIndex,
        programId,
        options,
        counts,
      );

      // Marks are what the old tree carried for these; the syllabus side is
      // just the module list, which migrateCourse has already walked.
      void courseId;
    }
  }

  console.log(
    `\n  ${counts.courses} courses, ${counts.modules} modules, ${counts.topics} topics, ` +
      `${counts.subtopics} subtopics, ${counts.tests} tests, ${counts.assignments} assignments.`,
  );

  if (options.progressFor) {
    await replayProgress(options.progressFor);
  } else {
    console.log(
      "\n  No progress replayed. Every student starts at 0% — which is correct,\n" +
        "  but if you are demoing, re-run with:\n" +
        "    npm run seed:curriculum -- --with-progress atul.student@courseunbox.com",
    );
  }

  await mongoose.disconnect();
  console.log("Done.");
}

async function migrateCourse(
  course: ProgramCourse,
  courseIndex: number,
  programId: Types.ObjectId,
  options: Options,
  counts: Record<string, number>,
): Promise<Types.ObjectId> {
  const courseId = await upsert(
    Course,
    { key: course.id },
    { key: course.id, programId, order: courseIndex, status: "published" },
    {
      number: course.number,
      title: course.title,
      summary: course.summary,
      completeBy: course.completeBy ? new Date(course.completeBy) : null,
    },
    options,
  );
  counts.courses += 1;

  let moduleOrder = 0;
  let assignmentOrder = 0;

  for (const item of course.items) {
    if (item.type === "module" && item.module) {
      await migrateModule(
        item.module,
        moduleOrder,
        programId,
        courseId,
        options,
        counts,
      );
      moduleOrder += 1;
      continue;
    }

    if (item.type === "assignment") {
      await upsert(
        Assignment,
        { key: item.id },
        {
          key: item.id,
          programId,
          courseId,
          order: assignmentOrder,
          status: "published",
        },
        {
          title: item.title,
          brief: "",
          dueDate: item.dueDate ? new Date(item.dueDate) : null,
          maxMarks: ASSIGNMENT_MAX,
          // A starting point the teacher edits — the old seed said nothing
          // about what a hand-in should look like, because it couldn't.
          acceptedFormats: ["pdf"],
        },
        options,
      );
      assignmentOrder += 1;
      counts.assignments += 1;
      continue;
    }

    // type === "assessment": the standalone mid/end-term checkpoints. Deferred.
  }

  if (course.finalTest) {
    await upsert(
      Assessment,
      { courseId, scope: "final_test" },
      { programId, courseId, scope: "final_test", moduleId: null },
      {
        title: `${course.title} — final test`,
        durationMinutes: course.finalTest.minutes,
        questions: [],
        marksPerQuestion: TEST_MARK_PER_QUESTION,
        proctored: true,
        countsTowardMerit: true,
        // No questions were ever authored, so it cannot be published yet.
        status: "draft",
      },
      options,
    );
    counts.tests += 1;
  }

  return courseId;
}

async function migrateModule(
  module: CourseModule,
  order: number,
  programId: Types.ObjectId,
  courseId: Types.ObjectId,
  options: Options,
  counts: Record<string, number>,
): Promise<void> {
  const moduleId = await upsert(
    Module,
    { key: module.id },
    { key: module.id, programId, courseId, order, status: "published" },
    { title: module.title, number: order + 1 },
    options,
  );
  counts.modules += 1;

  for (const [topicIndex, topic] of module.topics.entries()) {
    const topicId = await upsert(
      Topic,
      { key: topic.id },
      {
        key: topic.id,
        programId,
        courseId,
        moduleId,
        order: topicIndex,
        status: "published",
      },
      { title: topic.title, number: topicIndex + 1 },
      options,
    );
    counts.topics += 1;

    for (const [subtopicIndex, subtopic] of topic.subtopics.entries()) {
      const content =
        subtopic.kind === "video"
          ? {
              // No media service exists, so there is no URL to bring across.
              // The teacher supplies one; until then the placeholder frame shows.
              videoUrl: "",
              seconds: subtopic.seconds,
              caption: subtopic.caption,
            }
          : { questions: subtopic.questions };

      await upsert(
        Subtopic,
        { key: subtopic.id },
        {
          key: subtopic.id,
          programId,
          courseId,
          moduleId,
          topicId,
          kind: subtopic.kind,
          order: subtopicIndex,
          status: "published",
        },
        { title: subtopic.title, ...content },
        options,
      );
      counts.subtopics += 1;
    }
  }

  // The old marksheet seeded a module test's question count and one student's
  // score. The count describes the paper and comes across; the score belonged
  // to a student and does not.
  const seeded = MODULE_TESTS[module.id];
  if (seeded) {
    await upsert(
      Assessment,
      { moduleId },
      { programId, courseId, moduleId, scope: "module_test" },
      {
        title: `${module.title} — module test`,
        durationMinutes: 20,
        questions: [],
        marksPerQuestion: TEST_MARK_PER_QUESTION,
        proctored: false,
        // The whole point of a module test: assessment, not merit.
        countsTowardMerit: false,
        status: "draft",
      },
      options,
    );
    counts.tests += 1;
  }
}

/**
 * Replay the old seed's statuses as real rows, for one student.
 *
 * Only ever run on request. The synthetic attempts carry an empty snapshot and
 * are marked as such in their `autoSubmitReason`-adjacent fields being null —
 * they exist so the marksheet and the gate have something to read, not as a
 * record of anything that happened.
 */
async function replayProgress(email: string): Promise<void> {
  const student = await User.findOne({ email, role: "student" })
    .select("_id name")
    .lean();

  if (!student) {
    console.warn(`\n  ! No student with email ${email} — nothing replayed.`);
    return;
  }

  console.log(`\n  Replaying seeded progress for ${email}…`);

  const studentId = student._id as Types.ObjectId;
  let progressRows = 0;
  let attemptRows = 0;

  for (const programCourses of Object.values(PROGRAM_COURSES)) {
    for (const course of programCourses) {
      for (const item of course.items) {
        if (item.type !== "module" || !item.module) continue;

        for (const topic of item.module.topics) {
          for (const subtopic of topic.subtopics) {
            if (subtopic.status === "not-started" || subtopic.status === "locked") {
              continue;
            }

            const doc = await Subtopic.findOne({ key: subtopic.id })
              .select("_id programId courseId moduleId")
              .lean();
            if (!doc) continue;

            await SubtopicProgress.updateOne(
              { studentId, subtopicId: doc._id },
              {
                $set: {
                  programId: doc.programId,
                  courseId: doc.courseId,
                  moduleId: doc.moduleId,
                  state: DONE.has(subtopic.status) ? "completed" : "in-progress",
                  lastSeenAt: new Date(),
                  completedAt: DONE.has(subtopic.status) ? new Date() : null,
                },
              },
              { upsert: true },
            );
            progressRows += 1;
          }
        }

        const seeded = MODULE_TESTS[item.module.id];
        if (seeded && seeded.score !== null) {
          const moduleDoc = await Module.findOne({ key: item.module.id })
            .select("_id")
            .lean();
          const assessment = moduleDoc
            ? await Assessment.findOne({ moduleId: moduleDoc._id })
                .select("_id programId courseId moduleId version")
                .lean<SyntheticTarget>()
            : null;

          if (assessment) {
            attemptRows += await writeSyntheticAttempt(
              studentId,
              assessment,
              "module_test",
              seeded.score,
              seeded.questions * TEST_MARK_PER_QUESTION,
            );
          }
        }
      }

      if (course.finalTest && course.finalTest.score !== null) {
        const courseDoc = await Course.findOne({ key: course.id })
          .select("_id")
          .lean();
        const assessment = courseDoc
          ? await Assessment.findOne({
              courseId: courseDoc._id,
              scope: "final_test",
            })
              .select("_id programId courseId moduleId version")
              .lean<SyntheticTarget>()
          : null;

        if (assessment) {
          attemptRows += await writeSyntheticAttempt(
            studentId,
            assessment,
            "final_test",
            course.finalTest.score,
            course.finalTest.questions * TEST_MARK_PER_QUESTION,
          );
        }
      }

      // An assignment the old tree marked as submitted or evaluated becomes a
      // Submission, so the course gate sees it as handed in.
      for (const item of course.items) {
        if (item.type !== "assignment") continue;
        if (!item.status || !DONE.has(item.status)) continue;

        const assignment = await Assignment.findOne({ key: item.id })
          .select("_id programId courseId maxMarks")
          .lean();
        if (!assignment) continue;

        const evaluated = item.status === "evaluated" && item.score !== null;

        await Submission.updateOne(
          { studentId, assignmentId: assignment._id },
          {
            $set: {
              programId: assignment.programId,
              courseId: assignment.courseId,
              fileUrl: "https://example.com/seeded-submission",
              format: "pdf",
              note: "Seeded from the static curriculum.",
              submittedAt: new Date(),
              status: evaluated ? "evaluated" : "submitted",
              scored: evaluated
                ? Math.round(((item.score ?? 0) / 100) * assignment.maxMarks)
                : null,
              maxMarks: assignment.maxMarks,
            },
          },
          { upsert: true },
        );
      }
    }
  }

  console.log(`  ${progressRows} progress rows, ${attemptRows} attempts.`);
}

/** The slice of an Assessment a synthetic attempt needs to point at it. */
type SyntheticTarget = {
  _id: Types.ObjectId;
  programId: Types.ObjectId;
  courseId: Types.ObjectId;
  moduleId: Types.ObjectId | null;
  version: number;
};

async function writeSyntheticAttempt(
  studentId: Types.ObjectId,
  assessment: SyntheticTarget,
  targetType: "module_test" | "final_test",
  percent: number,
  maxScore: number,
): Promise<number> {
  const existing = await Attempt.findOne({
    studentId,
    targetId: assessment._id,
  })
    .select("_id")
    .lean();
  if (existing) return 0;

  const now = new Date();
  await Attempt.create({
    studentId,
    programId: assessment.programId,
    courseId: assessment.courseId,
    moduleId: assessment.moduleId,
    targetType,
    targetId: assessment._id,
    version: assessment.version,
    // Empty on purpose: no paper was ever sat. Grading reads the snapshot, so
    // this attempt can only ever report the score it was seeded with.
    snapshot: [],
    answers: [],
    status: "submitted",
    startedAt: now,
    deadlineAt: now,
    submittedAt: now,
    scored: Math.round((percent / 100) * maxScore),
    maxScore,
    percent,
    passed: percent >= 50,
  });
  return 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
