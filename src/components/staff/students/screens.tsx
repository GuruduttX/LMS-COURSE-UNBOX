import {
  CalendarCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  Library,
  Mail,
  Paperclip,
  Phone,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeading, StatTile } from "@/components/staff/StatTile";
import { EditBatchButton } from "@/components/staff/batches/BatchControls";
import { BatchFillBar } from "@/components/staff/batches/BatchFill";
import { BatchTeachers } from "@/components/staff/batches/BatchTeachers";
import { Breadcrumb } from "@/components/staff/curriculum/Breadcrumb";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { requireRole } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/curriculum/format";
import { batchDetail, type BatchRow } from "@/lib/data/batches";
import {
  assignableTeachersForBatch,
  teachersOnBatch,
} from "@/lib/data/teacher-assignments";
import { formatMark } from "@/lib/data/marksheet-db";
import { studentFeeRecord } from "@/lib/data/fees";
import {
  programRoster,
  programsWithStudents,
  studentDetail,
  studentsActor,
  type StudentRow,
  type StudentsArea,
} from "@/lib/data/students";

import { EnrollControls, WithdrawButton } from "./EnrollControls";
import { FeeRecordDialog } from "./FeeRecordDialog";

/**
 * The students screens, written once for three areas.
 *
 * `/admin/students`, `/manager/students` and `/teacher/students` render the
 * same three levels — programs → students → one student — and differ only in
 * their base path and in what the person is allowed to do when they get there.
 * Duplicating them per area would be three places for a scope check to drift,
 * which is the mistake the curriculum screens already avoid.
 *
 * **The scope check is in `lib/data/students.ts`, not here.** Every loader calls
 * `assertScope`, so a manager or teacher sees exactly the programs on their
 * assignments and a forged URL 404s — whether or not whoever adds the next
 * route remembers.
 *
 * Only an admin or a program manager gets the enrolment controls; a teacher
 * gets the same screens read-only. Who is in the cohort is not a teacher's
 * decision — they author content and mark work.
 */

function base(area: StudentsArea): string {
  return `/${area}/students`;
}

/* ------------------------------- level one ------------------------------- */

