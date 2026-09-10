import type { AssessmentRow, CourseRow, Total } from "@/lib/data/marksheet-db";

import { MarkValue } from "./MarkValue";

/**
 * The two summary tables: one row per course, one row per term assessment.
 *
 * design.md §5 — **on mobile a data table becomes a card list**, never a
 * horizontal scroll. Both layouts render from the same rows; only the markup
 * differs, so there is no second source of truth about what a row contains.
 */
export function CourseMarksTable({
  rows,
  total,
}: {
  rows: CourseRow[];
  total: Total;
}) {
  // No project column: there is no Project model, and a column of em dashes
  // would be a promise the app cannot keep. See marksheet-db.ts.
  const columns = ["Final test", "Assignments"];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <table className="hidden w-full text-left sm:table">
        <caption className="sr-only">Marks for each course in the program</caption>
        <thead>
          <tr className="bg-surface-sunken">
            <Th className="w-1/2">Course name</Th>
            {columns.map((label) => (
              <Th key={label} className="text-right">
                {label}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id}>
              <Td className="font-semibold text-ink-900">
                Course {row.number}: {row.title}
              </Td>
              <Td className="text-right">
                <MarkValue value={row.test} />
              </Td>
              <Td className="text-right">
                <MarkValue value={row.assignment} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-border sm:hidden">
        {rows.map((row) => (
          <li key={row.id} className="p-4">
            <p className="text-sm font-bold text-ink-900">
              Course {row.number}: {row.title}
            </p>
            <dl className="mt-3 space-y-1.5">
              <MarkLine label="Final test" value={row.test} />
              <MarkLine label="Assignments" value={row.assignment} />
            </dl>
          </li>
        ))}
      </ul>

      <TotalRow total={total} />
    </section>
  );
}

export function AssessmentMarksTable({
  rows,
  total,
}: {
  rows: AssessmentRow[];
  total: Total;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <table className="hidden w-full text-left sm:table">
        <caption className="sr-only">Marks for the term assessments</caption>
        <thead>
          <tr className="bg-surface-sunken">
            <Th>Viva and career planning session</Th>
            <Th className="text-right">Score</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id}>
              <Td className="font-semibold text-ink-900">{row.title}</Td>
              <Td className="text-right">
                <MarkValue value={row.mark} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-border sm:hidden">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-4 p-4">
            <p className="text-sm font-bold text-ink-900">{row.title}</p>
            <MarkValue value={row.mark} />
          </li>
        ))}
      </ul>

      <TotalRow total={total} />
    </section>
  );
}

/** The tinted band that closes each table. */
function TotalRow({ total }: { total: Total }) {
  return (
    <p className="border-t border-brand-200 bg-brand-50 px-4 py-3 text-sm font-bold text-ink-900 md:px-5">
      <span className="text-2xs font-semibold uppercase tracking-[0.12em] text-brand-700">
        Score:{" "}
      </span>
      {total.percent}%{" "}
      <span className="font-bold tabular-nums text-ink-600">
        ({total.scored}/{total.max})
      </span>
    </p>
  );
}

function MarkLine({ label, value }: { label: string; value: Parameters<typeof MarkValue>[0]["value"] }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs font-medium text-ink-500">{label}</dt>
      <dd>
        <MarkValue value={value} />
      </dd>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-3 text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500 md:px-5 ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-4 py-4 text-sm text-ink-700 md:px-5 ${className ?? ""}`}>
      {children}
    </td>
  );
}
