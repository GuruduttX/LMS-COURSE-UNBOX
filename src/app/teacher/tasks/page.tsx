import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TasksScreen } from "@/components/staff/tasks/TasksScreen";
import { requireRole } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { taskAudienceOptions, tasksForStaff } from "@/lib/data/tasks";

/**
 * A teacher's tasks. A guard plus the shared screen — the admin's copy at
 * /admin/tasks is the same three lines with `requireRole("admin")`.
 *
 * Rendered per request: a task set a moment ago must appear, and the roster the
 * composer offers changes whenever somebody is enrolled.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Tasks" };

export default async function TeacherTasksPage() {
  const user = await requireRole("teacher");

  // Capability, not role: the nav derives from the same map, so a role that
  // loses `task.assign` loses the screen rather than keeping a page whose every
  // control refuses.
  if (!can(user, "task.assign")) notFound();

  const [groups, audiences] = await Promise.all([
    tasksForStaff(user),
    taskAudienceOptions(user),
  ]);

  return <TasksScreen groups={groups} audiences={audiences} area="teacher" />;
}