export async function StudentProgramsScreen({ area }: { area: StudentsArea }) {
  const user = await studentsActor(area);
  const programs = await programsWithStudents(user);

  return (
    <div className="space-y-6">
      <PageHeading
        title="Students"
        description={
          user.role === "admin"
            ? "Every program, and who is on it."
            : "The programs you are assigned to. Pick one to see its students."
        }
      />

      {programs.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No programs assigned to you"
          description="Students are grouped by program, and you aren't on one yet. An admin assigns programs from the people screen."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {programs.map((program) => (
            <Link
              key={program.slug}
              href={`${base(area)}/${program.slug}`}
              className="rounded-xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-border-strong hover:bg-ink-50"
            >
              <span className="inline-flex size-10 items-center justify-center rounded-lg bg-brand-50">
                <Library size={18} aria-hidden className="text-brand-600" />
              </span>
              <h2 className="mt-3 text-base font-bold text-ink-900">
                {program.title}
              </h2>
              {program.summary ? (
                <p className="mt-1 line-clamp-2 text-sm text-ink-600">
                  {program.summary}
                </p>
              ) : null}
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700">
                <UsersRound size={15} aria-hidden className="text-ink-400" />
                {program.students}{" "}
                {program.students === 1 ? "student" : "students"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- level two ------------------------------- */

export async function ProgramStudentsScreen({
  area,
  programSlug,
}: {
  area: StudentsArea;
  programSlug: string;
}) {
  const user = await studentsActor(area);
  const roster = await programRoster(user, programSlug);

  // A teacher may look; enrolling is the admin's and the manager's job.
  const mayEnrol = user.role === "admin" || user.role === "program_manager";
  const active = roster.students.filter((row) => row.status === "active");

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Students", href: base(area) },
          { label: roster.program.title },
        ]}
      />

      <PageHeading
        title={roster.program.title}
        description={`${active.length} active ${active.length === 1 ? "student" : "students"}${
          roster.students.length > active.length
            ? ` · ${roster.students.length - active.length} withdrawn or finished`
            : ""
        }`}
      />

      {mayEnrol ? (
        <EnrollControls
          programSlug={programSlug}
          enrollable={roster.enrollable}
          batches={roster.batches}
        />
      ) : null}

      {roster.students.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Nobody is enrolled yet"
          description={
            mayEnrol
              ? "Enrol a student above and they will appear here with their progress."
              : "Once students are enrolled on this program they will appear here."
          }
        />
      ) : (
        <RosterTable
          area={area}
          programSlug={programSlug}
          rows={roster.students}
          mayEnrol={mayEnrol}
        />
      )}
    </div>
  );
}

/* --------------------------- level two, by batch -------------------------- */

/** The cohort's run, as a heading fragment. Empty when neither date is set. */
function batchRun(batch: BatchRow): string {
  if (batch.startsOn && batch.endsOn) {
    return ` · ${formatDate(batch.startsOn)} — ${formatDate(batch.endsOn)}`;
  }
  if (batch.startsOn) return ` · starts ${formatDate(batch.startsOn)}`;
  if (batch.endsOn) return ` · ends ${formatDate(batch.endsOn)}`;
  return "";
}

/**
 * One cohort: who is in it, and how they are doing.
 *
 * The same table as the program roster, over `programRoster(..., { batch })` —
 * a batch is a slice of a program's students, not a different kind of thing, so
 * a second loader would only be a second place for the progress sums to drift.
 *
 * **Percentages are still measured against the whole program.** A batch does
 * not have its own syllabus; "60%" here means the same as it does on the
 * program roster, which is the only way the two screens can be read together.
 *
 * Lives under /manager/batches for the admin too, exactly as the batch list
 * does — `requireRole("program_manager")` admits an admin, and `assertScope`
 * inside both loaders decides what a manager may actually see.
 */
export async function BatchStudentsScreen({
  programSlug,
  batchName,
}: {
  programSlug: string;
  batchName: string;
}) {
  const user = await requireRole("program_manager");
  if (!can(user, "batch.view")) notFound();

  const [batch, roster, teachers, assignable] = await Promise.all([
    batchDetail(user, programSlug, batchName),
    programRoster(user, programSlug, { batch: batchName }),
    teachersOnBatch(programSlug, batchName),
    assignableTeachersForBatch(programSlug, batchName),
  ]);

  const mayEnrol = user.role === "admin" || user.role === "program_manager";
  const active = roster.students.filter((row) => row.status === "active");
  const open = batch.status === "open" && !batch.isFull;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Batches", href: "/manager/batches" },
          { label: roster.program.title },
          { label: batch.name },
        ]}
      />

      <PageHeading
        title={batch.name}
        description={`${roster.program.title} · ${active.length} active ${
          active.length === 1 ? "student" : "students"
        }${batchRun(batch)}`}
      />

      <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <BatchFillBar enrolled={batch.enrolled} capacity={batch.capacity} />
        {can(user, "batch.manage") ? (
          <div className="mt-4 border-t border-border pt-3">
            <EditBatchButton batch={batch} />
          </div>
        ) : null}
      </section>

      {/* Staffing sits above the roster: who takes this cohort is the thing
          that decides who can see the rest of the page. */}
      <BatchTeachers
        programSlug={programSlug}
        batchName={batch.name}
        teachers={teachers}
        assignable={assignable}
        readOnly={!can(user, "program.assignTeacher")}
      />

      {/* A closed or full cohort keeps the controls off the page rather than
          showing a form the action would refuse. */}
      {mayEnrol && open ? (
        <EnrollControls
          programSlug={programSlug}
          enrollable={roster.enrollable}
          batches={roster.batches}
          lockedBatch={batch.name}
        />
      ) : null}

      {roster.students.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Nobody is in this batch yet"
          description={
            mayEnrol && open
              ? "Enrol a student above and they will appear here with their progress."
              : "Students enrolled into this cohort will appear here with their progress."
          }
        />
      ) : (
        <RosterTable
          area="manager"
          programSlug={programSlug}
          rows={roster.students}
          mayEnrol={mayEnrol}
        />
      )}
    </div>
  );
}

