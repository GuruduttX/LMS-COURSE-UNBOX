"use client";

/**
 * A module's study material, managed where it lives.
 *
 * Attaching the handout used to be a field on the module form, and changing or
 * removing it afterwards meant knowing that "Edit details" was where it hid —
 * so in practice nobody did either. It sits here instead, beside the topics and
 * the module test, with the three things you can do to a file all on it: add
 * one, replace or rename the one that is there, and take it down.
 *
 * Three separate forms rather than one, the same arrangement as `NodeActions`:
 * a removal is a decision that gets a confirm, and it must not be reachable by
 * emptying a picker and pressing Save. See `saveModuleMaterial` for why this is
 * the only writer of the field.
 *
 * Renders for a read-only viewer too (a manager sees the file, and none of the
 * controls), so the staff panel has one component that shows study material.
 */
import { BookOpen, Pencil, Plus, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { AttachmentLink } from "@/components/ui/AttachmentLink";
import { Button } from "@/components/ui/Button";
import { useConfirmSubmit } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, TextInput } from "@/components/ui/Field";
import { FileUpload } from "@/components/ui/FileUpload";
import {
  removeModuleMaterial,
  saveModuleMaterial,
} from "@/lib/actions/curriculum";
import {
  EMPTY_ACTION_STATE,
  EMPTY_MATERIAL_STATE,
  type MaterialFormState,
} from "@/lib/actions/curriculum-state";
import {
  MATERIAL_KINDS,
  MATERIAL_MAX_BYTES,
  type UploadedFile,
} from "@/lib/uploads/kinds";

import { TreeSection } from "./TreeRow";

/** What every one of these forms has to post to reach the right module. */
type MaterialRef = {
  area: "admin" | "teacher";
  programSlug: string;
  moduleKey: string;
};

export function ModuleMaterial({
  material,
  materialTitle,
  authoring,
}: {
  material: UploadedFile | null;
  /** What students see in the outline. Empty exactly when there is no file. */
  materialTitle: string;
  /** Omitted for a read-only viewer, who gets the file and no controls. */
  authoring?: MaterialRef;
}) {
  const [editing, setEditing] = useState(false);

  if (!authoring) {
    if (!material) return null;

    return (
      <TreeSection title="Study material">
        <AttachmentLink
          file={material}
          caption={materialTitle || "Untitled"}
        />
      </TreeSection>
    );
  }

  return (
    <TreeSection
      title="Study material"
      description="The handout students read inside the lesson screen. Optional — a module can be all video."
      action={
        material && !editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditing(true)}
            >
              <Pencil size={14} aria-hidden />
              Replace or rename
            </Button>
            <RemoveButton reference={authoring} title={materialTitle} />
          </div>
        ) : null
      }
    >
      {material && !editing ? (
        // The staff view is the one place the filename still shows: a teacher
        // replacing the file needs to know which one is up there.
        <AttachmentLink file={material} caption={materialTitle || "Untitled"} />
      ) : null}

      {!material && !editing ? (
        <EmptyState
          icon={BookOpen}
          title="No study material"
          description="A PDF or a Word document the whole module works from. Anything belonging to one lesson goes on that subtopic instead."
          action={
            <Button type="button" onClick={() => setEditing(true)}>
              <Plus size={16} aria-hidden />
              Add study material
            </Button>
          }
        />
      ) : null}

      {editing ? (
        <MaterialForm
          // Fresh state whenever the file on the record changes, so re-opening
          // this never starts from the last save's answer.
          key={material?.publicId ?? "empty"}
          reference={authoring}
          material={material}
          materialTitle={materialTitle}
          onDone={() => setEditing(false)}
        />
      ) : null}
    </TreeSection>
  );
}

/**
 * Upload a handout, swap the file, or change the name students see.
 *
 * One form for all three because they are one decision — "this is the module's
 * material, and this is what it is called". The picker starts holding the file
 * already on the record, so renaming does not mean uploading it again.
 */
function MaterialForm({
  reference,
  material,
  materialTitle,
  onDone,
}: {
  reference: MaterialRef;
  material: UploadedFile | null;
  materialTitle: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<MaterialFormState, FormData>(
    saveModuleMaterial,
    {
      ...EMPTY_MATERIAL_STATE,
      values: { materialTitle },
      material,
    },
  );

  const [title, setTitle] = useState(materialTitle);

  /**
   * Close once the save lands: the page behind this has been revalidated, so
   * the card underneath is already the new file and there is nothing left to
   * look at. In an effect, and through a ref, for the reason `FileUpload`
   * notifies its parent that way — telling a parent to change state during
   * render is a setState in render, and the callback is a fresh arrow on every
   * one of this component's renders.
   */
  const close = useRef(onDone);
  useEffect(() => {
    close.current = onDone;
  });
  useEffect(() => {
    if (state.ok) close.current();
  }, [state.ok]);

  return (
    <form
      action={action}
      className="space-y-4 rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <Context reference={reference} />

      <FileUpload
        name="material"
        scope="curriculum"
        accept={MATERIAL_KINDS}
        maxBytes={MATERIAL_MAX_BYTES}
        label="File"
        hint="A PDF or a Word document. Export a slide deck as a PDF: PowerPoint files can't be shown in the browser, so they aren't accepted."
        error={state.errors.material}
        defaultValue={material ? [material] : []}
        disabled={pending}
      />

      <Field
        id="materialTitle"
        label="Study material title"
        error={state.errors.materialTitle}
        required
        hint="What students see in the outline. They never see the filename."
      >
        <TextInput
          id="materialTitle"
          name="materialTitle"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Bidding strategies — handout"
          hasError={Boolean(state.errors.materialTitle)}
        />
      </Field>

      {state.error ? (
        <p role="alert" className="text-sm text-danger-700">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : material ? "Save material" : "Attach material"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onDone}
          disabled={pending}
        >
          <X size={14} aria-hidden />
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Take the material down.
 *
 * The confirm says what goes with it — the file itself, and the link every
 * student has in that module's lesson screen — because "are you sure?" alone is
 * a click-through. There is no archive halfway house for a file: it is either
 * the module's handout or it is gone.
 */
function RemoveButton({
  reference,
  title,
}: {
  reference: MaterialRef;
  title: string;
}) {
  const [state, action, pending] = useActionState(
    removeModuleMaterial,
    EMPTY_ACTION_STATE,
  );

  const { onSubmit, dialog } = useConfirmSubmit({
    title: `Remove the study material${title ? ` “${title}”` : ""}?`,
    message:
      "The file is deleted and students lose the download from this module's lessons. It cannot be undone — upload it again to put it back.",
    confirmLabel: "Remove material",
  });

  return (
    <form action={action} onSubmit={onSubmit} className="flex items-center gap-2">
      {dialog}
      <Context reference={reference} />

      {state.error ? (
        <span role="alert" className="text-sm text-danger-700">
          {state.error}
        </span>
      ) : null}

      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        <Trash2 size={14} aria-hidden />
        {pending ? "Removing…" : "Remove"}
      </Button>
    </form>
  );
}

function Context({ reference }: { reference: MaterialRef }) {
  return (
    <>
      <input type="hidden" name="area" value={reference.area} />
      <input type="hidden" name="programSlug" value={reference.programSlug} />
      <input type="hidden" name="key" value={reference.moduleKey} />
    </>
  );
}
