import "server-only";

import { requireUser } from "@/lib/auth/guards";
import { initialsOf } from "@/lib/auth/initials";

/**
 * The signed-in student, as the student screens need them.
 *
 * Its own module rather than a function in data/dashboard.ts, and `server-only`
 * on purpose: data/dashboard.ts is reachable from a client component (the
 * attendance dialog imports types from data/sessions.ts, which imports the
 * enrolments here), and one server-only import anywhere in that chain breaks
 * the browser bundle. Data modules stay pure; anything that reads the request
 * lives here.
 *
 * This replaced the hard-coded `STUDENT` constant when auth landed. Only the
 * person is real so far — enrolments are still static.
 */
export type Student = {
  id: string;
  /** Their full name — the header avatar derives initials from it. */
  name: string;
  firstName: string;
  initials: string;
  avatarUrl: string | null;
};

/** Redirects to /login when nobody is signed in, so callers can assume a value. */
export async function getStudent(): Promise<Student> {
  const user = await requireUser();

  return {
    id: user.id,
    name: user.name,
    firstName: user.name.split(" ")[0] || user.name,
    initials: initialsOf(user.name),
    avatarUrl: user.avatarUrl,
  };
}

