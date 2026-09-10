"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";

type RosterStudent = {
  id: string;
  name: string;
  email: string;
  state: "present" | "absent" | null;
};

/**
 * The roster, marked in one submit.
 *
 * A pair of radios per student rather than a checkbox, because "present" and
 * "absent" are two decisions and a checkbox only records one of them — an
 * unticked box would mean both "absent" and "haven't looked yet", which is
 * exactly the ambiguity the null state exists to avoid.
 *
 * Everyone starts on whatever was saved before; students never marked start on
 * neither, and "Mark all present" is there because that is the common case and
 * ticking forty radios by hand is how mistakes happen.
 */
export function AttendanceRoster({
  sessionId,
  action,
  students,
}: {
  sessionId: string;
  action: (formData: FormData) => Promise<void>;
  students: RosterStudent[];
}) {
  const [states, setStates] = useState<
    Record<string, "present" | "absent" | null>
  >(Object.fromEntries(students.map((student) => [student.id, student.state])));

  const set = (id: string, value: "present" | "absent") =>
    setStates((current) => ({ ...current, [id]: value }));

  const setAll = (value: "present" | "absent") =>
    setStates(
      Object.fromEntries(students.map((student) => [student.id, value])),
    );

  const present = students.filter(
    (student) => states[student.id] === "present",
  ).length;
  const unmarked = students.filter(
    (student) => states[student.id] === null,
  ).length;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={sessionId} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">
          <span className="font-semibold text-ink-900">
            {present}/{students.length}
          </span>{" "}
          present
          {unmarked > 0 ? ` · ${unmarked} not marked` : null}
        </p>

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setAll("present")}
          >
            Mark all present
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setAll("absent")}
          >
            Mark all absent
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {students.map((student) => (
          <li
            key={student.id}
            className="flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <input type="hidden" name="studentId" value={student.id} />

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">
                {student.name}
              </p>
              <p className="truncate text-xs text-ink-500">{student.email}</p>
            </div>

            <fieldset className="flex items-center gap-4">
              <legend className="sr-only">Attendance for {student.name}</legend>

              <label className="flex items-center gap-1.5 text-sm font-medium text-ink-700">
                <input
                  type="radio"
                  name={`state:${student.id}`}
                  value="present"
                  checked={states[student.id] === "present"}
                  onChange={() => set(student.id, "present")}
                  className="h-4 w-4 border-border-strong text-success-500"
                />
                Present
              </label>

              <label className="flex items-center gap-1.5 text-sm font-medium text-ink-700">
                <input
                  type="radio"
                  name={`state:${student.id}`}
                  value="absent"
                  checked={states[student.id] === "absent"}
                  onChange={() => set(student.id, "absent")}
                  className="h-4 w-4 border-border-strong text-danger-500"
                />
                Absent
              </label>
            </fieldset>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">Save attendance</Button>
        {unmarked > 0 ? (
          <p className="text-xs text-ink-500">
            Anyone still unmarked will be saved as absent.
          </p>
        ) : null}
      </div>
    </form>
  );
}
