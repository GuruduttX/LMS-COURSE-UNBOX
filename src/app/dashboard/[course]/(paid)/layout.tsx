import { getStudent } from "@/lib/data/student";
import { requireFeesPaid } from "@/lib/data/fee-gate";

/**
 * The fee gate for one program's course screens.
 *
 * **A route group, not a plain layout.** `(paid)` does not appear in any URL —
 * `/dashboard/performance-marketing/overview` is still exactly that — it exists
 * so the fee page itself can sit at `/dashboard/[course]/fees`, one level up and
 * outside this layout. A layout directly on `[course]` would gate the fee page
 * too, and redirect it to itself forever.
 *
 * **One gate, not six.** There are seven pages inside this group today and there
 * will be more; checking each one individually means the eighth is the one
 * somebody forgets. Everything that costs money to see goes in here, and the
 * check is unavoidable rather than remembered.
 *
 * It renders nothing of its own. A layout that only guards should not also
 * decide what the page looks like — each page below still owns its own header
 * and container.
 *
 * `/learn/[program]/…` is the other way into the same content and needs the
 * same check; it has its own, in that page.
 */
export default async function PaidCourseLayout({
  params,
  children,
}: LayoutProps<"/dashboard/[course]">) {
  const { course } = await params;
  const student = await getStudent();

  // Redirects to the fee page when there is something to pay. Returns null when
  // the student isn't enrolled at all — not this gate's business, and the page
  // below already answers that with a 404.
  await requireFeesPaid(student.id, course);

  return children;
}
