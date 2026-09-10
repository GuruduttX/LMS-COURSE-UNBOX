"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";

/* ------------------------------- the layout ------------------------------- */

/**
 * The shape every authoring form takes: sections down the middle, a decision
 * rail down the side.
 *
 * These forms used to be one narrow column pinned to the left of a 1400px
 * screen — a phone form stretched across a desktop, with Save at the bottom of
 * a very long scroll. The rail fixes both: the *content* of the thing being
 * authored stays in one readable column (a title field a metre wide is harder
 * to read, not easier), while visibility, context and Save move out beside it
 * where they are always visible and the width is doing work.
 *
 * It collapses to one column below `xl`, where the rail simply follows the
 * sections — on a laptop or a tablet there is no width to spare for it.
 */
export function FormLayout({
  action,
  aside,
  children,
}: {
  action: (formData: FormData) => void;
  /** The rail: visibility, context, Save. */
  aside: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      noValidate
      className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-6"
    >
      <div className="min-w-0 space-y-5">{children}</div>
      <aside className="space-y-4 xl:sticky xl:top-20">{aside}</aside>
    </form>
  );
}

/**
 * One titled group of fields.
 *
 * The heading is not decoration: a form of twenty inputs with no seams is a
 * form nobody reads. Each section answers one question — what is it, what is
 * in it, how is it marked — so an author editing the marks can find them.
 */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <header className="border-b border-border bg-surface-muted px-5 py-3.5 sm:px-6">
        <h2 className="text-sm font-bold text-ink-900">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-ink-600">{description}</p>
        ) : null}
      </header>
      <div className="space-y-5 p-5 sm:p-6">{children}</div>
    </section>
  );
}

/** Two fields abreast, where both are short. Stacks on a phone. */
export function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-5 sm:grid-cols-2">{children}</div>;
}

/** A card in the side rail. */
export function SidebarCard({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      {title ? (
        <h2 className="mb-3 text-2xs font-bold uppercase tracking-wider text-ink-400">
          {title}
        </h2>
      ) : null}
      {children}
    </div>
  );
}

/**
 * Where in the tree this thing will land, as the rail's first card.
 *
 * The breadcrumb above says the same, but it scrolls away; an author two
 * screens down a test paper still wants to know which module they are writing
 * for before they hit Save.
 */
export function ContextCard({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  return (
    <SidebarCard title="Where this lives">
      <dl className="space-y-2.5">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
              {item.label}
            </dt>
            <dd className="text-sm font-medium text-ink-900">{item.value}</dd>
          </div>
        ))}
      </dl>
    </SidebarCard>
  );
}

/**
 * Save, and the way out — the sidebar's bottom card.
 *
 * It is a card of its own rather than a row under the last field, because on a
 * form as long as a test paper the button would otherwise be a scroll away
 * from everything an author is deciding. Sticky, so Save is always in reach.
 */
export function FormActions({
  pending,
  cancelHref,
  submitLabel,
  note,
}: {
  pending: boolean;
  cancelHref: string;
  submitLabel: string;
  /** One line under the button — what saving will actually do. */
  note?: string;
}) {
  return (
    <SidebarCard>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : submitLabel}
      </Button>
      <Link
        href={cancelHref}
        className="mt-2 block rounded-lg py-2 text-center text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900"
      >
        Cancel
      </Link>
      {note ? <p className="mt-2 text-xs text-ink-500">{note}</p> : null}
    </SidebarCard>
  );
}
