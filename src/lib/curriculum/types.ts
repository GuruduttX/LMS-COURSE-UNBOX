/**
 * The shapes the curriculum screens render.
 *
 * These are **view types**, not the documents. A `SubtopicView` is one subtopic
 * joined to one student's progress with it; a `CourseView` carries the gate
 * decision that was computed for that student. The models describe a syllabus
 * everyone shares, and these describe one person's path through it — keeping
 * them as separate types is what stops a per-student status from ever being
 * written back onto shared content, which is exactly the mistake the static
 * seed made.
 *
 * `id` throughout is a node's stable `key` (`pm-c4-m2`), not its ObjectId: it is
 * what the URLs speak, and it keeps ObjectIds out of the client bundle.
 */
import type { SubtopicKind } from "./kinds";
import type {
  QuestionKind,
  QuestionOption,
  QuestionPair,
} from "./question-kinds";
import type { NodeStatus } from "./rules";
import type { SubmissionFormat } from "./submission-formats";
import type { UploadedFile } from "@/lib/uploads/kinds";
import type { StoredVideo } from "@/lib/video/shared";

export type Status =
  | "completed"
  | "in-progress"
  | "not-started"
  | "locked"
  | "submitted"
  | "evaluated";

/* -------------------------------- questions ------------------------------- */

/**
 * A question as sent to a student: the correct answer is **not** in here.
 *
 * For a matching question that means two things, not one: the pairing is gone
 * (the right-hand list arrives as `choices`, keyed by ids that appear nowhere
 * on the left) and the order is the shuffle frozen into the attempt.
 */
export type RunnerQuestion = {
  id: string;
  prompt: string;
  kind: QuestionKind;
  /** single, multi, boolean. */
  options: QuestionOption[];
  /** matching: the left-hand items, in the author's order. */
  prompts: { id: string; text: string }[];
  /** matching: the right-hand items, shuffled, ids unrelated to the left. */
  choices: QuestionOption[];
};

/** A question as an author or a grader sees it. */
export type AuthoredQuestion = {
  id: string;
  prompt: string;
  kind: QuestionKind;
  options: QuestionOption[];
  correctOptionId: string;
  correctOptionIds: string[];
  pairs: QuestionPair[];
  /** Only inside an attempt snapshot — the frozen shuffle. See Attempt. */
  choiceOrder: string[];
  explanation: string;
};

/* --------------------------------- the tree ------------------------------- */

export type SubtopicView = {
  id: string;
  title: string;
  kind: SubtopicKind;
  /** draft / published / archived — the *content's* state, not the student's. */
  nodeStatus: NodeStatus;
  /** Derived from this student's progress — never stored on the subtopic. */
  status: Status;
  /**
   * kind === "video". Two ways to hold one, and `video` wins:
   * an uploaded file on Bunny Stream, or a link to one hosted elsewhere.
   */
  video: StoredVideo | null;
  videoUrl: string;
  seconds: number;
  caption: string;
  /** kind === "text" */
  body: string;
  readMinutes: number;
  /** kind === "pdf" — an uploaded document, embedded and downloadable. */
  pdf: UploadedFile | null;
  /**
   * kind === "quiz". Carries the answers: a practice quiz shows its
   * explanation the moment you submit, so the client legitimately needs them.
   * A *test* never sends them — see `toRunnerQuestions`.
   */
  questions: AuthoredQuestion[];
};

export type TopicView = {
  id: string;
  number: number;
  title: string;
  nodeStatus: NodeStatus;
  subtopics: SubtopicView[];
};

/** A module test, a final test or a term paper, with how this student did. */
export type AssessmentView = {
  id: string;
  nodeStatus: NodeStatus;
  scope: "module_test" | "final_test" | "term_test";
  /** "mid" or "end" for a term paper; null for the rest. */
  term: "mid" | "end" | null;
  /** How many sittings this paper allows — 1 for a term paper, 3 for a final. */
  maxAttempts: number;
  title: string;
  questionCount: number;
  durationMinutes: number;
  marksPerQuestion: number;
  countsTowardMerit: boolean;
  proctored: boolean;
  /** Best submitted attempt, or null if never sat. */
  best: AttemptSummary | null;
  attemptsUsed: number;
  /** An in-flight attempt to resume, if there is one. */
  openAttemptId: string | null;
};

export type AttemptSummary = {
  id: string;
  scored: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  submittedAt: string;
  autoSubmitted: boolean;
};

export type ModuleView = {
  id: string;
  number: number;
  title: string;
  nodeStatus: NodeStatus;
  topics: TopicView[];
  /** Null when the module has no test, or one that isn't published yet. */
  test: AssessmentView | null;
  /**
   * The module's handout — a reading, a deck or a Word document — or null.
   * Shared content, not per-student: everybody on the module gets the same one.
   */
  material: UploadedFile | null;
  /**
   * What the material is called on screen. The uploaded filename is never
   * shown to a student. Empty exactly when `material` is null.
   */
  materialTitle: string;
};

