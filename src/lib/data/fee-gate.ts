import "server-only";

import { redirect } from "next/navigation";

import { feesHref, getFeeStatus, type FeeStatus } from "./fees";

/**
 * The fee gate — the one function that turns "what does this student owe?" into
 * "and therefore they cannot be here".
 *
 * ## Why it is not in `data/fees.ts`
 *
 * `redirect` comes from `next/navigation`, which drags in React's client
 * context. That makes any module importing it unusable outside a request — and
 * `data/fees.ts` is imported by `data/enrolled.ts`, by scripts, and by anything
 * that wants to *read* a fee position without being in a page.
 *
 * It is the same split `data/student.ts` already describes: data modules stay
 * pure, and anything that reads or ends the request lives in its own file. The
 * reading is one module, the deciding is this one.
 *
 * ## Why it is not in `auth/guards.ts` either
 *
 * That module is the authorization boundary and deliberately reads only `User`.
 * Pulling three more models through it would make the one file every page in
 * the app depends on depend on everything else.
 */

/**
 * Send an unpaid student to the fee page, or let them through.
 *
 * **A redirect, not `notFound()`** — a deliberate departure from the house rule
 * in `auth/guards.ts`. That rule is right for a program a manager doesn't run,
 * where "you may not see this" still confirms the thing exists. It is wrong
 * here: this student *knows* they are enrolled — an admin told them, and it is
 * on their own dashboard. A 404 would read as a broken site and produce a
 * support ticket instead of a payment. Send them to the thing we want them to
 * do.
 *
 * Returns null for "not enrolled at all", which is not this gate's business:
 * the page's own "no such program or not enrolled" check already answers that,
 * and answers it as a 404.
 */
export async function requireFeesPaid(
  studentId: string,
  programSlug: string,
): Promise<FeeStatus | null> {
  const status = await getFeeStatus(studentId, programSlug);

  if (!status) return null;

  if (!status.isPaid) redirect(feesHref(programSlug));

  return status;
}
