/**
 * Rules for authoring curriculum, shared by the forms and the actions.
 *
 * Same contract as the other validation modules: an all-string `XInput` mirroring
 * the form fields, an `XErrors` map keyed by field, an `EMPTY_X` seed, and pure
 * functions with no server imports. The client validates for fast inline
 * feedback; the server re-validates because client validation is a convenience,
 * never a guarantee.
 *
 * One thing is enforced here rather than in the schema: **which fields a
 * subtopic needs depends on its kind**. Mongoose can't express that on a single
 * document without discriminators, and splitting the collection three ways to
 * satisfy the validator would be the tail wagging the dog. Keeping the rule here
 * means the form and the action agree about it, which is what actually matters.
 */
import { isSubtopicKind, type SubtopicKind } from "@/lib/curriculum/kinds";
import {
  BOOLEAN_OPTIONS,
  type QuestionKind,
} from "@/lib/curriculum/question-kinds";
import { ASSIGNMENT_MAX, isNodeStatus } from "@/lib/curriculum/rules";
import {
  extensionFromUrl,
  isSubmissionFormat,
  SUBMISSION_FORMAT_EXTENSIONS,
  type SubmissionFormat,
} from "@/lib/curriculum/submission-formats";
import { parseStoredVideo } from "@/lib/video/shared";

/** A full link, the shape we ask for everywhere a URL is typed. */
const URL_PATTERN = /^https?:\/\/\S+$/i;

/** Shared by every module here: true when anything failed. */
export function hasErrors(errors: Record<string, unknown>): boolean {
  return Object.keys(errors).length > 0;
}

/* -------------------------------- program -------------------------------- */

export type ProgramInput = {
  slug: string;
  title: string;
  summary: string;
  /** yyyy-mm-dd, or empty. */
  deadline: string;
  status: string;
};

export type ProgramErrors = Partial<Record<keyof ProgramInput, string>>;

export const EMPTY_PROGRAM: ProgramInput = {
  slug: "",
  title: "",
  summary: "",
  deadline: "",
  status: "draft",
};

export function validateProgram(input: ProgramInput): ProgramErrors {
  const errors: ProgramErrors = {};

  // The slug is the join key to live sessions, enrolments and every URL, so it
  // is constrained hard and never editable after creation.
  const slug = input.slug.trim();
  if (!slug) {
    errors.slug = "Give the program a slug.";
  } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    errors.slug = "Lowercase letters, numbers and hyphens only.";
  } else if (slug.length > 60) {
    errors.slug = "Keep the slug under 60 characters.";
  }

  const title = input.title.trim();
  if (!title) {
    errors.title = "Give the program a title.";
  } else if (title.length > 140) {
    errors.title = "Keep the title under 140 characters.";
  }

  if (input.summary.trim().length > 600) {
    errors.summary = "Keep the summary under 600 characters.";
  }

  if (input.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(input.deadline)) {
    errors.deadline = "Pick a date.";
  }

  if (!isNodeStatus(input.status)) errors.status = "Pick a status.";

  return errors;
}

/* --------------------------------- course -------------------------------- */

export type CourseInput = {
  key: string;
  /** Empty means a standalone checkpoint, which prints no "Course N". */
  number: string;
  title: string;
  summary: string;
  completeBy: string;
  status: string;
};

export type CourseErrors = Partial<Record<keyof CourseInput, string>>;

export const EMPTY_COURSE: CourseInput = {
  key: "",
  number: "",
  title: "",
  summary: "",
  completeBy: "",
  status: "draft",
};

export function validateCourse(input: CourseInput): CourseErrors {
  const errors: CourseErrors = {};

  Object.assign(errors, validateKey(input.key));

  const title = input.title.trim();
  if (!title) {
    errors.title = "Give the course a title.";
  } else if (title.length > 140) {
    errors.title = "Keep the title under 140 characters.";
  }

  if (input.number.trim()) {
    const number = Number(input.number);
    if (!Number.isInteger(number) || number < 1 || number > 99) {
      errors.number = "A whole number between 1 and 99, or leave it blank.";
    }
  }

  if (input.summary.trim().length > 600) {
    errors.summary = "Keep the summary under 600 characters.";
  }

  if (input.completeBy && !/^\d{4}-\d{2}-\d{2}$/.test(input.completeBy)) {
    errors.completeBy = "Pick a date.";
  }

  if (!isNodeStatus(input.status)) errors.status = "Pick a status.";

  return errors;
}

