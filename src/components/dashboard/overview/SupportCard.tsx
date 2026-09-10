import { ArrowRight, LifeBuoy, Mail, MessagesSquare } from "lucide-react";
import Link from "next/link";

/** "Need help?" — the three ways to reach a human, and how long it takes. */
export function SupportCard() {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <LifeBuoy size={20} aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-bold text-ink-900">Need help?</h2>
          <p className="mt-1 text-sm text-ink-600">
            Get in touch with your course assistants and resolve your doubts.
          </p>
        </div>
      </div>

      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        <li>
          <Link
            href="/dashboard/forum"
            className="flex h-full flex-col rounded-lg border border-border p-3 transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <MessagesSquare size={14} aria-hidden />
              Q&amp;A forum
            </span>
            <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
              Visit forum
              <ArrowRight size={14} aria-hidden />
            </span>
          </Link>
        </li>

        <SupportEmail
          label="Learning support"
          email="learning@courseunbox.com"
        />
        <SupportEmail
          label="Placement support"
          email="placement@courseunbox.com"
        />
      </ul>

      <p className="mt-4 rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-500">
        Queries are answered within 24–48 hours.
      </p>
    </section>
  );
}

function SupportEmail({ label, email }: { label: string; email: string }) {
  return (
    <li>
      <a
        href={`mailto:${email}`}
        className="flex h-full flex-col rounded-lg border border-border p-3 transition-colors hover:border-brand-300 hover:bg-brand-50"
      >
        <span className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
          <Mail size={14} aria-hidden />
          {label}
        </span>
        <span className="mt-1 break-all text-sm font-semibold text-ink-800">
          {email}
        </span>
      </a>
    </li>
  );
}
