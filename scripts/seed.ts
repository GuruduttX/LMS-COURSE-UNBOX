/**
 * Seed the database with the accounts needed to use the app.
 *
 *   npm run seed
 *
 * Idempotent: run it as often as you like. Existing users are left alone —
 * it never overwrites a password someone has already changed.
 *
 * Creates the first admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD, plus one
 * account per role for local work, assigned to the two programs that have
 * curriculum seeds (performance-marketing, ai-marketing).
 */
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import { User } from "../src/models/User";
import type { Role } from "../src/lib/auth/roles";

type Seed = {
  name: string;
  email: string;
  password: string;
  role: Role;
  assignments?: {
    programSlug: string;
    courseIds: string[];
    /** Cohorts of that program. Empty means every batch — see models/User.ts. */
    batches: string[];
  }[];
  mustChangePassword?: boolean;
};

const DEV_PASSWORD = "Password123";

function seeds(): Seed[] {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error(
      "Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env.local before seeding.",
    );
  }

  return [
    {
      name: "Course Unbox Admin",
      email: adminEmail,
      password: adminPassword,
      role: "admin",
      // The seeded password is in a file on someone's laptop. Change it once in.
      mustChangePassword: true,
    },
    {
      name: "Priya Nair",
      email: "priya.manager@courseunbox.com",
      password: DEV_PASSWORD,
      role: "program_manager",
      // A manager holds programs, never batches: every cohort of a program
      // they run is theirs, because batches are theirs to create.
      assignments: [
        { programSlug: "performance-marketing", courseIds: [], batches: [] },
        { programSlug: "ai-marketing", courseIds: [], batches: [] },
      ],
    },
    // Three teachers, not one: a program is taught by a team, and with a single
    // teacher account the "add a teacher" picker has nobody left to offer, which
    // makes a program look as though it can only ever hold one.
    //
    // Rohit and Sneha share a program with **different scopes**, because both
    // shapes have to exist for anyone to see how the feature behaves: Rohit
    // holds one named cohort, Sneha holds the whole program. Seed only one of
    // them and the first time anybody meets the other is the first time it is
    // wrong.
    {
      name: "Rohit Sharma",
      email: "rohit.teacher@courseunbox.com",
      password: DEV_PASSWORD,
      role: "teacher",
      // The label the seeded enrolments already carry (data/dashboard.ts), so
      // he can actually see the seeded student. `npm run seed:batches` turns
      // that label into the `Batch` row the staffing screens read.
      assignments: [
        {
          programSlug: "performance-marketing",
          courseIds: [],
          batches: ["Aug 2026 · Evening batch"],
        },
      ],
    },
    {
      name: "Sneha Iyer",
      email: "sneha.teacher@courseunbox.com",
      password: DEV_PASSWORD,
      role: "teacher",
      // No batches = every cohort of the program. The grandfathered shape, and
      // still the right one for a lead teacher who takes all of them.
      assignments: [
        { programSlug: "performance-marketing", courseIds: [], batches: [] },
      ],
    },
    {
      name: "Vikram Desai",
      email: "vikram.teacher@courseunbox.com",
      password: DEV_PASSWORD,
      role: "teacher",
      // Unassigned on purpose, so the picker always has someone to offer.
      assignments: [],
    },
    {
      name: "Atul Mishra",
      email: "atul.student@courseunbox.com",
      password: DEV_PASSWORD,
      role: "student",
      // A student is enrolled, not assigned; this list is ignored for them and
      // survives only because the seed shape is shared.
      assignments: [],
    },
  ];
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;

  if (!uri || !dbName) {
    throw new Error("MONGODB_URI and MONGODB_DB must be set in .env.local.");
  }

  await mongoose.connect(uri, { dbName });
  console.log(`Connected to ${dbName}.`);

  for (const seed of seeds()) {
    const email = seed.email.trim().toLowerCase();
    const existing = await User.findOne({ email }).select("_id role").lean();

    if (existing) {
      console.log(`  = ${email} (${existing.role}) — already exists, skipped`);
      continue;
    }

    await User.create({
      name: seed.name,
      email,
      passwordHash: await bcrypt.hash(seed.password, 12),
      role: seed.role,
      status: "active",
      assignments: seed.assignments ?? [],
      mustChangePassword: seed.mustChangePassword ?? false,
    });

    console.log(`  + ${email} (${seed.role})`);
  }

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
