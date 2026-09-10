import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PersonForm } from "@/components/staff/PersonForm";
import { PageHeading } from "@/components/staff/StatTile";
import { requireRole } from "@/lib/auth/guards";
import { assignablePrograms } from "@/lib/data/people";

import { createPerson } from "../actions";

/**
 * Add a staff member or student.
 *
 * The admin sets a temporary password and passes it on themselves — there is no
 * mail provider yet, and inventing an "invite sent" message for an email that
 * was never sent would be worse than saying so plainly.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Add person" };

export default async function NewPersonPage() {
  await requireRole("admin");

  const programs = await assignablePrograms();

  return (
    <div className="space-y-6">
      <Link
        href="/admin/people"
        className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
      >
        <ArrowLeft size={16} aria-hidden />
        Back to people
      </Link>

      <PageHeading
        title="Add person"
        description="They sign in with this email and the temporary password you set."
      />

      <PersonForm mode="create" action={createPerson} programs={programs} />
    </div>
  );
}