/* ---------------------------- module and topic --------------------------- */

/**
 * Modules and topics carry the same fields; only the wording differs.
 *
 * A module's **study material is not one of them**. It is attached, replaced
 * and removed from the module's own screen — see `validateMaterial` — for the
 * same reason its topics and its test are: the module has to exist before
 * there is anywhere to put them, and one editing surface per thing means a
 * form left open in another tab can never re-post a file that was meanwhile
 * taken down.
 */
export type NodeInput = {
  key: string;
  title: string;
  status: string;
};

export type NodeErrors = Partial<Record<keyof NodeInput, string>>;

export const EMPTY_NODE: NodeInput = {
  key: "",
  title: "",
  status: "draft",
};

export function validateModule(input: NodeInput): NodeErrors {
  return validateNode(input, "module");
}

export function validateTopic(input: NodeInput): NodeErrors {
  return validateNode(input, "topic");
}

function validateNode(input: NodeInput, noun: string): NodeErrors {
  const errors: NodeErrors = {};

  Object.assign(errors, validateKey(input.key));

  const title = input.title.trim();
  if (!title) {
    errors.title = `Give the ${noun} a title.`;
  } else if (title.length > 140) {
    errors.title = "Keep the title under 140 characters.";
  }

  if (!isNodeStatus(input.status)) errors.status = "Pick a status.";

  return errors;
}

/* ---------------------------- study material ----------------------------- */

/**
 * A module's study material — the handout, and what it is called on screen.
 *
 * Its own input rather than part of `NodeInput` because it is edited on its
 * own, from the module screen, and validated on its own: the title is required
 * exactly when a file is attached, and neither fact has anything to say about
 * the module's title, key or visibility.
 */
export type MaterialInput = {
  /**
   * What students see in the outline. The uploaded filename is never shown to
   * them — `Q3 notes FINAL v2 (1).pdf` is what it was called on the teacher's
   * laptop, not what the reading is.
   */
  materialTitle: string;
};

export type MaterialErrors = Partial<Record<keyof MaterialInput, string>> & {
  /** The file itself. Not a text field, so it sits alongside them. */
  material?: string;
};

export const EMPTY_MATERIAL: MaterialInput = { materialTitle: "" };

/**
 * `hasMaterial` is passed rather than read off the input for the same reason
 * `hasBriefFile` is: the file arrives as a JSON blob beside the string fields,
 * not as one of them.
 *
 * A save with no file is rejected rather than treated as "take it down":
 * removing the material is its own, confirmed action, and an empty picker is
 * far more often a failed upload than a decision.
 */
export function validateMaterial(
  input: MaterialInput,
  options: { hasMaterial: boolean },
): MaterialErrors {
  const errors: MaterialErrors = {};

  if (!options.hasMaterial) {
    errors.material = "Choose a file — or use Remove to take the material down.";
  }

  const materialTitle = input.materialTitle.trim();

  if (options.hasMaterial && !materialTitle) {
    errors.materialTitle =
      "Name the study material — students see this, never the filename.";
  } else if (materialTitle.length > 140) {
    errors.materialTitle = "Keep the title under 140 characters.";
  }

  return errors;
}

/* ------------------------------- questions ------------------------------- */

export type OptionInput = { id: string; text: string };
export type PairInput = { id: string; rightId: string; left: string; right: string };

export type QuestionInput = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  /** single, multi, boolean. */
  options: OptionInput[];
  /** single and boolean. */
  correctOptionId: string;
  /** multi. */
  correctOptionIds: string[];
  /** matching. */
  pairs: PairInput[];
  explanation: string;
};

export type QuestionErrors = Partial<
  Record<
    "prompt" | "options" | "correctOptionId" | "pairs" | "explanation",
    string
  >
>;

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const MIN_PAIRS = 2;
export const MAX_PAIRS = 6;
export const MAX_QUESTIONS = 50;

