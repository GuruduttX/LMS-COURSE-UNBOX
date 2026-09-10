/**
 * Wipe this project's data, keeping admin accounts.
 *
 *   npm run reset:data            # dry run — reports, changes nothing
 *   npm run reset:data -- --yes --db=lms_db
 *
 * ## Why the guards look excessive
 *
 * MONGODB_URI points at a cluster that also hosts live client databases. A
 * `deleteMany` aimed at the wrong database is not recoverable from here, so
 * this script refuses to write unless three things agree:
 *
 *   1. the connection's own `db.databaseName`,
 *   2. `MONGODB_DB` from .env.local,
 *   3. the `--db=` name typed on the command line.
 *
 * It never issues a `dropDatabase`, never lists or opens a sibling database,
 * and only ever names collections it read back from this one database.
 *
 * Admins are kept because they are the way back in: delete the last admin and
 * nobody can sign in to rebuild anything. Everything else goes, documents
 * only — the collections and their indexes stay, so the app boots into an
 * empty-but-valid database rather than a missing one.
 */
import mongoose from "mongoose";

/** Kept: users with these roles. Everyone else is deleted. */
const KEEP_ROLES = ["admin"];

type Args = { execute: boolean; db: string | null };

function parseArgs(argv: string[]): Args {
  let execute = false;
  let db: string | null = null;

  for (const arg of argv) {
    if (arg === "--yes") execute = true;
    else if (arg.startsWith("--db=")) db = arg.slice("--db=".length);
    else if (arg === "--dry-run") execute = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return { execute, db };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const uri = process.env.MONGODB_URI;
  const envDb = process.env.MONGODB_DB;

  if (!uri || !envDb) {
    throw new Error("MONGODB_URI and MONGODB_DB must be set in .env.local.");
  }

  // Guard 2 vs 3, before we even connect.
  if (args.execute && args.db !== envDb) {
    throw new Error(
      `Refusing to run: --db=${args.db ?? "(missing)"} does not match ` +
        `MONGODB_DB=${envDb}. Pass --db=${envDb} to confirm the target.`,
    );
  }

  await mongoose.connect(uri, { dbName: envDb });
  const db = mongoose.connection.db!;

  // Guard 1: what the server actually gave us, not what we asked for.
  if (db.databaseName !== envDb) {
    await mongoose.disconnect();
    throw new Error(
      `Refusing to run: connected to "${db.databaseName}" but expected "${envDb}".`,
    );
  }

  const mode = args.execute ? "EXECUTE" : "DRY RUN";
  console.log(`\n[${mode}] database: ${db.databaseName}\n`);

  const names = (await db.listCollections().toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith("system."))
    .sort();

  let totalDeleted = 0;
  let totalKept = 0;

  for (const name of names) {
    const col = db.collection(name);

    if (name === "users") {
      const keepFilter = { role: { $in: KEEP_ROLES } };
      const dropFilter = { role: { $nin: KEEP_ROLES } };
      const keep = await col.countDocuments(keepFilter);
      const drop = await col.countDocuments(dropFilter);

      if (args.execute && drop > 0) {
        const res = await col.deleteMany(dropFilter);
        console.log(`  users${" ".repeat(24)} deleted ${res.deletedCount}, kept ${keep} admin(s)`);
      } else {
        console.log(`  users${" ".repeat(24)} would delete ${drop}, keep ${keep} admin(s)`);
      }

      totalDeleted += drop;
      totalKept += keep;
      continue;
    }

    const count = await col.countDocuments();
    if (count === 0) {
      console.log(`  ${name.padEnd(29)} empty`);
      continue;
    }

    if (args.execute) {
      const res = await col.deleteMany({});
      console.log(`  ${name.padEnd(29)} deleted ${res.deletedCount}`);
    } else {
      console.log(`  ${name.padEnd(29)} would delete ${count}`);
    }

    totalDeleted += count;
  }

  console.log(
    `\n${args.execute ? "Deleted" : "Would delete"} ${totalDeleted} document(s); ` +
      `kept ${totalKept} admin user(s).`,
  );

  if (!args.execute) {
    console.log(`\nNothing was changed. To apply:\n  npm run reset:data -- --yes --db=${envDb}\n`);
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
