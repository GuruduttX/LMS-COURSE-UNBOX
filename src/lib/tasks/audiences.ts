/**
 * Who a task is for — the three widths, defined once.
 *
 * Its own module rather than a constant on `models/Task`, for the same reason
 * `data/session-kinds.ts` and `tasks/submission-kinds.ts` are: the validator
 * needs this list, the composer imports the validator, and the composer runs in
 * a browser. One `import` of a Mongoose model anywhere in that chain drags the
 * driver into the client bundle and the build fails on `dns`, `fs` and `net`.
 * Pure, dependency-free, and imported by both sides.
 *
 * Narrowest last, which is also how the composer lists them:
 *
 * - `program` — everyone enrolled. Only an admin, a manager, or a teacher who
 *   holds every cohort may set one; see `createTask`.
 * - `batch` — one cohort, named on `Task.batch`. The widest thing a teacher
 *   assigned to some of a program's batches can address.
 * - `student` — one person, named on `Task.studentId`.
 */
export const TASK_AUDIENCES = ["program", "batch", "student"] as const;

export type TaskAudience = (typeof TASK_AUDIENCES)[number];