export function emptyQuestion(
  id: string,
  kind: QuestionKind = "single",
): QuestionInput {
  return {
    id,
    kind,
    prompt: "",
    // A true/false question's options are fixed, so they are filled in rather
    // than left for an author to retype "True" and "False" every time.
    options:
      kind === "boolean"
        ? BOOLEAN_OPTIONS.map((option) => ({ ...option }))
        : kind === "matching"
          ? []
          : [
              { id: `${id}-o1`, text: "" },
              { id: `${id}-o2`, text: "" },
            ],
    correctOptionId: "",
    correctOptionIds: [],
    pairs:
      kind === "matching"
        ? [
            { id: `${id}-p1`, rightId: `${id}-r1`, left: "", right: "" },
            { id: `${id}-p2`, rightId: `${id}-r2`, left: "", right: "" },
          ]
        : [],
    explanation: "",
  };
}

/**
 * One question, checked against the rules of its own kind.
 *
 * The shared rules first — every kind needs a prompt and an explanation — then
 * a branch per kind. Splitting into four validators was the alternative and
 * would have meant four places to forget the prompt rule.
 */
export function validateQuestion(input: QuestionInput): QuestionErrors {
  const errors: QuestionErrors = {};

  const prompt = input.prompt.trim();
  if (!prompt) {
    errors.prompt = "Write the question.";
  } else if (prompt.length > 1000) {
    errors.prompt = "Keep the question under 1000 characters.";
  }

  if (input.kind === "matching") {
    const filled = input.pairs.filter(
      (pair) => pair.left.trim() && pair.right.trim(),
    );

    if (input.pairs.length > MAX_PAIRS) {
      errors.pairs = `No more than ${MAX_PAIRS} pairs.`;
    } else if (filled.length < MIN_PAIRS) {
      errors.pairs = `Give at least ${MIN_PAIRS} pairs to match.`;
    } else if (filled.length !== input.pairs.length) {
      errors.pairs = "Fill in both sides of every pair, or remove the blank ones.";
    } else if (
      new Set(input.pairs.map((pair) => pair.right.trim().toLowerCase())).size !==
      input.pairs.length
    ) {
      // Two identical right-hand items make one of them unmarkable: a student
      // picking the duplicate is right by eye and wrong by id.
      errors.pairs = "Two matches are the same. Each right-hand item must be distinct.";
    }
  } else if (input.kind === "boolean") {
    if (input.correctOptionId !== "true" && input.correctOptionId !== "false") {
      errors.correctOptionId = "Say whether the statement is true or false.";
    }
  } else {
    const filled = input.options.filter((option) => option.text.trim());

    if (input.options.length > MAX_OPTIONS) {
      errors.options = `No more than ${MAX_OPTIONS} options.`;
    } else if (filled.length < MIN_OPTIONS) {
      errors.options = `Give at least ${MIN_OPTIONS} options.`;
    } else if (filled.length !== input.options.length) {
      errors.options = "Fill in every option, or remove the blank ones.";
    }

    // The whole point of authoring a question is saying which answer is right.
    if (input.kind === "multi") {
      const marked = input.correctOptionIds.filter((id) =>
        filled.some((option) => option.id === id),
      );
      if (marked.length === 0) {
        errors.correctOptionId = "Tick every option that is correct.";
      } else if (marked.length === input.options.length) {
        // Every option correct means the question asks nothing.
        errors.correctOptionId = "Not every option can be correct.";
      }
    } else if (!input.correctOptionId) {
      errors.correctOptionId = "Mark the correct option.";
    } else if (!filled.some((option) => option.id === input.correctOptionId)) {
      errors.correctOptionId = "The correct option must be one of the options.";
    }
  }

  // The explanation is the teaching — it is shown after every submission,
  // right or wrong — so it is required rather than nice to have.
  const explanation = input.explanation.trim();
  if (!explanation) {
    errors.explanation = "Explain the answer — students see this after they submit.";
  } else if (explanation.length > 1000) {
    errors.explanation = "Keep the explanation under 1000 characters.";
  }

  return errors;
}

export type QuestionsResult = {
  /** A problem with the set as a whole, e.g. there aren't any. */
  form?: string;
  /** Per-question errors, keyed by index. */
  byIndex: Record<number, QuestionErrors>;
};

export function validateQuestions(
  questions: QuestionInput[],
  { required }: { required: boolean },
): QuestionsResult {
  const byIndex: Record<number, QuestionErrors> = {};

  if (questions.length === 0) {
    // An unfinished test is allowed to exist as a draft — a teacher writes it
    // over several sittings — but it cannot be published empty.
    return required
      ? { form: "Add at least one question.", byIndex }
      : { byIndex };
  }

  if (questions.length > MAX_QUESTIONS) {
    return { form: `No more than ${MAX_QUESTIONS} questions.`, byIndex };
  }

  questions.forEach((question, index) => {
    const errors = validateQuestion(question);
    if (hasErrors(errors)) byIndex[index] = errors;
  });

  return { byIndex };
}

