/**
 * Turn the batch labels already sitting on enrolments into real `Batch` rows.
 *
 *   npm run seed:batches            # dry run — prints what it would create
 *   npm run seed:batches -- --write # actually creates them
 *
 * Before batches were a collection, `Enrollment.batch` was free text and staff
 * typed it. Those cohorts exist — students are in them — they just have no row,
 * which means nobody can see how full they are and the enrol dropdown won't
 * offer them. This creates one `Batch` per distinct label in use.
 *
 * Idempotent: a label that already has a row is left exactly as it is, capacity
 * included, so running it after somebody has resized a batch by hand does not
 * reset their number.
 *
 * **Capacity is a guess and says so.** There is no historical seat count to
 * recover, so each backfilled batch gets room for what is in it plus a little —
 * never less than its current occupancy, which would show every migrated cohort
 * as over capacity on day one. Staff are expected to correct these on the
 * batches screen; the printed summary is the list to go and check.
 *
 * Creates nothing else, and touches no existing row in any collection.
 */
import mongoose from "mongoose";

import { Batch } from "../src/models/Batch";
import { Enrollment } from "../src/models/Enrollment";
import { Program } from "../src/models/Program";

/** Round up to the next 5 seats above what is already in the cohort. */
function guessCapacity(enrolled: number): number {
  return Math.max(5, Math.ceil((enrolled + 2) / 5) * 5);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;
  if (!uri || !dbName) throw new Error("MONGODB_URI and MONGODB_DB are required.");

  const write = process.argv.includes("--write");

  await mongoose.connect(uri, { dbName });

  const programs = await Program.find().select("_id slug title").lean();
  const slugOf = new Map(programs.map((row) => [String(row._id), row.slug]));

  const used = await Enrollment.aggregate<{
    _id: { programId: unknown; batch: string };
    n: number;
  }>([
    { $match: { status: "active", batch: { $nin: ["", null] } } },
    {
      $group: {
        _id: { programId: "$programId", batch: "$batch" },
        n: { $sum: 1 },
      },
    },
    { $sort: { n: -1 } },
  ]);

  if (used.length === 0) {
    console.log("No batch labels in use. Nothing to backfill.");
    await mongoose.disconnect();
    return;
  }

  let created = 0;
  let existing = 0;

  for (const row of used) {
    const programSlug = slugOf.get(String(row._id.programId));
    // An enrolment pointing at a program that is gone is a broken row, not a
    // cohort. Skipped rather than given a batch nothing can reach.
    if (!programSlug) continue;

    const name = row._id.batch;
    const already = await Batch.findOne({ programSlug, name }).select("_id").lean();

    if (already) {
      existing += 1;
      console.log(`  = ${programSlug} · ${name} (already a batch)`);
      continue;
    }

    const capacity = guessCapacity(row.n);
    created += 1;
    console.log(
      `  ${write ? "+" : "would create"} ${programSlug} · ${name} — ${row.n} enrolled, capacity ${capacity}`,
    );

    if (write) {
      await Batch.create({
        programSlug,
        name,
        capacity,
        startsOn: null,
        status: "open",
        createdBy: null,
      });
    }
  }

  console.log(
    write
      ? `\nCreated ${created} batch${created === 1 ? "" : "es"}; ${existing} already existed.`
      : `\nDry run. ${created} would be created; ${existing} already exist.\nRe-run with -- --write to apply, then check the capacities on /manager/batches.`,
  );

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
