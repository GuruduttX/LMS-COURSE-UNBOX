"use client";

/**
 * How a program is pitched to somebody who has not enrolled.
 *
 * A screen of its own rather than a section of `ProgramForm`, for two reasons.
 * The cover decides it: `saveModuleMaterial` records the bug this repo already
 * hit once — a file picker inside a multi-purpose form re-posted a file from a
 * tab left open, resurrecting a record pointing at bytes that were gone. One
 * editing surface per thing is the fix, and it is the same rule the module's
 * study material follows. And `ProgramForm` is about *identity* — the immutable
 * slug, the status, the deadline — where a tagline sitting beside the slug would
 * make the two look equally consequential.
 *
 * **Nothing here is required.** The public page renders the sections that have
 * content and omits the rest, so a tagline written today and offers written next
 * week is a working state rather than a half-saved one.
 */
import { useActionState } from "react";

import { saveProgramDetails } from "@/lib/actions/curriculum";
import {
  EMPTY_PROGRAM_DETAILS_STATE,
  type ProgramDetailsFormState,
} from "@/lib/actions/curriculum-state";
import { Field, Select, TextInput, Textarea } from "@/components/ui/Field";
import { FileUpload } from "@/components/ui/FileUpload";
import { StringListField } from "@/components/ui/StringListField";
import {
  MAX_HIGHLIGHTS,
  MAX_OFFERS,
  MAX_TOOLS,
  PROGRAM_LEVELS,
} from "@/lib/curriculum/rules";

import {
  ContextCard,
  FieldRow,
  FormActions,
  FormBanner,
  FormLayout,
  FormSection,
} from "./FormShell";

const LEVEL_LABEL: Record<string, string> = {
  beginner: "Beginner — no experience assumed",
  intermediate: "Intermediate — some experience assumed",
  advanced: "Advanced — for people already working in it",
};

