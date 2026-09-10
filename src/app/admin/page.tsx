import { Inbox, ShieldCheck, UserCog, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeading, StatTile } from "@/components/staff/StatTile";
import { requireRole } from "@/lib/auth/guards";
import { ROLE_LABEL, ROLES, type Role } from "@/lib/auth/roles";
import { connectToDatabase } from "@/lib/db";
import { Enquiry } from "@/models/Enquiry";
import { User } from "@/models/User";

/**
 * What an admin opens the app to see. Every number here is a live count — see
 * the note in StatTile about why nothing is seeded.
 *
 * Metrics that need models we haven't built yet (sessions this week, enrolments
 * this month) are absent rather than faked; they arrive with their models.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminOverviewPage() {
  const user = await requireRole("admin");

  await connectToDatabase();
  const [byRole, suspended, newEnquiries, totalEnquiries, recent] =
    await Promise.all([
      User.aggregate<{ _id: Role; count: number }>([
        { $match: { status: "active" } },
        { $group: { _id: "$role", count: { $sum: 1 } } },
      ]),
      User.countDocuments({ status: "suspended" }),
      Enquiry.countDocuments({ status: "new" }),
      Enquiry.countDocuments({}),
      User.find({})
        .select("name email role status createdAt")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

  const count = (role: Role) =>
    byRole.find((row) => row._id === role)?.count ?? 0;

  const staff = count("admin") + count("program_manager") + count("teacher");

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeading
        title={`Hi ${user.name.split(" ")[0]}`}
        description="Everything across the institution."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Staff"
          value={staff}
          hint={`${count("admin")} admin · ${count("program_manager")} manager · ${count("teacher")} teacher`}
          icon={UserCog}
          href="/admin/people"
        />
        <StatTile
          label="Students"
          value={count("student")}
          hint="Active accounts"
          icon={UsersRound}
          href="/admin/people?role=student"
        />
        <StatTile
          label="Suspended"
          value={suspended}
          hint="Cannot sign in"
          icon={ShieldCheck}
          href="/admin/people?status=suspended"
        />
        <StatTile
          label="New enquiries"
          value={newEnquiries}
          hint={`${totalEnquiries} in total`}
          icon={Inbox}
        />
      </div>

      <section className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <h2 className="text-base font-bold text-ink-900">Recently added</h2>
          <Link
            href="/admin/people"
            className="text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            View all people
          </Link>
        </div>

        <ul className="divide-y divide-border">
          {recent.map((person) => (
            <li
              key={String(person._id)}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">
                  {person.name}
                </p>
                <p className="truncate text-xs text-ink-500">{person.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-semibold text-ink-600">
                  {ROLE_LABEL[person.role as Role]}
                </span>
                {person.status === "suspended" ? (
                  <span className="rounded-full border border-danger-500/30 bg-danger-50 px-2 py-0.5 text-2xs font-bold text-danger-700">
                    Suspended
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* A quiet reminder of what the roles mean, for the person who assigns them. */}
      <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="text-base font-bold text-ink-900">Who does what</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ROLES.map((role) => (
            <div key={role} className="rounded-lg bg-surface-muted p-3">
              <dt className="text-sm font-semibold text-ink-900">
                {ROLE_LABEL[role]}
              </dt>
              <dd className="mt-1 text-xs text-ink-600">
                {ROLE_SUMMARY[role]}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

const ROLE_SUMMARY: Record<Role, string> = {
  admin: "Everything, everywhere — including appointing the other three.",
  program_manager:
    "Their programs: schedules sessions, assigns teachers, marks attendance, manages enrolments.",
  teacher: "Their courses: authors curriculum, grades submissions.",
  student: "Their own learning only.",
};
