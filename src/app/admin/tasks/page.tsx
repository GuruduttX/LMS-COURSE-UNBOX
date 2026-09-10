import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TasksScreen } from "@/components/staff/tasks/TasksScreen";
import { requireRole } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { taskAudienceOptions, tasksForStaff } from "@/lib/data/tasks";

/**
 * The admin's copy of the tasks screen. Same component, wider scope — the
 * loaders build their program list from the user's assignments, and an admin's
 * covers everything.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Tasks" };

export default async function AdminTasksPage() {
  const user = await requireRole("admin");

  if (!can(user, "task.assign")) notFound();

  const [groups, audiences] = await Promise.all([
    tasksForStaff(user),
    taskAudienceOptions(user),
  ]);

  return <TasksScreen groups={groups} audiences={audiences} area="admin" />;
}