/* -------------------------------- subtopic ------------------------------- */

export type SubtopicInput = {
  key: string;
  title: string;
  kind: string;
  status: string;
  /**
   * kind === "video". `video` is the JSON `VideoUpload` posts — an uploaded
   * file on Bunny Stream, or "" for none. `videoUrl` is the older fallback, a
   * link to a video hosted elsewhere. Either satisfies publishing.
   */
  video: string;
  videoUrl: string;
  seconds: string;
  caption: string;
  /** kind === "text" */
  body: string;
  /** kind === "pdf" — the JSON `FileUpload` posts, or "" for none. */
  pdf: string;
};

export type SubtopicErrors = Partial<Record<keyof SubtopicInput, string>>;

export const EMPTY_SUBTOPIC: SubtopicInput = {
  key: "",
  title: "",
  kind: "video",
  status: "draft",
  video: "",
  videoUrl: "",
  seconds: "",
  caption: "",
  body: "",
  pdf: "",
};

export const MAX_BODY_LENGTH = 40_000;

/**
 * `questions` is passed separately because it is a list, not a form field —
 * `QuestionBuilder` owns it and posts it as JSON.
 */
export function validateSubtopic(
  input: SubtopicInput,
  questions: QuestionInput[] = [],
  options: { hasPdf?: boolean } = {},
): SubtopicErrors & { questions?: QuestionsResult } {
  const errors: SubtopicErrors & { questions?: QuestionsResult } = {};

  Object.assign(errors, validateKey(input.key));

  const title = input.title.trim();
  if (!title) {
    errors.title = "Give the subtopic a title.";
  } else if (title.length > 160) {
    errors.title = "Keep the title under 160 characters.";
  }

  if (!isSubtopicKind(input.kind)) {
    errors.kind = "Pick what kind of subtopic this is.";
    return errors;
  }

  if (!isNodeStatus(input.status)) errors.status = "Pick a status.";

  // A draft can be incomplete — that is what draft is for. Publishing is the
  // moment the content has to actually be there.
  const publishing = input.status === "published";
  const kind: SubtopicKind = input.kind;

  if (kind === "video") {
    // An uploaded video and a pasted link are alternatives, not a pair. The
    // upload wins at play time, so it is what publishing looks for first, and
    // the link only has to be there when there is no upload.
    const { video, error: videoError } = parseStoredVideo(input.video);
    if (videoError) errors.video = videoError;

    const url = input.videoUrl.trim();
    if (!url) {
      if (publishing && !video && !videoError) {
        errors.video = "Upload a video, or paste a link, before publishing.";
      }
    } else if (!URL_PATTERN.test(url)) {
      errors.videoUrl = "Enter a full link starting with https://";
    } else if (url.length > 500) {
      errors.videoUrl = "Keep the link under 500 characters.";
    }

    // A video that failed to encode is not a lesson. Saving the draft is fine
    // — the teacher may be about to replace it — but publishing it would give
    // every student an error frame.
    if (publishing && video?.status === "failed") {
      errors.video = "That video failed to encode. Upload it again before publishing.";
    }

    if (input.seconds.trim()) {
      const seconds = Number(input.seconds);
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86_400) {
        errors.seconds = "Runtime in seconds, up to 24 hours.";
      }
    }

    if (input.caption.trim().length > 500) {
      errors.caption = "Keep the caption under 500 characters.";
    }
  }

  if (kind === "text") {
    const body = input.body.trim();
    if (!body) {
      if (publishing) errors.body = "Write the content before publishing.";
    } else if (body.length > MAX_BODY_LENGTH) {
      errors.body = `Keep the content under ${MAX_BODY_LENGTH.toLocaleString("en-IN")} characters.`;
    }
  }

  if (kind === "pdf") {
    /**
     * Whether a document is attached is decided by the **caller**, from the
     * files `parseUploadedFiles` actually recognised — the same shape
     * `validateMaterial` uses for a module's study material.
     *
     * Not from `input.pdf` directly: `FileUpload` posts a JSON array, so an
     * empty field arrives as the string `"[]"`, which is perfectly truthy. A
     * check on the raw string therefore passes for a subtopic with no document
     * at all, and the paper publishes empty.
     */
    if (publishing && !options.hasPdf) {
      errors.pdf = "Upload the PDF before publishing.";
    }
  }

  if (kind === "quiz") {
    const result = validateQuestions(questions, { required: publishing });
    if (result.form || hasErrors(result.byIndex)) errors.questions = result;
  }

  return errors;
}

