"use client";

import { CheckCircle2 } from "lucide-react";
import { useActionState, useState } from "react";

import {
  EMPTY_PERSON_FORM,
  type PersonFormState,
} from "@/app/admin/people/state";
import { Field, Select, TextInput } from "@/components/ui/Field";
import {
  FieldRow,
  FormActions,
  FormLayout,
  FormSection,
  SidebarCard,
} from "@/components/ui/FormLayout";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/auth/roles";
import { assignmentKindFor } from "@/lib/validation/user";

export type ProgramOption = {
  slug: string;
  title: string;
  courses: { id: string; title: string }[];
  /** The program's cohorts — what a teacher is actually assigned to. */
  batches: string[];
};

/**
 * Create or edit a person. One form for both, because the fields are the same
 * and two copies would drift; `mode` decides the password field and the button.
 *
 * The assignment section follows the role picker: a program manager is assigned
 * whole programs, a teacher is assigned courses within them, and an admin or
 * student is assigned nothing. Showing all three at once and letting the server
 * discard two-thirds would invite an admin to fill in fields that silently do
 * nothing.
 */
export function PersonForm({
  mode,
  action,
  programs,
  initial,
  cancelHref = "/admin/people",
}: {
  mode: "create" | "edit";
  /** Where Cancel goes. The people list, unless a caller says otherwise. */
  cancelHref?: string;
  action: (
    state: PersonFormState,
    formData: FormData,
  ) => Promise<PersonFormState>;
  programs: ProgramOption[];
  initial?: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: Role;
    assignments: {
      programSlug: string;
      courseIds: string[];
      batches: string[];
    }[];
  };
}) {
  const [state, formAction, isPending] = useActionState<
    PersonFormState,
    FormData
  >(action, {
    ...EMPTY_PERSON_FORM,
    values: initial ? { ...initial, password: "" } : EMPTY_PERSON_FORM.values,
  });

  const [role, setRole] = useState<string>(initial?.role ?? "");
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>(
    initial?.assignments.map((item) => item.programSlug) ?? [],
  );

  const kind = role ? assignmentKindFor(role as Role) : "none";
  const values = state.values;

  const toggleProgram = (slug: string) =>
    setSelectedPrograms((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : [...current, slug],
    );

  return (
    <FormLayout
      action={formAction}
      aside={
        <>
          <SidebarCard title="What this role can do">
            <p className="text-sm leading-relaxed text-ink-600">
              {role
                ? ROLE_BLURB[role as Role]
                : "Pick a role to see what it opens up."}
            </p>
          </SidebarCard>
          <FormActions
            pending={isPending}
            cancelHref={cancelHref}
            submitLabel={mode === "create" ? "Create account" : "Save changes"}
            note={
              mode === "create"
                ? "They can sign in straight away with the password you set."
                : "Their existing password is unchanged."
            }
          />
        </>
      }
    >
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      {state.ok ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-success-500/30 bg-success-50 p-3 text-sm font-medium text-success-700"
        >
          <CheckCircle2 size={16} aria-hidden />
          Saved.
        </p>
      ) : null}

      <FormSection
        title="Who they are"
        description="Their name as it appears to everyone else, and the email they sign in with."
      >
        <FieldRow>
          <Field id="name" label="Full name" error={state.errors.name} required>
            <TextInput
              id="name"
              name="name"
              defaultValue={values.name}
              hasError={Boolean(state.errors.name)}
              autoComplete="off"
            />
          </Field>

          <Field id="email" label="Email" error={state.errors.email} required>
            <TextInput
              id="email"
              name="email"
              type="email"
              defaultValue={values.email}
              hasError={Boolean(state.errors.email)}
              autoComplete="off"
            />
          </Field>

          <Field id="phone" label="Mobile" error={state.errors.phone}>
            <TextInput
              id="phone"
              name="phone"
              inputMode="tel"
              defaultValue={values.phone}
              hasError={Boolean(state.errors.phone)}
              autoComplete="off"
            />
          </Field>
        </FieldRow>
      </FormSection>

      <FormSection
        title="Access"
        description="What they can reach, and how they get in the first time."
      >
        <FieldRow>
          <Field id="role" label="Role" error={state.errors.role} required>
            <Select
              id="role"
              name="role"
              value={role}
              hasError={Boolean(state.errors.role)}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="">Choose a role</option>
              {ROLES.map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>

          {mode === "create" ? (
            <Field
              id="password"
              label="Temporary password"
              error={state.errors.password}
              hint="They must change it the first time they sign in. Send it to them yourself — the app doesn't email it."
              required
            >
              <TextInput
                id="password"
                name="password"
                type="text"
                hasError={Boolean(state.errors.password)}
                autoComplete="off"
              />
            </Field>
          ) : null}
        </FieldRow>
      </FormSection>

      {kind !== "none" ? (
        <FormSection
          title={kind === "programs" ? "Programs they run" : "What they teach"}
          description={
            kind === "programs"
              ? "A program manager schedules sessions and manages enrolments for the programs ticked here, and every batch inside them."
              : "Tick a program, then the batches they take. A program with no batches ticked means every batch of it. They can author the whole program's content either way — batches decide whose students they see."
          }
        >
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {programs.map((program) => {
              const on = selectedPrograms.includes(program.slug);
              const batches =
                initial?.assignments.find(
                  (item) => item.programSlug === program.slug,
                )?.batches ?? [];

              return (
                <div
                  key={program.slug}
                  className={`rounded-xl border p-3 transition-colors ${
                    on
                      ? "border-brand-600 bg-brand-50"
                      : "border-border bg-surface hover:border-border-strong"
                  }`}
                >
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-ink-900">
                    <input
                      type="checkbox"
                      name="programs"
                      value={program.slug}
                      checked={on}
                      onChange={() => toggleProgram(program.slug)}
                      className="h-4 w-4 shrink-0 accent-brand-600"
                    />
                    {program.title}
                  </label>

                  {kind === "batches" && on ? (
                    <div className="mt-3 border-t border-brand-600/20 pt-3">
                      {program.batches.length === 0 ? (
                        <p className="text-xs text-ink-600">
                          This program has no batches yet, so they take every
                          cohort it gains.
                        </p>
                      ) : (
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {program.batches.map((batch) => (
                            <label
                              key={batch}
                              className="flex cursor-pointer items-start gap-2 text-xs text-ink-700"
                            >
                              <input
                                type="checkbox"
                                name="batches"
                                value={`${program.slug}:${batch}`}
                                defaultChecked={batches.includes(batch)}
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-brand-600"
                              />
                              {batch}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </FormSection>
      ) : null}
    </FormLayout>
  );
}

/** What picking a role actually grants, in the rail beside the picker. */
const ROLE_BLURB: Record<Role, string> = {
  admin:
    "Everything: people, programs, curriculum, enrolments. Only give this to someone who should be able to delete a course.",
  program_manager:
    "Schedules sessions, enrols and withdraws students, and creates batches — for the programs ticked below.",
  teacher:
    "Authors curriculum and marks work for the courses ticked below, and takes the sessions assigned to them.",
  student: "Sees the programs they are enrolled on, and nothing else.",
};