/**
 * The roster.
 *
 * design.md §5 again: **on mobile a data table becomes a card list**, never a
 * horizontal scroll. Both layouts render from the same rows.
 */
function RosterTable({
  area,
  programSlug,
  rows,
  mayEnrol,
}: {
  area: StudentsArea;
  programSlug: string;
  rows: StudentRow[];
  mayEnrol: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <table className="hidden w-full text-left md:table">
        <caption className="sr-only">Students enrolled on this program</caption>
        <thead>
          <tr className="bg-surface-sunken">
            <Th>Student</Th>
            <Th>Progress</Th>
            <Th className="text-right">Assignments</Th>
            <Th className="text-right">Attendance</Th>
            <Th className="text-right">Last active</Th>
            {mayEnrol ? <Th className="text-right">·</Th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-ink-50">
              <Td>
                <Link
                  href={`${base(area)}/${programSlug}/${row.id}`}
                  className="font-semibold text-ink-900 hover:text-brand-700"
                >
                  {row.name}
                </Link>
                <span className="mt-0.5 block text-2xs text-ink-500">
                  {row.email}
                </span>
                <StatusChips row={row} />
              </Td>
              <Td>
                <div className="flex items-center gap-2">
                  <ProgressBar
                    value={row.progressPercent}
                    label={`${row.name}'s progress`}
                    className="w-24"
                  />
                  <span className="text-xs font-bold tabular-nums text-ink-700">
                    {row.progressPercent}%
                  </span>
                </div>
                <span className="mt-0.5 block text-2xs text-ink-500">
                  {row.subtopicsDone} of {row.subtopicsTotal} lessons
                </span>
              </Td>
              <Td className="text-right text-sm tabular-nums text-ink-700">
                {row.assignmentsIn} / {row.assignmentsTotal}
              </Td>
              <Td className="text-right text-sm tabular-nums text-ink-700">
                {/* Never zero for "nothing marked yet" — an em dash, because a
                    0% attendance record a student did not earn is a lie. */}
                {row.attendancePercent === null
                  ? "—"
                  : `${row.attendancePercent}%`}
              </Td>
              <Td className="text-right text-2xs text-ink-500">
                {row.lastActiveAt ? formatDate(row.lastActiveAt) : "Never"}
              </Td>
              {mayEnrol ? (
                <Td className="text-right">
                  {row.status === "withdrawn" ? null : (
                    <WithdrawButton
                      programSlug={programSlug}
                      studentId={row.id}
                      name={row.name}
                    />
                  )}
                </Td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-border md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="p-4">
            <Link
              href={`${base(area)}/${programSlug}/${row.id}`}
              className="text-sm font-bold text-ink-900"
            >
              {row.name}
            </Link>
            <p className="text-2xs text-ink-500">{row.email}</p>
            <StatusChips row={row} />

            <div className="mt-3 flex items-center gap-2">
              <ProgressBar
                value={row.progressPercent}
                label={`${row.name}'s progress`}
                className="flex-1"
              />
              <span className="text-xs font-bold tabular-nums text-ink-700">
                {row.progressPercent}%
              </span>
            </div>

            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-600">
              <Pair label="Assignments">
                {row.assignmentsIn} / {row.assignmentsTotal}
              </Pair>
              <Pair label="Attendance">
                {row.attendancePercent === null
                  ? "—"
                  : `${row.attendancePercent}%`}
              </Pair>
              <Pair label="Last active">
                {row.lastActiveAt ? formatDate(row.lastActiveAt) : "Never"}
              </Pair>
            </dl>

            {mayEnrol && row.status !== "withdrawn" ? (
              <div className="mt-3">
                <WithdrawButton
                  programSlug={programSlug}
                  studentId={row.id}
                  name={row.name}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Only the states worth a badge: the normal case gets none. */
function StatusChips({ row }: { row: StudentRow }) {
  if (row.status === "active" && !row.suspended && !row.batch) return null;

  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      {row.status !== "active" ? (
        <Chip tone={row.status === "completed" ? "good" : "muted"}>
          {row.status === "completed" ? "Completed" : "Withdrawn"}
        </Chip>
      ) : null}
      {/* The account, not the enrolment — a suspended student is still on the
          program, they just cannot sign in. Two different facts. */}
      {row.suspended ? <Chip tone="warn">Account suspended</Chip> : null}
      {row.batch ? <Chip tone="muted">{row.batch}</Chip> : null}
    </span>
  );
}

function Chip({
  tone,
  children,
}: {
  tone: "good" | "warn" | "muted";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide",
        tone === "good" && "bg-success-50 text-success-700",
        tone === "warn" && "bg-warning-50 text-warning-700",
        tone === "muted" && "bg-ink-100 text-ink-600",
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------ level three ------------------------------ */

export async function StudentDetailScreen({
  area,
  programSlug,
  studentId,
}: {
  area: StudentsArea;
  programSlug: string;
  studentId: string;
}) {
  const user = await studentsActor(area);
  const detail = await studentDetail(user, programSlug, studentId);

  /**
   * Null for anyone without `fee.manage` — which is everyone but an admin — so
   * the button below simply is not rendered for a manager or a teacher. The
   * check lives in the loader rather than here, because a screen that forgets
   * to hide a control is not a permission; this is only the rendering half.
   */
  const feeRecord = await studentFeeRecord(user, programSlug, studentId);

  const { student, enrollment, marksheet, progress, assignments, attendance } =
    detail;

  const handedIn = assignments.filter((row) => row.submission).length;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Students", href: base(area) },
          { label: detail.program.title, href: `${base(area)}/${programSlug}` },
          { label: student.name },
        ]}
      />

      <PageHeading
        title={student.name}
        description={
          enrollment.batch
            ? `${enrollment.batch} · enrolled ${formatDate(enrollment.enrolledAt)}`
            : `Enrolled ${formatDate(enrollment.enrolledAt)}`
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {enrollment.status !== "active" ? (
              <Chip tone={enrollment.status === "completed" ? "good" : "muted"}>
                {enrollment.status === "completed" ? "Completed" : "Withdrawn"}
              </Chip>
            ) : null}
            {student.suspended ? (
              <Chip tone="warn">Account suspended</Chip>
            ) : null}
            {feeRecord ? <FeeRecordDialog record={feeRecord} /> : null}
          </div>
        }
      />

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-600">
        <span className="inline-flex items-center gap-1.5">
          <Mail size={14} aria-hidden className="text-ink-400" />
          <a href={`mailto:${student.email}`} className="hover:text-brand-700">
            {student.email}
          </a>
        </span>
        {student.phone ? (
          <span className="inline-flex items-center gap-1.5">
            <Phone size={14} aria-hidden className="text-ink-400" />
            <a href={`tel:${student.phone}`} className="hover:text-brand-700">
              {student.phone}
            </a>
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Progress"
          value={`${progress.percent}%`}
          hint={`${progress.done} of ${progress.total} lessons`}
          icon={GraduationCap}
        />
        <StatTile
          label="Aggregate"
          value={marksheet ? `${marksheet.aggregate.percent}%` : "—"}
          hint={
            marksheet
              ? `${marksheet.aggregate.scored} of ${marksheet.aggregate.max} marks`
              : "no marks yet"
          }
          icon={ClipboardList}
        />
        <StatTile
          label="Assignments in"
          value={`${handedIn} / ${assignments.length}`}
          hint={
            handedIn === assignments.length
              ? "all handed in"
              : "still outstanding"
          }
          icon={FileText}
        />
        <StatTile
          label="Attendance"
          value={attendance.percent === null ? "—" : `${attendance.percent}%`}
          hint={
            attendance.percent === null
              ? "nothing marked yet"
              : `${attendance.present} present · ${attendance.absent} absent`
          }
          icon={CalendarCheck}
        />
      </div>

      <MarksPanel marksheet={marksheet} />
      <AssignmentsPanel assignments={assignments} />
    </div>
  );
}

/**
 * Marks, from the student's own marksheet.
 *
 * Literally the same `getMarksheet` their screen calls, so staff and student
 * cannot be reading two different sets of numbers. Only the summary rows are
 * shown here — the per-module breakdown belongs on the marksheet, and copying
 * it would be a second thing to keep in step.
 */
function MarksPanel({
  marksheet,
}: {
  marksheet: Awaited<ReturnType<typeof studentDetail>>["marksheet"];
}) {
  if (!marksheet) return null;

  const hasAnything =
    marksheet.courses.some((row) => row.test || row.assignment) ||
    marksheet.assessments.some((row) => row.mark);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold text-ink-900">Marks</h2>

      {!hasAnything ? (
        <EmptyState
          icon={ClipboardList}
          title="Nothing marked yet"
          description="Marks appear here as this student sits tests and their assignments are graded."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-sunken">
                <Th>Course</Th>
                <Th className="text-right">Final test</Th>
                <Th className="text-right">Assignments</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {marksheet.courses.map((row) => (
                <tr key={row.id}>
                  <Td className="font-medium text-ink-900">
                    Course {row.number}: {row.title}
                  </Td>
                  <Td className="text-right text-sm tabular-nums text-ink-700">
                    {formatMark(row.test)}
                  </Td>
                  <Td className="text-right text-sm tabular-nums text-ink-700">
                    {formatMark(row.assignment)}
                  </Td>
                </tr>
              ))}
              {marksheet.assessments.map((row) => (
                <tr key={row.id} className="bg-brand-50/40">
                  <Td className="font-medium text-ink-900">{row.title}</Td>
                  <Td
                    className="text-right text-sm tabular-nums text-ink-700"
                    colSpan={2}
                  >
                    {formatMark(row.mark)}
                  </Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-sunken">
                <Td className="font-bold text-ink-900">Aggregate</Td>
                <Td
                  className="text-right text-sm font-bold tabular-nums text-ink-900"
                  colSpan={2}
                >
                  {marksheet.aggregate.scored} / {marksheet.aggregate.max} ·{" "}
                  {marksheet.aggregate.percent}%
                </Td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

/** Every published assignment, and what this student did about it. */
function AssignmentsPanel({
  assignments,
}: {
  assignments: Awaited<ReturnType<typeof studentDetail>>["assignments"];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold text-ink-900">Assignments</h2>

      {assignments.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No assignments in this program"
          description="Once a teacher publishes one it will appear here with this student's hand-in."
        />
      ) : (
        <ul className="space-y-2">
          {assignments.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink-900">{row.title}</p>
                  <p className="mt-0.5 text-2xs text-ink-500">
                    {row.courseTitle} · out of {row.maxMarks}
                    {row.dueDate ? ` · due ${formatDate(row.dueDate)}` : ""}
                  </p>
                </div>

                {row.submission ? (
                  <Chip
                    tone={
                      row.submission.status === "evaluated" ? "good" : "muted"
                    }
                  >
                    {row.submission.status === "evaluated"
                      ? `${row.submission.scored} / ${row.maxMarks}`
                      : "Awaiting marking"}
                  </Chip>
                ) : (
                  <Chip tone="warn">Not handed in</Chip>
                )}
              </div>

              {row.submission ? (
                <div className="mt-3 border-t border-border pt-3">
                  <a
                    href={row.submission.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
                  >
                    <Paperclip size={14} aria-hidden className="shrink-0" />
                    <span className="truncate">{row.submission.fileName}</span>
                  </a>
                  <p className="mt-1 text-2xs text-ink-500">
                    {row.submission.format} · handed in{" "}
                    {formatDate(row.submission.submittedAt)}
                  </p>
                  {row.submission.note ? (
                    <p className="mt-2 text-sm text-ink-700">
                      <span className="font-semibold text-ink-500">Note: </span>
                      {row.submission.note}
                    </p>
                  ) : null}
                  {row.submission.feedback ? (
                    <p className="mt-2 text-sm text-ink-700">
                      <span className="font-semibold text-ink-500">
                        Feedback:{" "}
                      </span>
                      {row.submission.feedback}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* --------------------------------- bits ---------------------------------- */

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
      className={cn(
        "px-4 py-2.5 text-2xs font-bold uppercase tracking-[0.08em] text-ink-500",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={cn("px-4 py-3 align-top", className)}>
      {children}
    </td>
  );
}

function Pair({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span>
      <dt className="inline font-semibold text-ink-500">{label}: </dt>
      <dd className="inline tabular-nums">{children}</dd>
    </span>
  );
}
