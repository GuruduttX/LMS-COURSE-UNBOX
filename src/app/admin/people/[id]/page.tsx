import { ArrowLeft, KeyRound, ShieldOff, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PersonForm } from "@/components/staff/PersonForm";
import { PageHeading } from "@/components/staff/StatTile";
import { Button } from "@/components/ui/Button";
import { ConfirmForm } from "@/components/ui/ConfirmDialog";
import { requireRole } from "@/lib/auth/guards";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { assignablePrograms, getPerson } from "@/lib/data/people";

import { resetPersonPassword, setPersonStatus, updatePerson } from "../actions";

/**
 * One person: their details, their assignments, and the two things an admin
 * does to an account they no longer trust — suspend it, or hand out a new
 * temporary password.
 *
 * Neither of those is a delete. A removed teacher would orphan every session
 * they taught and every mark they gave.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/admin/people/[id]">): Promise<Metadata> {
  const { id } = await params;
  const person = await getPerson(id);
  return { title: person ? person.name : "Person not found" };
}

export default async function PersonPage({
  params,
  searchParams,
}: PageProps<"/admin/people/[id]">) {
  const admin = await requireRole("admin");

  const { id } = await params;
  const query = await searchParams;
  const person = await getPerson(id);

  if (!person) notFound();

  const programs = await assignablePrograms();
  const isSelf = person.id === admin.id;

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
        title={person.name}
        description={`${ROLE_LABEL[person.role]} · ${person.email}`}
      />

      {query.done === "password" ? (
        <p
          role="status"
          className="rounded-lg border border-success-500/30 bg-success-50 p-3 text-sm font-medium text-success-700"
        >
          Password reset. Pass the new one on — they&rsquo;ll be asked to change
          it.
        </p>
      ) : null}

      {person.status === "suspended" ? (
        <p className="rounded-lg border border-danger-500/30 bg-danger-50 p-3 text-sm font-medium text-danger-700">
          This account is suspended. They cannot sign in.
        </p>
      ) : null}

      {person.mustChangePassword ? (
        <p className="rounded-lg border border-border bg-surface-muted p-3 text-sm text-ink-600">
          Still using the temporary password — they&rsquo;ll be asked to set
          their own at the next sign-in.
        </p>
      ) : null}

      <PersonForm
        mode="edit"
        action={updatePerson}
        programs={programs}
        initial={{
          id: person.id,
          name: person.name,
          email: person.email,
          phone: person.phone,
          role: person.role,
          assignments: person.assignments,
        }}
      />

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <header className="border-b border-border bg-surface-muted px-5 py-3.5 sm:px-6">
          <h2 className="text-sm font-bold text-ink-900">
            Suspension and passwords
          </h2>
          <p className="mt-0.5 text-xs text-ink-600">
            Neither is a delete — an account is never removed, so nothing they
            taught or were marked on is orphaned.
          </p>
        </header>

        <div className="p-5 sm:p-6">
          {isSelf ? (
            <p className="text-sm text-ink-600">
              This is your own account. Suspending yourself or changing your own
              role isn&rsquo;t possible — the last admin locking themselves out
              can only be undone in the database.
            </p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <ConfirmForm
                action={setPersonStatus}
                when={person.status === "active"}
                title={`Suspend ${person.name}?`}
                message="They are signed out and can't sign in again until you reactivate them. Their account, history and enrolments are kept."
                confirmLabel="Suspend account"
                className="flex flex-wrap items-center gap-3"
              >
                <input type="hidden" name="id" value={person.id} />
                <input
                  type="hidden"
                  name="suspend"
                  value={person.status === "active" ? "true" : "false"}
                />
                <Button
                  type="submit"
                  variant={person.status === "active" ? "secondary" : "primary"}
                >
                  {person.status === "active" ? (
                    <>
                      <ShieldOff size={15} aria-hidden />
                      Suspend account
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={15} aria-hidden />
                      Reactivate account
                    </>
                  )}
                </Button>
                <p className="text-xs text-ink-500">
                  {person.status === "active"
                    ? "They stay in the system and keep their history; they just can't sign in."
                    : "They'll be able to sign in again with their existing password."}
                </p>
              </ConfirmForm>

              <ConfirmForm
                action={resetPersonPassword}
                title={`Reset ${person.name}'s password?`}
                message="Their current password stops working straight away, and you'll need to pass the new one on to them yourself."
                confirmLabel="Reset password"
                className="flex flex-wrap items-end gap-3"
              >
                <input type="hidden" name="id" value={person.id} />
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-ink-700">
                    New temporary password
                  </span>
                  <input
                    name="password"
                    type="text"
                    minLength={8}
                    required
                    autoComplete="off"
                    className="h-10 w-64 rounded-lg border border-border bg-surface px-3 text-sm text-ink-800"
                  />
                </label>
                <Button type="submit" variant="secondary">
                  <KeyRound size={15} aria-hidden />
                  Reset password
                </Button>
              </ConfirmForm>
              {query.error === "password" ? (
                <p className="text-xs font-medium text-danger-700">
                  Use at least 8 characters.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
