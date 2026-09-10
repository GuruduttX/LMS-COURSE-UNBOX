import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SessionForm } from "@/components/staff/SessionForm";
import { PageHeading } from "@/components/staff/StatTile";
import { requireRole } from "@/lib/auth/guards";
import {
  batchesForPrograms,
  schedulableProgramsFor,
  teachersForPrograms,
} from "@/lib/data/manager-sessions";
import { isGoogleCalendarConfigured } from "@/lib/googleCalendar";

import { createSession } from "../actions";

/** Schedule a session. Only into programs this manager runs. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Schedule session" };

export default async function NewSessionPage() {
  const user = await requireRole("program_manager");

  const programs = await schedulableProgramsFor(user);
  if (programs.length === 0) notFound();

  // Every eligible teacher and every cohort across those programs; the form
  // narrows both lists to the chosen program and batch, and the action
  // re-checks the triple before saving.
  const slugs = programs.map((program) => program.slug);
  const [teachers, batchesByProgram] = await Promise.all([
    teachersForPrograms(slugs),
    batchesForPrograms(slugs),
  ]);

  return (
    <div className="space-y-6">
      <Link
        href="/manager/sessions"
        className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
      >
        <ArrowLeft size={16} aria-hidden />
        Back to sessions
      </Link>

      <PageHeading
        title="Schedule a session"
        description="It appears on every enrolled student's sessions screen as soon as you save."
      />

      <SessionForm
        mode="create"
        action={createSession}
        programs={programs}
        batchesByProgram={batchesByProgram}
        teachers={teachers}
        googleConfigured={isGoogleCalendarConfigured()}
      />
    </div>
  );
}
