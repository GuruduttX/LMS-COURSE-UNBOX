/**
 * The rules of the programme, in one place.
 *
 * These are institutional policy, not per-student data and not content a
 * teacher authors: how much counts as a pass, how many retakes a student gets,
 * what each piece of work is marked out of. They live here so changing a policy
 * is one edit rather than a search across screens.
 *
 * The maxima moved here from `data/marksheet.ts`, which used to own them back
 * when the marksheet was the only thing that needed them. The gate needs them
 * too now.
 */

/* ------------------------------ publishing ------------------------------- */

/**
 * Every node of the tree carries one of these.
 *
 * A teacher may edit a course students are actively taking — corrections must
 * reach students immediately, and a shadow draft tree would double every model
 * and every query. The protection is narrower: a **new** node is invisible
 * until published, and a removed one is `archived` rather than deleted so the
 * progress and marks already pointing at it still resolve.
 */
export const NODE_STATUSES = ["draft", "published", "archived"] as const;

export type NodeStatus = (typeof NODE_STATUSES)[number];

export function isNodeStatus(value: unknown): value is NodeStatus {
  return (
    typeof value === "string" &&
    (NODE_STATUSES as readonly string[]).includes(value)
  );
}

/* --------------------------------- gates --------------------------------- */

/** A course's final test must be passed at this percentage to move on. */
export const FINAL_TEST_PASS_PERCENT = 50;

/**
 * Whether an assignment must be *marked* before the next course unlocks, or
 * merely handed in.
 *
 * False, deliberately: an unresponsive teacher would otherwise freeze a whole
 * cohort at a course boundary. The mark still lands on the marksheet whenever
 * it arrives. Flip this one constant to make the gate stricter.
 */
export const ASSIGNMENT_GATE_REQUIRES_MARK = false;

/* -------------------------------- retakes -------------------------------- */

/** Attempts a student gets at one course final test. The best score counts. */
export const MAX_FINAL_ATTEMPTS = 3;

/**
 * Attempts at a term paper. **One.**
 *
 * A course final test is a gate — failing it must not end a student's programme,
 * so it is worth three goes and the best counts. The mid- and end-term are
 * examinations: they are what the 50% combined term rule and the aggregate are
 * measured from, and a paper you can re-sit until it goes well measures nothing.
 */
export const MAX_TERM_ATTEMPTS = 1;

/** The wait after a failed final test, so retaking isn't brute force. */
export const RETAKE_COOLDOWN_HOURS = 24;

/* ------------------------------- proctoring ------------------------------ */

/**
 * Warnings a student gets during a proctored test before it submits itself.
 * The 11th violation is the one that ends the attempt — see `recordViolation`.
 */
export const MAX_PROCTOR_WARNINGS = 10;

/* --------------------------------- marks --------------------------------- */

export const PROJECT_MAX = 200;
export const ASSIGNMENT_MAX = 100;
export const TEST_MARK_PER_QUESTION = 5;
export const TERM_MARK_PER_QUESTION = 20;

/** Aggregate needed across the programme to graduate. */
export const MIN_AGGREGATE_PERCENT = 75;

/** Needed across the mid- and end-term papers together. */
export const MIN_TERM_PERCENT = 50;

/* ------------------------------- presentation ---------------------------- */

/**
 * How a program is pitched to someone who has not enrolled — the vocabulary of
 * `Program.marketing`, which is what the public pages render.
 *
 * These are policy in the same sense as the maxima above: what may be claimed
 * on the site, and how much of it. They live here rather than in the schema so
 * the form, the validator and the model all read one list.
 */
export const PROGRAM_LEVELS = ["beginner", "intermediate", "advanced"] as const;

export type ProgramLevel = (typeof PROGRAM_LEVELS)[number];

export function isProgramLevel(value: unknown): value is ProgramLevel {
  return (
    typeof value === "string" &&
    (PROGRAM_LEVELS as readonly string[]).includes(value)
  );
}

/**
 * Caps on the three bullet lists, so a card cannot become a wall of text.
 *
 * Chosen for the layouts that render them rather than for the database: eight
 * highlights fill the public page's two-column grid exactly, and twelve tool
 * chips are about a phone's worth of two rows.
 */
export const MAX_HIGHLIGHTS = 8;
export const MAX_TOOLS = 12;
export const MAX_OFFERS = 8;

/** The longest a program may claim to run, in months — a sanity bound. */
export const MAX_PROGRAM_MONTHS = 36;
