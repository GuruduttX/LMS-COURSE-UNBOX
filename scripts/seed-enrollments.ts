/**
 * Enrol the seeded students, so the app has real enrolment rows.
 *
 *   npm run seed:enrollments
 *
 * Idempotent: an existing enrolment is left exactly as it is, including its
 * batch and status, so running this after somebody has withdrawn a student does
 * not quietly put them back.
 *
 * What it does: every student account is enrolled on the programs the old
 * static `ENROLLMENTS` array named — which is precisely what the app used to
 * pretend was true for everyone. This is a migration of that fiction into rows,
 * not an invention: after it runs, the staff roster and the student's dashboard
 * agree, and both say what the dashboard alone used to say.
 *
 * `-- --program <slug>` enrols everyone on one program instead.
 */
import mongoose from "mongoose";

import { ENROLLMENTS } from "../src/lib/data/dashboard";
import { Enrollment } from "../src/models/Enrollment";
import { Program } from "../src/models/Program";
import { User } from "../src/models/User";

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;
  if (!uri || !dbName) throw new Error("MONGODB_URI and MONGODB_DB are required.");

  await mongoose.connect(uri, { dbName });

  const flag = process.argv.indexOf("--program");
  const only = flag > -1 ? process.argv[flag + 1] : null;

  const slugs = only ? [only] : ENROLLMENTS.map((row) => row.slug);
  const batches = new Map(ENROLLMENTS.map((row) => [row.slug, row.batch]));

  const students = await User.find({ role: "student" }).select("_id name").lean();
  if (students.length === 0) {
    console.log("No student accounts. Run `npm run seed` first.");
    await mongoose.disconnect();
    return;
  }

  let created = 0;
  let kept = 0;

  for (const slug of slugs) {
    const program = await Program.findOne({ slug }).select("_id title").lean();
    if (!program) {
      console.log(`  ! no program "${slug}" — skipped`);
      continue;
    }

    for (const student of students) {
      const existing = await Enrollment.findOne({
        programId: program._id,
        studentId: student._id,
      })
        .select("_id")
        .lean();

      if (existing) {
        kept += 1;
        continue;
      }

      await Enrollment.create({
        programId: program._id,
        studentId: student._id,
        status: "active",
        batch: batches.get(slug) ?? "",
        enrolledAt: new Date(),
      });
      created += 1;
    }

    console.log(`  ${program.title}: ${students.length} students`);
  }

  console.log(`\n${created} enrolment(s) created, ${kept} left alone.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