export function ProgramDetailsForm({
  programSlug,
  initial,
  cancelHref,
  context = [],
}: {
  programSlug: string;
  /** What is saved today. The seed state when nobody has filled it in. */
  initial?: ProgramDetailsFormState;
  cancelHref: string;
  context?: { label: string; value: string }[];
}) {
  const [state, action, pending] = useActionState<
    ProgramDetailsFormState,
    FormData
  >(saveProgramDetails, initial ?? EMPTY_PROGRAM_DETAILS_STATE);

  const values = state.values;

  return (
    <FormLayout
      action={action}
      aside={
        <>
          {context.length > 0 ? <ContextCard items={context} /> : null}
          <FormActions
            pending={pending}
            cancelHref={cancelHref}
            submitLabel="Save details"
            // Publishing stays on the program screen: one writer for the status,
            // so a save here can never take a live program off the site.
            note="This is what visitors see. Whether the program appears at all is its published status, set on the program screen."
          />
        </>
      }
    >
      {/* The action re-derives the program from this and re-checks the scope. */}
      <input type="hidden" name="programSlug" value={programSlug} />

      <FormBanner ok={state.ok} error={state.error} />

      <FormSection
        title="How it is introduced"
        description="The line under the title, and the prose on the program's own page."
      >
        <Field
          id="tagline"
          label="Tagline"
          error={state.errors.tagline}
          hint="One line, on the card and under the title. What it does for them, not what it covers."
        >
          <TextInput
            id="tagline"
            name="tagline"
            defaultValue={values.tagline}
            placeholder="Run paid campaigns that pay for themselves"
            hasError={Boolean(state.errors.tagline)}
          />
        </Field>

        <Field
          id="description"
          label="Description"
          error={state.errors.description}
          hint="A few paragraphs, shown on the program's page. Blank lines separate paragraphs."
        >
          <Textarea
            id="description"
            name="description"
            rows={8}
            defaultValue={values.description}
            hasError={Boolean(state.errors.description)}
          />
        </Field>

        <FieldRow>
          <Field
            id="level"
            label="Level"
            error={state.errors.level}
            hint="Leave unstated rather than guessing — the badge is simply absent."
          >
            <Select
              id="level"
              name="level"
              defaultValue={values.level}
              hasError={Boolean(state.errors.level)}
            >
              <option value="">Not stated</option>
              {PROGRAM_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {LEVEL_LABEL[level]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            id="nextBatch"
            label="Next batch"
            error={state.errors.nextBatch}
            hint="Typed by hand, so it says exactly what you mean — and so it is yours to keep current."
          >
            <TextInput
              id="nextBatch"
              name="nextBatch"
              defaultValue={values.nextBatch}
              placeholder="Next batch starts 8 Sep"
              hasError={Boolean(state.errors.nextBatch)}
            />
          </Field>
        </FieldRow>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-border-strong">
          <input
            type="checkbox"
            name="newBadge"
            defaultChecked={values.newBadge === "on"}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
          />
          <span className="text-sm">
            <span className="font-medium text-ink-900">
              Show a “New” ribbon on the card
            </span>
            <span className="mt-0.5 block text-xs text-ink-500">
              Yours to turn off — nothing expires it, because how long a program
              counts as new is a judgement, not a date.
            </span>
          </span>
        </label>
      </FormSection>

      <FormSection
        title="Cover image"
        description="The band at the top of the card and the program's page."
      >
        <FileUpload
          name="cover"
          scope="programs"
          accept={["image"]}
          required={false}
          label="Cover"
          // No `maxBytes`: the `image` kind's own 2 MB ceiling applies, and it is
          // the same number the server re-checks.
          hint="A WebP under 2 MB, 1200×675 or wider. It is served exactly as uploaded — nothing crops or resizes it. Without one, the card falls back to a brand gradient."
          error={state.errors.cover}
          defaultValue={state.cover ? [state.cover] : []}
        />
      </FormSection>

      <FormSection
        title="What they will learn"
        description="The bullets under the description. Outcomes, not module titles — the curriculum below already lists those."
      >
        <StringListField
          name="highlights"
          label="Highlights"
          max={MAX_HIGHLIGHTS}
          error={state.errors.highlights}
          addLabel="Add a highlight"
          placeholder="₹50,000 live ad-spend simulation"
          defaultValue={state.highlights}
          hint={`Up to ${MAX_HIGHLIGHTS}. Shown in the order you write them.`}
        />
      </FormSection>

      <FormSection
        title="What this program offers"
        description="The promises, as opposed to the syllabus."
      >
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-border-strong">
          <input
            type="checkbox"
            name="placementGuarantee"
            defaultChecked={values.placementGuarantee === "on"}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
          />
          <span className="text-sm">
            <span className="font-medium text-ink-900">
              This program carries a placement guarantee
            </span>
            <span className="mt-0.5 block text-xs text-ink-500">
              It gets a card of its own on the public page. Tick it only where
              the guarantee is real and written down — it is the line a visitor
              quotes back, and the one an advertising regulator asks about.
            </span>
          </span>
        </label>

        <StringListField
          name="offers"
          label="Everything else on offer"
          max={MAX_OFFERS}
          error={state.errors.offers}
          addLabel="Add an offer"
          placeholder="1:1 mentorship with a working practitioner"
          defaultValue={state.offers}
          hint={`Up to ${MAX_OFFERS}. Live projects, mentorship, a certificate — whatever comes with the program.`}
        />
      </FormSection>

      <FormSection
        title="Tools they will use"
        description="Named software, shown as chips."
      >
        <StringListField
          name="tools"
          label="Tools"
          max={MAX_TOOLS}
          error={state.errors.tools}
          addLabel="Add a tool"
          placeholder="Google Ads"
          defaultValue={state.tools}
          hint={`Up to ${MAX_TOOLS}. The card shows the first three and counts the rest.`}
        />
      </FormSection>
    </FormLayout>
  );
}
