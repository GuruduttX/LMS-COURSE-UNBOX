/**
 * Fill in `actorEmail` and `category` on audit entries written before they
 * existed.
 *
 *   npm run backfill:audit            # dry run — prints what it would change
 *   npm run backfill:audit -- --write # actually applies it
 *
 * The audit log gained two fields when /admin/audit was built: the actor's
 * email, which is what an admin actually searches by, and a category, which is
 * what the filter bar groups on. Rows written before that have neither, so
 * without this they are invisible to both filters — present in the collection
 * and unreachable from the screen.
 *
 * `actorEmail` is recovered by joining `actorId` back to the user. A row whose
 * actor has since been deleted keeps a null email; it still has the name and
 * role that were snapshotted at the time, which is the point of denormalising
 * them. `category` comes from the same ACTIONS table the logger uses, so a
 * backfilled row files exactly where a new one would.
 *
 * Idempotent, and touches only rows that are actually missing a field. It never
 * changes an action, a summary or a timestamp — this is filling blanks, not
 * rewriting history.
 */
import mongoose from "mongoose";

import { ACTIONS } from "../src/lib/auth/audit-actions";
import { AuditLog } from "../src/models/AuditLog";
import { User } from "../src/models/User";

function categoryFor(action: string): string | null {
  return action in ACTIONS
    ? ACTIONS[action as keyof typeof ACTIONS].category
    : null;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;
  if (!uri || !dbName) throw new Error("MONGODB_URI and MONGODB_DB are required.");

  const write = process.argv.includes("--write");
  await mongoose.connect(uri, { dbName });
  console.log(`${write ? "Backfilling" : "Dry run against"} ${dbName}\n`);

  const stale = await AuditLog.find({
    $or: [
      { actorEmail: { $exists: false } },
      { actorEmail: null },
      { category: { $exists: false } },
      { category: null },
    ],
  })
    .select("actorId action category actorEmail")
    .lean();

  if (stale.length === 0) {
    console.log("Nothing to backfill — every entry already has both fields.");
    await mongoose.disconnect();
    return;
  }

  // One query for every actor mentioned, rather than one per row.
  const actorIds = [
    ...new Set(stale.map((row) => row.actorId).filter(Boolean).map(String)),
  ];
  const users = await User.find({ _id: { $in: actorIds } })
    .select("email")
    .lean();
  const emailById = new Map(
    users.map((user) => [String(user._id), user.email as string]),
  );

  let emailed = 0;
  let categorised = 0;
  let unknown = 0;
  const unknownActions = new Set<string>();

  for (const row of stale) {
    const set: Record<string, string> = {};

    if (!row.actorEmail && row.actorId) {
      const email = emailById.get(String(row.actorId));
      if (email) {
        set.actorEmail = email.trim().toLowerCase();
        emailed += 1;
      }
    }

    if (!row.category) {
      const category = categoryFor(row.action);
      if (category) {
        set.category = category;
        categorised += 1;
      } else {
        // An action no longer in the table. Filed as "system" so the row is at
        // least reachable, and printed so it can be looked at.
        set.category = "system";
        categorised += 1;
        unknown += 1;
        unknownActions.add(row.action);
      }
    }

    if (Object.keys(set).length === 0) continue;
    if (write) await AuditLog.updateOne({ _id: row._id }, { $set: set });
  }

  console.log(
    `${stale.length} incomplete entr${stale.length === 1 ? "y" : "ies"}:`,
  );
  console.log(`  ${emailed} ${write ? "given" : "would get"} an actor email`);
  console.log(`  ${categorised} ${write ? "given" : "would get"} a category`);

  if (unknown > 0) {
    console.log(
      `\n${unknown} used an action not in ACTIONS and were filed under "system":`,
    );
    for (const action of [...unknownActions].sort()) console.log(`  ${action}`);
    console.log("Add them to ACTIONS in src/lib/auth/audit.ts to file them properly.");
  }

  console.log(
    write
      ? "\nDone. Check /admin/audit — filtering by role and by email should now reach these."
      : "\nDry run. Re-run with -- --write to apply.",
  );

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