/**
 * Reading time from a word count, at 200 words per minute.
 *
 * Stored on the subtopic rather than recomputed, so a sidebar listing thirty
 * subtopics doesn't count thirty bodies of text it isn't otherwise loading.
 */
export function readMinutesFor(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/* ------------------------------- assessment ------------------------------ */

export type AssessmentInput = {
  title: string;
  durationMinutes: string;
  marksPerQuestion: string;
  status: string;
};

export type AssessmentErrors = Partial<Record<keyof AssessmentInput, string>>;

export const EMPTY_ASSESSMENT: AssessmentInput = {
  title: "",
  durationMinutes: "30",
  marksPerQuestion: "5",
  status: "draft",
};

export function validateAssessment(
  input: AssessmentInput,
  questions: QuestionInput[] = [],
): AssessmentErrors & { questions?: QuestionsResult } {
  const errors: AssessmentErrors & { questions?: QuestionsResult } = {};

  const title = input.title.trim();
  if (!title) {
    errors.title = "Give the test a title.";
  } else if (title.length > 140) {
    errors.title = "Keep the title under 140 characters.";
  }

  const duration = Number(input.durationMinutes);
  if (!Number.isFinite(duration) || duration < 5 || duration > 180) {
    errors.durationMinutes = "Between 5 and 180 minutes.";
  }

  const marks = Number(input.marksPerQuestion);
  if (!Number.isInteger(marks) || marks < 1 || marks > 100) {
    errors.marksPerQuestion = "A whole number between 1 and 100.";
  }

  if (!isNodeStatus(input.status)) errors.status = "Pick a status.";

  const result = validateQuestions(questions, {
    required: input.status === "published",
  });
  if (result.form || hasErrors(result.byIndex)) errors.questions = result;

  return errors;
}

/* ------------------------------- assignment ------------------------------ */

export type AssignmentInput = {
  key: string;
  title: string;
  brief: string;
  dueDate: string;
  maxMarks: string;
  status: string;
};

export type AssignmentErrors = Partial<Record<keyof AssignmentInput, string>> & {
  acceptedFormats?: string;
  /** The handed-out PDF. Not a text field, so it sits alongside them. */
  briefFile?: string;
};

export const EMPTY_ASSIGNMENT: AssignmentInput = {
  key: "",
  title: "",
  brief: "",
  dueDate: "",
  maxMarks: String(ASSIGNMENT_MAX),
  status: "draft",
};

/**
 * `acceptedFormats` arrives as a list of checkbox values and the brief PDF as a
 * JSON blob, so both are validated alongside the string fields rather than
 * being one of them.
 */
export function validateAssignment(
  input: AssignmentInput,
  acceptedFormats: string[],
  options: { hasBriefFile?: boolean } = {},
): AssignmentErrors {
  const errors: AssignmentErrors = {};

  Object.assign(errors, validateKey(input.key));

  const title = input.title.trim();
  if (!title) {
    errors.title = "Give the assignment a title.";
  } else if (title.length > 140) {
    errors.title = "Keep the title under 140 characters.";
  }

  /**
   * A published assignment must tell the student what to do — but it may do
   * that in either medium. A teacher who hands out a PDF spec has written the
   * brief; demanding they also retype it into the box would be busywork, and a
   * rule people work around by pasting "see attached".
   */
  const brief = input.brief.trim();
  if (!brief) {
    if (input.status === "published" && !options.hasBriefFile) {
      errors.brief =
        "Write the brief or attach it as a PDF before publishing — it is what the student works from.";
    }
  } else if (brief.length > MAX_BODY_LENGTH) {
    errors.brief = "Keep the brief under 40,000 characters.";
  }

  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
    errors.dueDate = "Pick a date.";
  }

  const maxMarks = Number(input.maxMarks);
  if (!Number.isFinite(maxMarks) || maxMarks < 1 || maxMarks > 500) {
    errors.maxMarks = "Between 1 and 500 marks.";
  }

  // The whole "creator decides the submission type" requirement comes down to
  // this: a student must be told what to hand in.
  if (acceptedFormats.length === 0) {
    errors.acceptedFormats = "Pick at least one accepted format.";
  } else if (!acceptedFormats.every(isSubmissionFormat)) {
    errors.acceptedFormats = "Unrecognised format.";
  }

  if (!isNodeStatus(input.status)) errors.status = "Pick a status.";

  return errors;
}

