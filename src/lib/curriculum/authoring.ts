/**
 * Who may author, and who may delete what.
 *
 * `permissions.ts` answers "what kind of thing" — a teacher holds
 * `curriculum.author` and `curriculum.delete`, a program manager holds neither.
 * It cannot answer the rule this file exists for:
 *
 * > An admin may delete any node. A teacher may delete a **topic** or a
 * > **subtopic**, and nothing above them.
 *
 * That is a statement about node types rather than roles, so it lives here as a
 * table, read by the delete actions and by the buttons that offer them. Both
 * read the same table, which is what stops a Delete button appearing on a
 * course for someone who would then be refused.
 *
 * ## Why the line is drawn there
 *
 * Deleting a subtopic loses one screen. Deleting a course takes its modules,
 * topics, subtopics, assignments and final test with it, along with every
 * student's progress through them — that is a decision about a cohort, not
 * about content, and it belongs to whoever owns the cohort.
 *
 * **Archiving is the reversible door and everyone has it.** A teacher who wants
 * a course gone sets it to `archived`: students stop seeing it immediately, and
 * the marks pointing at it still resolve. Delete is for content that should
 * never have existed.
 *
 * Pure — no server imports — so the client islands can import it too.
 */
import type { Role } from "@/lib/auth/roles";

/** Every level of the tree that can be created or removed on its own. */
export const NODE_TYPES = [
  "program",
  "course",
  "module",
  "topic",
  "subtopic",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  program: "program",
  course: "course",
  module: "module",
  topic: "topic",
  subtopic: "subtopic",
};

/** What a delete takes with it, in the words the confirm dialog uses. */
export const NODE_CASCADE: Record<NodeType, string> = {
  program:
    "every course, module, topic and subtopic inside it, its assignments and tests, and all student progress through them",
  course:
    "its modules, topics and subtopics, its assignments, its final test, and all student progress through them",
  module: "its topics, its subtopics, its module test, and student progress",
  topic: "its subtopics and student progress through them",
  subtopic: "student progress through it",
};

/** Node types a teacher may delete. Everything else is the admin's. */
const TEACHER_MAY_DELETE: readonly NodeType[] = ["topic", "subtopic"];

/**
 * May this person delete this kind of node?
 *
 * Called by the action *and* by the UI. A caller must still check the
 * capability and the scope — this answers only "which node types", the same way
 * `can()` answers only "what kind of thing".
 */
export function canDeleteNode(
  user: { role: Role } | null | undefined,
  type: NodeType,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role !== "teacher") return false;
  return TEACHER_MAY_DELETE.includes(type);
}

/** Why the button isn't there, for the one-line note that replaces it. */
export function deleteDeniedReason(type: NodeType): string {
  return `Only an admin can delete a ${NODE_TYPE_LABEL[type]}. Archive it instead — students stop seeing it and the marks still resolve.`;
}

/* ------------------------------ graded work ------------------------------ */

/**
 * Tests and assignments are not levels of the tree.
 *
 * They hang off a course or a module rather than containing anything, so they
 * have no `order`, no children and no place in `NODE_TYPES`. They do need the
 * same "who may remove this" answer, and for them the honest rule is not about
 * the type at all — it is about whether a student has already done the work:
 *
 * > A teacher may delete a test or an assignment **nobody has sat or handed in
 * > to**. Once there are attempts or submissions, deleting it destroys marks a
 * > student earned, and that is the admin's call.
 *
 * A teacher who wants a live paper gone archives it, exactly as with a course:
 * students stop seeing it and the marks still resolve.
 */
export const WORK_TYPES = ["assessment", "assignment"] as const;

export type WorkType = (typeof WORK_TYPES)[number];

export const WORK_TYPE_LABEL: Record<WorkType, string> = {
  assessment: "test",
  assignment: "assignment",
};

/** What a delete takes with it, in the words the confirm dialog uses. */
export const WORK_CASCADE: Record<WorkType, string> = {
  assessment: "every attempt at it and the marks those attempts carry",
  assignment: "every hand-in against it and the marks and feedback on them",
};

/**
 * May this person delete this test or assignment?
 *
 * `hasWork` is "somebody has already attempted or handed in". The action counts
 * it in the database and the button is told the same number, so a control that
 * renders is a control that works.
 */
export function canDeleteWork(
  user: { role: Role } | null | undefined,
  { type, hasWork }: { type: WorkType; hasWork: boolean },
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role !== "teacher") return false;
  // Type is not what decides it here — student work is. Named anyway, so a
  // third kind of graded work can differ without changing the callers.
  return WORK_TYPES.includes(type) && !hasWork;
}

/** Why the button isn't there, for the one-line note that replaces it. */
export function workDeleteDeniedReason(type: WorkType): string {
  return `Students have already worked on this ${WORK_TYPE_LABEL[type]}, so only an admin can delete it. Archive it instead — students stop seeing it and their marks still resolve.`;
}