export type SubmissionView = {
  id: string;
  fileUrl: string;
  /** Set when the work was uploaded rather than linked. Null for a link. */
  file: UploadedFile | null;
  format: SubmissionFormat;
  note: string;
  submittedAt: string;
  status: "submitted" | "evaluated";
  scored: number | null;
  maxMarks: number;
  feedback: string;
};

export type AssignmentView = {
  id: string;
  nodeStatus: NodeStatus;
  title: string;
  brief: string;
  /** The brief handed out as a PDF, or null. Every student gets the same one. */
  briefFile: UploadedFile | null;
  dueDate: string | null;
  maxMarks: number;
  acceptedFormats: SubmissionFormat[];
  /** This student's hand-in, or null. Its existence is what opens the gate. */
  submission: SubmissionView | null;
};

/** One row of a course: a module, or a piece of graded work of its own. */
export type CourseItem = {
  id: string;
  title: string;
  type: "module" | "assignment";
  status: Status;
  score: number | null;
  dueDate: string | null;
  lockedReason?: string;
  /** Present exactly when `type === "module"`. */
  module?: ModuleView;
  /** Present exactly when `type === "assignment"`. */
  assignment?: AssignmentView;
};

export type CourseView = {
  id: string;
  nodeStatus: NodeStatus;
  /** Null for the standalone checkpoints, which print no "Course N". */
  number: number | null;
  title: string;
  summary: string;
  completeBy: string | null;
  items: CourseItem[];
  modules: ModuleView[];
  assignments: AssignmentView[];
  finalTest: AssessmentView | null;
  /**
   * The paper on a checkpoint course — the mid-term or the end-term. Null for
   * a numbered course, which has a `finalTest` instead. A course never has both:
   * a checkpoint is graded work with nothing inside it, and a numbered course
   * is the work.
   */
  termTest: AssessmentView | null;
  /** Derived from the previous course's assignments and final test. */
  locked: boolean;
  /** Names the condition that failed — "Locked" alone is not actionable. */
  lockedReason: string | null;
  /** Whether this student may sit the final test yet, and why not. */
  finalTestLocked: boolean;
  finalTestLockedReason: string | null;
};

export type ProgramView = {
  slug: string;
  title: string;
  summary: string;
  /** The program's own publish state, so the authoring screens can change it. */
  nodeStatus: NodeStatus;
};

export type ProgramCurriculum = {
  program: ProgramView;
  deadline: string | null;
  courses: CourseView[];
  totals: { done: number; total: number; percent: number };
};

export type LearnScreen = {
  program: ProgramView;
  course: CourseView;
  /** The course's modules, for the sidebar dropdown. */
  modules: ModuleView[];
  module: ModuleView;
  /** The topic holding the open subtopic — the accordion that starts open. */
  topic: TopicView;
  subtopic: SubtopicView;
  prev: LearnStep | null;
  next: LearnStep | null;
};

export type LearnStep = {
  moduleId: string;
  subtopicId: string;
  title: string;
};

/**
 * Strip the answers before a paper reaches the browser.
 *
 * The single most important function in the testing feature. A test's questions
 * are stored with `correctOptionId` and the runner must never receive it — not
 * in props, not in a payload, not in a stray serialised prop on a parent. It is
 * a named function rather than an inline `map` so there is exactly one place to
 * audit, and so nobody adds a field back by writing `...question`.
 */
export function toRunnerQuestions(
  questions: readonly AuthoredQuestion[],
): RunnerQuestion[] {
  return questions.map((question) => {
    // The frozen shuffle if there is one; the author's order otherwise, so a
    // preview still renders. Ids not in `choiceOrder` are appended rather than
    // dropped — a question edited after an attempt began must still be sittable.
    const byRightId = new Map(question.pairs.map((pair) => [pair.rightId, pair]));
    const ordered = [
      ...question.choiceOrder.flatMap((id) => {
        const pair = byRightId.get(id);
        return pair ? [pair] : [];
      }),
      ...question.pairs.filter(
        (pair) => !question.choiceOrder.includes(pair.rightId),
      ),
    ];

    return {
      id: question.id,
      prompt: question.prompt,
      kind: question.kind,
      options: question.options.map((option) => ({
        id: option.id,
        text: option.text,
      })),
      prompts: question.pairs.map((pair) => ({ id: pair.id, text: pair.left })),
      choices: ordered.map((pair) => ({ id: pair.rightId, text: pair.right })),
    };
  });
}
