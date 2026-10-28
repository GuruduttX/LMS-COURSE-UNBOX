/**
 * The shapes the curriculum forms pass to `useActionState`.
 *
 * Separate from `actions/curriculum.ts` because a `"use server"` module may
 * only export async functions — a seed object exported from there is a build
 * error, not a style choice. The client forms import the seeds from here and
 * the actions from there.
 */
import type { SubmissionFormat } from "@/lib/curriculum/submission-formats";
import type { UploadedFile } from "@/lib/uploads/kinds";
import {
  EMPTY_ASSESSMENT,
  EMPTY_ASSIGNMENT,
  EMPTY_COURSE,
  EMPTY_MATERIAL,
  EMPTY_NODE,
  EMPTY_PROGRAM,
  EMPTY_PROGRAM_DETAILS,
  EMPTY_PROGRAM_DETAILS_LISTS,
  EMPTY_SUBTOPIC,
  type AssessmentErrors,
  type AssessmentInput,
  type AssignmentErrors,
  type AssignmentInput,
  type CourseErrors,
  type CourseInput,
  type GradeErrors,
  type GradeInput,
  EMPTY_GRADE,
  type MaterialErrors,
  type MaterialInput,
  type NodeErrors,
  type NodeInput,
  type ProgramDetailsErrors,
  type ProgramDetailsInput,
  type ProgramDetailsLists,
  type ProgramErrors,
  type ProgramInput,
  type QuestionInput,
  type ResubmissionErrors,
  type ResubmissionInput,
  EMPTY_RESUBMISSION,
  type SubmissionErrors,
  type SubmissionInput,
  type SubtopicErrors,
  type SubtopicInput,
  EMPTY_SUBMISSION,
} from "@/lib/validation/curriculum";

export type FormState<Values, Errors> = {
  ok: boolean;
  /** A problem with the request as a whole, not with one field. */
  error?: string;
  errors: Errors;
  values: Values;
};

export type ProgramFormState = FormState<ProgramInput, ProgramErrors>;

/**
 * The public pitch, edited on its own screen rather than in the program form.
 *
 * The cover and the three bullet lists ride beside the values for the reason an
 * assignment's brief and its accepted formats do: they are not string fields,
 * and a rejected save must hand the form back the picture somebody just waited
 * on an upload for rather than lose it.
 */
export type ProgramDetailsFormState = FormState<
  ProgramDetailsInput,
  ProgramDetailsErrors
> &
  ProgramDetailsLists & {
    cover: UploadedFile | null;
  };
export type CourseFormState = FormState<CourseInput, CourseErrors>;
/** Modules and topics share this state; their forms carry the same fields. */
export type NodeFormState = FormState<NodeInput, NodeErrors>;

/**
 * A module's study material, edited on the module screen rather than in the
 * module form. `material` rides beside the values for the reason an
 * assignment's brief does: it is not a string field, and a rejected save must
 * hand the form back the attachment rather than lose it.
 */
export type MaterialFormState = FormState<MaterialInput, MaterialErrors> & {
  material: UploadedFile | null;
};
export type SubtopicFormState = FormState<
  SubtopicInput,
  SubtopicErrors & { questions?: string }
> & { questions: QuestionInput[] };

/**
 * A test carries its questions the same way a quiz subtopic does — as a list
 * the builder owns, posted as JSON — so it needs the same second slot beside
 * the string fields.
 */
export type AssessmentFormState = FormState<
  AssessmentInput,
  AssessmentErrors & { questions?: string }
> & { questions: QuestionInput[] };

/**
 * `acceptedFormats` is a checkbox group, not a text field, so it rides beside
 * the values rather than inside them — otherwise a rejected save would hand the
 * form back a string where it expects a list.
 */
export type AssignmentFormState = FormState<AssignmentInput, AssignmentErrors> & {
  acceptedFormats: SubmissionFormat[];
  /** The handed-out brief, for the same reason: it is not a string field. */
  briefFile: UploadedFile | null;
};

/**
 * A hand-in. `file` rides beside the values for the same reason the brief's
 * does: it is not a string field, and a rejected save must hand the form back
 * the attachment rather than a string where it expects a file.
 */
export type SubmissionFormState = FormState<SubmissionInput, SubmissionErrors> & {
  file: UploadedFile | null;
};

export const EMPTY_SUBMISSION_STATE: SubmissionFormState = {
  ok: false,
  errors: {},
  values: EMPTY_SUBMISSION,
  file: null,
};

/**
 * A mark. The teacher's half of the loop the hand-in above starts.
 *
 * No extras beside the values: a mark is two plain fields, which is why this is
 * the one form state in here that is `FormState` and nothing more.
 */
export type GradeFormState = FormState<GradeInput, GradeErrors>;

export const EMPTY_GRADE_STATE: GradeFormState = {
  ok: false,
  errors: {},
  values: EMPTY_GRADE,
};

/** Sending a hand-in back for another go — the teacher's other answer to it. */
export type ResubmissionFormState = FormState<ResubmissionInput, ResubmissionErrors>;

export const EMPTY_RESUBMISSION_STATE: ResubmissionFormState = {
  ok: false,
  errors: {},
  values: EMPTY_RESUBMISSION,
};

/** Delete, publish and reorder need no field errors — they have no fields. */
export type ActionState = { ok: boolean; error?: string };

export const EMPTY_ACTION_STATE: ActionState = { ok: false };

export const EMPTY_PROGRAM_STATE: ProgramFormState = {
  ok: false,
  errors: {},
  values: EMPTY_PROGRAM,
};

export const EMPTY_PROGRAM_DETAILS_STATE: ProgramDetailsFormState = {
  ok: false,
  errors: {},
  values: EMPTY_PROGRAM_DETAILS,
  cover: null,
  ...EMPTY_PROGRAM_DETAILS_LISTS,
};

export const EMPTY_COURSE_STATE: CourseFormState = {
  ok: false,
  errors: {},
  values: EMPTY_COURSE,
};

export const EMPTY_NODE_STATE: NodeFormState = {
  ok: false,
  errors: {},
  values: EMPTY_NODE,
};

export const EMPTY_MATERIAL_STATE: MaterialFormState = {
  ok: false,
  errors: {},
  values: EMPTY_MATERIAL,
  material: null,
};

export const EMPTY_SUBTOPIC_STATE: SubtopicFormState = {
  ok: false,
  errors: {},
  values: EMPTY_SUBTOPIC,
  questions: [],
};

export const EMPTY_ASSESSMENT_STATE: AssessmentFormState = {
  ok: false,
  errors: {},
  values: EMPTY_ASSESSMENT,
  questions: [],
};

export const EMPTY_ASSIGNMENT_STATE: AssignmentFormState = {
  ok: false,
  errors: {},
  values: EMPTY_ASSIGNMENT,
  acceptedFormats: ["pdf"],
  briefFile: null,
};
