/** One task, its hand-ins and the two controls that change it. */
import type { Metadata } from "next";

import { TaskDetailScreen } from "@/components/staff/tasks/TaskDetailScreen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Task" };

export default async function Page({ params }: PageProps<"/admin/tasks/[task]">) {
  const { task } = await params;
  return <TaskDetailScreen taskId={task} area="admin" />;
}
