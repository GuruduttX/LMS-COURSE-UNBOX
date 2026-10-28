import "server-only";
import { revalidatePath } from "next/cache";

/**
 * The public pages a program appears on.
 *
 * Its own module rather than an export of `actions/curriculum.ts`, because that
 * file is `"use server"` and such a module may only export async functions — a
 * plain helper exported from there is a build error, not a style choice. Same
 * reason `actions/curriculum-state.ts` exists.
 *
 * Everything that writes curriculum reaches this through `revalidateProgram`;
 * `actions/fee-plans.ts` calls it directly, because a price is on the card
 * without being part of the tree.
 */
export function revalidatePublic(programSlug: string): void {
  revalidatePath("/");
  revalidatePath(`/courses/${programSlug}`);
}
