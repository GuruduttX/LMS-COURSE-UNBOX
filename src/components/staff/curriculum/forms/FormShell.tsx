"use client";

/**
 * The parts every curriculum form has: the banner, the status picker, the key
 * field, and the submit row.
 *
 * Five forms in this feature differ almost entirely in their middle. Sharing
 * the frame keeps "what does Save look like" and "how is a draft explained" as
 * one answer rather than five that drift.
 */
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useId, useState } from "react";

import { Field, Select, TextInput } from "@/components/ui/Field";
import { NODE_STATUSES, type NodeStatus } from "@/lib/curriculum/rules";
import { slugify } from "@/lib/curriculum/keys";

// The layout primitives live in `ui/` — the people and sessions forms use them
// too — and are re-exported so a curriculum form still has one import.
export {
  ContextCard,
  FieldRow,
  FormActions,
  FormLayout,
  FormSection,
  SidebarCard,
} from "@/components/ui/FormLayout";

/** What each state means to a teacher, not to the database. */
const STATUS_LABEL: Record<NodeStatus, string> = {
  draft: "Draft — only staff can see it",
  published: "Published — students can see it",
  archived: "Archived — hidden, but old marks still resolve",
};

export function FormBanner({
  ok,
  error,
  okMessage = "Saved.",
}: {
  ok: boolean;
  error?: string;
  okMessage?: string;
}) {
  if (error) {
    return (
      <p
        role="alert"
        className="flex items-start gap-2 rounded-lg border border-danger-500/30 bg-danger-50 p-3 text-sm font-medium text-danger-700"
      >
        <AlertCircle size={16} aria-hidden className="mt-px shrink-0" />
        {error}
      </p>
    );
  }

  if (!ok) return null;

  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-lg border border-success-500/30 bg-success-50 p-3 text-sm font-medium text-success-700"
    >
      <CheckCircle2 size={16} aria-hidden />
      {okMessage}
    </p>
  );
}

export function StatusField({
  value,
  error,
}: {
  value: string;
  error?: string;
}) {
  const id = useId();
  return (
    <Field
      id={id}
      label="Visibility"
      error={error}
      required
      hint="New content starts as a draft. Publishing is a separate, deliberate act."
    >
      <Select
        id={id}
        name="status"
        defaultValue={value}
        hasError={Boolean(error)}
      >
        {NODE_STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABEL[status]}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/**
 * The key field, with a suggestion.
 *
 * On create it fills itself in from the parent's key and stays editable; on
 * edit it is read-only and says why. Changing a key after the fact would break
 * every link and every `courseIds` entry pointing at the node, so the form does
 * not offer the option rather than offering it and refusing.
 */
export function KeyField({
  mode,
  value,
  suggestion,
  error,
}: {
  mode: "create" | "edit";
  value: string;
  suggestion: string;
  error?: string;
}) {
  const id = useId();
  const [key, setKey] = useState(value || suggestion);

  if (mode === "edit") {
    return (
      <Field
        id={id}
        label="Key"
        required
        hint="Fixed after creation — links, teacher assignments and student progress all point at it."
      >
        <TextInput id={id} value={value} readOnly disabled />
        <input type="hidden" name="key" value={value} />
      </Field>
    );
  }

  return (
    <Field
      id={id}
      label="Key"
      error={error}
      required
      hint="The permanent identifier in URLs. Suggested from the parent — change it now or never."
    >
      <TextInput
        id={id}
        name="key"
        value={key}
        onChange={(event) => setKey(slugify(event.target.value))}
        placeholder={suggestion}
        hasError={Boolean(error)}
      />
    </Field>
  );
}

/** The hidden fields every action reads to rebuild its context. */
export function FormContext({
  area,
  programSlug,
  mode,
  originalKey,
  courseKey,
  moduleKey,
  topicKey,
}: {
  area: "admin" | "teacher";
  programSlug: string;
  mode: "create" | "edit";
  originalKey?: string;
  courseKey?: string;
  moduleKey?: string;
  topicKey?: string;
}) {
  return (
    <>
      <input type="hidden" name="area" value={area} />
      <input type="hidden" name="programSlug" value={programSlug} />
      <input type="hidden" name="mode" value={mode} />
      {originalKey ? (
        <input type="hidden" name="originalKey" value={originalKey} />
      ) : null}
      {courseKey ? (
        <input type="hidden" name="courseKey" value={courseKey} />
      ) : null}
      {moduleKey ? (
        <input type="hidden" name="moduleKey" value={moduleKey} />
      ) : null}
      {topicKey ? (
        <input type="hidden" name="topicKey" value={topicKey} />
      ) : null}
    </>
  );
}

/** The white panel a short, single-purpose form sits in. */
export function FormCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      {children}
    </div>
  );
}
