import "server-only";
import { notFound } from "next/navigation";

import { assertScope, type CurrentUser } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db";
import { seatsLeft } from "@/lib/validation/batch";
import { Batch, type BatchStatus } from "@/models/Batch";
import { Enrollment } from "@/models/Enrollment";
import { Program } from "@/models/Program";

/**
 * Batches, and how full they are.
 *
 * **Occupancy is derived, never stored.** The seat count on a batch is a limit;
 * how many are taken is a `countDocuments` over active enrolments naming it. A
 * stored counter would drift the first time somebody was withdrawn, and then
 * two screens would disagree about whether a cohort was full — which is the one
 * thing this feature exists to answer.
 *
 * The same rule as `data/sessions.ts`: everything countable is computed.
 */

export type BatchRow = {
  id: string;
  programSlug: string;
  name: string;
  capacity: number;
  /** Active enrolments naming this batch. */
  enrolled: number;
  seatsLeft: number;
  isFull: boolean;
  status: BatchStatus;
  startsOn: string | null;
  endsOn: string | null;
};

/** What the enrol picker needs — the same numbers, without the row's identity. */
export type BatchOption = Pick<
  BatchRow,
  "id" | "name" | "capacity" | "enrolled" | "seatsLeft" | "isFull" | "status"
>;

/** The programs this user may run batches for. Admins get every program. */
export function manageableProgramsFor(user: CurrentUser): string[] {
  return user.role === "admin"
    ? []
    : user.assignments.map((item) => item.programSlug);
}

/**
 * Every batch in the programs this user may see, most recently started first.
 *
 * Scoped in the query rather than filtered afterwards, for the same reason
 * `listManagedSessions` is: a bug here shows too few batches instead of
 * leaking another program's cohort.
 */
export async function listBatches(
  user: CurrentUser,
  filters: { programSlug?: string | null } = {},
): Promise<BatchRow[]> {
  await connectToDatabase();

  const allowed = manageableProgramsFor(user);
  if (user.role !== "admin" && allowed.length === 0) return [];

  const scope =
    user.role === "admin" ? {} : { programSlug: { $in: allowed } };

  const filter =
    filters.programSlug &&
    (user.role === "admin" || allowed.includes(filters.programSlug))
      ? { programSlug: filters.programSlug }
      : scope;

  const docs = await Batch.find(filter)
    .sort({ programSlug: 1, name: 1 })
    .lean();

  return withOccupancy(docs);
}

/**
 * The batches offerable for one program — open ones only.
 *
 * A closed batch is deliberately absent rather than shown-and-disabled: it is
 * not a cohort somebody might join once a seat frees up, it is one that is
 * over. Full batches *are* included, flagged, because that is a state the
 * person picking needs to see and can act on by raising the capacity.
 */
export async function batchOptionsFor(
  programSlug: string,
): Promise<BatchOption[]> {
  await connectToDatabase();

  const docs = await Batch.find({ programSlug, status: "open" })
    .sort({ name: 1 })
    .lean();

  return (await withOccupancy(docs)).map((row) => ({
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    enrolled: row.enrolled,
    seatsLeft: row.seatsLeft,
    isFull: row.isFull,
    status: row.status,
  }));
}

/**
 * One batch, by the pair that identifies it.
 *
 * `(programSlug, name)` rather than an id because that is what the enrolments
 * are keyed by and what the URL can carry legibly — the unique index makes the
 * pair as good as an id, and a rename already cascades to both.
 *
 * Scoped like every other loader here: a manager asking for a cohort on a
 * program that is not theirs gets a 404, not a refusal.
 */
export async function batchDetail(
  user: CurrentUser,
  programSlug: string,
  name: string,
): Promise<BatchRow> {
  assertScope(user, { program: programSlug });

  await connectToDatabase();

  const doc = await Batch.findOne({ programSlug, name }).lean();
  if (!doc) notFound();

  const [row] = await withOccupancy([doc]);
  return row;
}

/**
 * When one student's own cohort ends, for their overview header.
 *
 * A deadline is a fact about the batch somebody sits in, not about the program
 * — two cohorts of the same program finish on different days — so it is read
 * through the student's enrolment rather than from the program.
 *
 * Null covers every ordinary case: not enrolled, no batch on the enrolment, a
 * batch with no end date set. The header renders nothing rather than a
 * placeholder, because a made-up deadline is worse than none.
 */
