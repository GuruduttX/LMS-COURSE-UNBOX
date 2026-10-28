"use client";

import { AlertTriangle } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

/**
 * design.md §5 — Modal is "only for confirms and short focused content".
 * This is the confirm half of that: one shared dialog for every destructive
 * action (delete, remove, withdraw) so the wording, the red button and the
 * keyboard behaviour are the same everywhere, instead of `window.confirm`.
 *
 * Two ways in, both in this file:
 *
 * - `useConfirmSubmit` — for a `<form action={serverAction}>`. It gates the
 *   submit and re-submits once the user confirms.
 * - `useConfirm` — for a plain handler. `await confirm()` resolves to a boolean.
 */
export type ConfirmCopy = {
  /** Short question, e.g. "Delete this task?" */
  title: string;
  /** What actually happens — say plainly if it cannot be undone. */
  message: string;
  /** Verb on the red button. Defaults to "Delete". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` (default) for anything destructive; `neutral` for reversible. */
  tone?: "danger" | "neutral";
  /**
   * For the deletes big enough that a reflex click is the real risk — a program
   * or a course, which take every student's progress with them. Set this to the
   * sentence the person has to tick, and the confirm button stays disabled
   * until they do. Use it sparingly: a tickbox on every dialog is a tickbox
   * nobody reads.
   */
  acknowledge?: string;
};

/**
 * `when: false` submits straight through without asking. It exists for the
 * toggles — suspend/reactivate, cancel/restore — where only one direction is
 * worth a question and the other is the undo.
 */
type Gate = { when?: boolean };

export function ConfirmDialog({
  isOpen,
  onCancel,
  onConfirm,
  pending = false,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  tone = "danger",
  acknowledge,
  details,
  pendingLabel = "Working…",
}: ConfirmCopy & {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** Keeps the dialog open and the button busy while the action runs. */
  pending?: boolean;
  /** Anything a sentence can't carry — a checklist — under the message. */
  details?: React.ReactNode;
  /** What the confirm button says while `pending`. */
  pendingLabel?: string;
}) {
  const titleId = useId();

  return (
    <Modal
      isOpen={isOpen}
      onClose={pending ? () => {} : onCancel}
      labelledBy={titleId}
      className="md:max-w-120"
    >
      {/*
        The tick lives in `Body`, which the Modal mounts and unmounts with the
        dialog. That unmount *is* the reset: re-opening asks again, instead of
        the second delete inheriting the first one's ticked box.
      */}
      <Body
        titleId={titleId}
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        tone={tone}
        acknowledge={acknowledge}
        details={details}
        pendingLabel={pendingLabel}
        pending={pending}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </Modal>
  );
}

function Body({
  titleId,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone,
  acknowledge,
  details,
  pendingLabel,
  pending,
  onCancel,
  onConfirm,
}: Required<Omit<ConfirmCopy, "acknowledge">> & {
  titleId: string;
  acknowledge?: string;
  details?: React.ReactNode;
  pendingLabel: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ackId = useId();
  const [acked, setAcked] = useState(false);
  const blocked = acknowledge !== undefined && !acked;

  return (
    <>
      <div className="flex gap-4 p-6">
        {tone === "danger" ? (
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-50 text-danger-700"
          >
            <AlertTriangle size={20} />
          </span>
        ) : null}

        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold text-ink-900">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-600">
            {message}
          </p>
          {details ? <div className="mt-3">{details}</div> : null}
        </div>
      </div>

      {acknowledge !== undefined ? (
        <label
          htmlFor={ackId}
          className="mx-6 mb-4 flex cursor-pointer items-start gap-3 rounded-lg border border-danger-500/30 bg-danger-50 p-3 text-sm font-medium text-danger-700"
        >
          <input
            id={ackId}
            type="checkbox"
            checked={acked}
            onChange={(event) => setAcked(event.target.checked)}
            disabled={pending}
            className="mt-0.5 h-4 w-4 shrink-0 accent-danger-500"
          />
          <span>{acknowledge}</span>
        </label>
      ) : null}

      <div className="flex flex-col-reverse gap-2 border-t border-border px-6 py-4 md:flex-row md:justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={pending}
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={tone === "danger" ? "danger" : "primary"}
          onClick={onConfirm}
          disabled={pending || blocked}
        >
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </div>
    </>
  );
}

/**
 * The whole form, gated — for the screens that are server components.
 *
 * `useConfirmSubmit` needs a client component to live in; several destructive
 * controls (suspending an account, cancelling a session) are plain `<form
 * action={serverAction}>` on an otherwise server-rendered page. Wrapping the
 * form in this keeps those pages server components: the server action passes
 * straight through as a prop, and only the dialog is client-side.
 *
 *   <ConfirmForm action={setPersonStatus} title="Suspend this account?" message="…">
 *     <input type="hidden" name="id" value={id} />
 *     <Button type="submit">Suspend</Button>
 *   </ConfirmForm>
 */
export function ConfirmForm({
  action,
  className,
  children,
  ...copy
}: ConfirmCopy &
  Gate & {
    action: (formData: FormData) => void | Promise<void>;
    className?: string;
    children: React.ReactNode;
  }) {
  const { onSubmit, dialog } = useConfirmSubmit(copy);

  return (
    <form action={action} onSubmit={onSubmit} className={className}>
      {dialog}
      {children}
    </form>
  );
}

/**
 * Gates a form submit behind the dialog.
 *
 *   const { onSubmit, dialog } = useConfirmSubmit({
 *     title: "Delete this task?",
 *     message: "Every hand-in goes with it. This cannot be undone.",
 *   });
 *
 *   <form action={deleteTask} onSubmit={onSubmit}>…{dialog}</form>
 *
 * The copy is read on every render, so wording that depends on the row (a name,
 * a count) can just be interpolated at the call site.
 */
export function useConfirmSubmit({ when = true, ...copy }: ConfirmCopy & Gate) {
  const [isOpen, setIsOpen] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  // Set for the one submit we let through, so we don't re-open on it.
  const confirmed = useRef(false);

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      if (!when) return;
      if (confirmed.current) {
        confirmed.current = false;
        return;
      }
      event.preventDefault();
      formRef.current = event.currentTarget;
      setIsOpen(true);
    },
    [when],
  );

  const dialog = (
    <ConfirmDialog
      {...copy}
      isOpen={isOpen}
      onCancel={() => setIsOpen(false)}
      onConfirm={() => {
        setIsOpen(false);
        confirmed.current = true;
        formRef.current?.requestSubmit();
      }}
    />
  );

  return { onSubmit, dialog };
}

/**
 * Promise form, for actions that aren't a form submit:
 *
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm({ title: …, message: … }))) return;
 */
export function useConfirm() {
  const [copy, setCopy] = useState<ConfirmCopy | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    setCopy(null);
    resolveRef.current?.(ok);
    resolveRef.current = null;
  }, []);

  const confirm = useCallback((next: ConfirmCopy) => {
    // A second ask while one is open cancels the first rather than orphaning it.
    resolveRef.current?.(false);
    setCopy(next);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const dialog = (
    <ConfirmDialog
      title={copy?.title ?? ""}
      message={copy?.message ?? ""}
      confirmLabel={copy?.confirmLabel}
      cancelLabel={copy?.cancelLabel}
      tone={copy?.tone}
      acknowledge={copy?.acknowledge}
      isOpen={copy !== null}
      onCancel={() => settle(false)}
      onConfirm={() => settle(true)}
    />
  );

  return { confirm, dialog };
}