/* ------------------------------- submission ------------------------------ */

export type SubmissionInput = {
  fileUrl: string;
  format: string;
  note: string;
};

export type SubmissionErrors = Partial<Record<keyof SubmissionInput, string>>;

export const EMPTY_SUBMISSION: SubmissionInput = {
  fileUrl: "",
  format: "",
  note: "",
};

export function validateSubmission(
  input: SubmissionInput,
  acceptedFormats: readonly SubmissionFormat[],
): SubmissionErrors {
  const errors: SubmissionErrors = {};

  const url = input.fileUrl.trim();
  if (!url) {
    errors.fileUrl = "Paste the link to your work.";
  } else if (!URL_PATTERN.test(url)) {
    errors.fileUrl = "Enter a full link starting with https://";
  } else if (url.length > 500) {
    errors.fileUrl = "Keep the link under 500 characters.";
  }

  if (!isSubmissionFormat(input.format)) {
    errors.format = "Say which format you are handing in.";
  } else if (!acceptedFormats.includes(input.format)) {
    errors.format = "That format isn't accepted for this assignment.";
  } else if (!errors.fileUrl) {
    // Best effort only: most share links carry no filename, and "can't tell"
    // must never be reported as "wrong". See submission-formats.ts.
    const extension = extensionFromUrl(url);
    const allowed = SUBMISSION_FORMAT_EXTENSIONS[input.format];
    if (extension && !allowed.includes(extension)) {
      errors.fileUrl = `That link looks like a .${extension} file, which isn't a ${input.format} hand-in.`;
    }
  }

  if (input.note.trim().length > 600) {
    errors.note = "Keep the note under 600 characters.";
  }

  return errors;
}

/* --------------------------------- grading ------------------------------- */

export type GradeInput = { scored: string; feedback: string };

export type GradeErrors = Partial<Record<keyof GradeInput, string>>;

export const EMPTY_GRADE: GradeInput = { scored: "", feedback: "" };

export function validateGrade(input: GradeInput, maxMarks: number): GradeErrors {
  const errors: GradeErrors = {};

  const scored = Number(input.scored);
  if (!input.scored.trim()) {
    errors.scored = "Enter a mark.";
  } else if (!Number.isFinite(scored) || scored < 0 || scored > maxMarks) {
    errors.scored = `Between 0 and ${maxMarks}.`;
  }

  if (input.feedback.trim().length > 2000) {
    errors.feedback = "Keep the feedback under 2000 characters.";
  }

  return errors;
}

/* -------------------------------- reorder -------------------------------- */

/**
 * A reorder posts the **whole** sibling list in its new order.
 *
 * Rejecting a partial list is the point: a page loaded before a colleague added
 * a module would otherwise silently drop it to the end, or out of the ordering
 * entirely. If the posted set doesn't match what is in the database, the page
 * is stale and the student's answer is to reload, not to guess.
 */
export function validateReorder(
  posted: string[],
  current: string[],
): string | undefined {
  if (posted.length !== current.length) {
    return "This list changed while you were working on it. Reload and try again.";
  }
  const currentSet = new Set(current);
  if (posted.some((id) => !currentSet.has(id))) {
    return "This list changed while you were working on it. Reload and try again.";
  }
  if (new Set(posted).size !== posted.length) {
    return "The same item appeared twice.";
  }
  return undefined;
}

/* -------------------------------- shared --------------------------------- */

/**
 * Every node carries a stable `key` — `pm-c4-m2` — which is what URLs, teacher
 * assignments and the migration all speak. It never changes after creation,
 * because changing it would break every link and every `courseIds` entry
 * pointing at it.
 */
function validateKey(raw: string): { key?: string } {
  const key = raw.trim();
  if (!key) return { key: "Give this a key." };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key)) {
    return { key: "Lowercase letters, numbers and hyphens only." };
  }
  if (key.length > 80) return { key: "Keep the key under 80 characters." };
  return {};
}
