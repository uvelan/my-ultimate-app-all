import { verifyAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getTasks, getProjects, getTags } from "@/lib/tasks/task-service";
import { TaskManager } from "@/components/tasks/TaskManager";

export const metadata = {
  title: "Tasks",
  description: "Manage your tasks and projects",
};

export default async function TasksPage() {
  const { isAuthenticated, user } = await verifyAuth();

  if (!isAuthenticated || !user || !await prisma.user.findFirst({ where: { id: user.id, isActive: true }, select: { id: true } })) {
    redirect("/login");
  }

  const [tasks, projects, tags] = await Promise.all([
    getTasks(user.id),
    getProjects(user.id),
    getTags(user.id)
  ]);

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8 h-[calc(100vh-4rem)]">
      <TaskManager 
        initialTasks={tasks}
        viewerId={user.id}
        jiraBaseUrl={process.env.JIRA_BASE_URL}
        projects={projects}
        tags={tags}
      />
    </div>
  );
}