export async function studentBatchDeadline(
  studentId: string,
  programSlug: string,
): Promise<string | null> {
  await connectToDatabase();

  const program = await Program.findOne({ slug: programSlug })
    .select("_id")
    .lean();
  if (!program) return null;

  const enrollment = await Enrollment.findOne({
    studentId,
    programId: program._id,
  })
    .select("batch")
    .lean();
  if (!enrollment?.batch) return null;

  const batch = await Batch.findOne({ programSlug, name: enrollment.batch })
    .select("endsOn")
    .lean();

  return batch?.endsOn ? batch.endsOn.toISOString() : null;
}

/**
 * The same answer as `studentBatchDeadline`, for several cohorts at once.
 *
 * The dashboard already holds the student's enrolments, so re-deriving the
 * batch from a studentId per program would be three queries a card. This takes
 * the (program, batch) pairs it already knows and asks once.
 *
 * Keyed `programSlug|name`, the pair a batch is actually unique on — batch
 * names ("Batch A") repeat across programs.
 */
export async function batchDeadlines(
  pairs: { programSlug: string; name: string }[],
): Promise<Map<string, string | null>> {
  if (pairs.length === 0) return new Map();

  await connectToDatabase();

  const docs = await Batch.find({
    $or: pairs.map(({ programSlug, name }) => ({ programSlug, name })),
  })
    .select("programSlug name endsOn")
    .lean();

  return new Map(
    docs.map((doc) => [
      `${doc.programSlug}|${doc.name}`,
      doc.endsOn ? doc.endsOn.toISOString() : null,
    ]),
  );
}

/**
 * One batch's live occupancy, read at the moment of writing.
 *
 * The enrol action calls this immediately before it saves rather than trusting
 * the count the form was rendered with — a page open in two tabs would
 * otherwise fill a one-seat batch twice. It is still a check-then-write, so two
 * simultaneous enrolments can both pass; the window is milliseconds and the
 * consequence is one student over, which staff can see and fix. A unique index
 * cannot express "at most N", so the alternative would be a transaction for a
 * cohort list.
 */
export async function batchOccupancy(
  programSlug: string,
  name: string,
): Promise<{ capacity: number; enrolled: number; status: BatchStatus } | null> {
  await connectToDatabase();

  const batch = await Batch.findOne({ programSlug, name })
    .select("capacity status")
    .lean();
  if (!batch) return null;

  const enrolled = await countActive(programSlug, name);

  return {
    capacity: batch.capacity,
    enrolled,
    status: batch.status as BatchStatus,
  };
}

/* -------------------------------- internals ------------------------------- */

type LeanBatch = {
  _id: unknown;
  programSlug: string;
  name: string;
  capacity: number;
  status: string;
  startsOn?: Date | null;
  endsOn?: Date | null;
};

/**
 * One aggregation for every batch on screen, not one count each.
 *
 * Enrolments are keyed by `(programId, batch-name)`, so the programs have to be
 * resolved to ids first — the one place the slug/id split costs a query.
 */
async function withOccupancy(docs: LeanBatch[]): Promise<BatchRow[]> {
  if (docs.length === 0) return [];

  const slugs = [...new Set(docs.map((doc) => doc.programSlug))];
  const programs = await Program.find({ slug: { $in: slugs } })
    .select("_id slug")
    .lean();

  const slugOf = new Map(programs.map((row) => [String(row._id), row.slug]));

  const counts = await Enrollment.aggregate<{
    _id: { programId: unknown; batch: string };
    n: number;
  }>([
    {
      $match: {
        programId: { $in: programs.map((row) => row._id) },
        status: "active",
      },
    },
    {
      $group: {
        _id: { programId: "$programId", batch: "$batch" },
        n: { $sum: 1 },
      },
    },
  ]);

  const taken = new Map(
    counts.flatMap((row) => {
      const slug = slugOf.get(String(row._id.programId));
      return slug ? [[`${slug}::${row._id.batch}`, row.n] as const] : [];
    }),
  );

  return docs.map((doc) => {
    const enrolled = taken.get(`${doc.programSlug}::${doc.name}`) ?? 0;
    return {
      id: String(doc._id),
      programSlug: doc.programSlug,
      name: doc.name,
      capacity: doc.capacity,
      enrolled,
      seatsLeft: seatsLeft(doc.capacity, enrolled),
      isFull: enrolled >= doc.capacity,
      status: doc.status as BatchStatus,
      startsOn: doc.startsOn ? doc.startsOn.toISOString() : null,
      endsOn: doc.endsOn ? doc.endsOn.toISOString() : null,
    };
  });
}

async function countActive(programSlug: string, name: string): Promise<number> {
  const program = await Program.findOne({ slug: programSlug })
    .select("_id")
    .lean();
  if (!program) return 0;

  return Enrollment.countDocuments({
    programId: program._id,
    batch: name,
    status: "active",
  });
}
