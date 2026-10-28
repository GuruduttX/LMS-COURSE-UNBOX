import "server-only";

import { connectToDatabase } from "@/lib/db";
import { Program } from "@/models/Program";

/**
 * Program identity — slug and title — read from the collection that owns it.
 *
 * This exists because several screens used to answer "what is this program
 * called?" out of a hand-written `COURSES` array in `data/home.ts`. That array
 * only ever held the four launch programs, so a lookup against it answered "no
 * such program" for real rows — which, where the answer gated a query rather
 * than merely labelling it, turned into a 404 on a page whose data was sitting
 * in the database the whole time.
 *
 * That array is gone; the public pages read `data/public-programs.ts`, which
 * also comes from this collection. **This module is the cheap answer to "who
 * exists"** — slug and title, nothing else — for the staff screens that only
 * need to label a row. Anything that needs the pitch, the cover or the counts
 * wants `public-programs.ts` instead.
 */

export type ProgramIdentity = { slug: string; title: string };

/** Every program, ordered by title. */
export async function listPrograms(): Promise<ProgramIdentity[]> {
  await connectToDatabase();

  const rows = await Program.find({})
    .select("slug title")
    .sort({ title: 1 })
    .lean();

  return rows.map((row) => ({ slug: row.slug, title: row.title }));
}

/**
 * Titles by slug, for a listing that has to label rows it already loaded.
 *
 * One query for the whole page rather than one per row — the same reason
 * `data/students.ts` assembles its roster from a handful of flat reads.
 */
export async function programTitles(
  slugs: readonly string[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(slugs)].filter(Boolean);
  if (wanted.length === 0) return new Map();

  await connectToDatabase();

  const rows = await Program.find({ slug: { $in: wanted } })
    .select("slug title")
    .lean();

  return new Map(rows.map((row) => [row.slug, row.title]));
}

/**
 * The programs this user may act on, as identities.
 *
 * An admin runs every program; everyone else holds the ones named in their
 * assignments. The filter is against what actually exists, so an assignment
 * left pointing at a deleted program quietly drops out rather than rendering a
 * row nothing can open.
 */
export async function programsFor(user: {
  role: string;
  assignments: { programSlug: string }[];
}): Promise<ProgramIdentity[]> {
  const all = await listPrograms();
  if (user.role === "admin") return all;

  return all.filter((program) =>
    user.assignments.some((item) => item.programSlug === program.slug),
  );
}
