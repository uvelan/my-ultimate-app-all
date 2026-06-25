import { verifyAuth } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import { getTasks, getProjects, getTags } from "@/lib/tasks/task-service";
import { TaskManager } from "@/components/tasks/TaskManager";

export const metadata = {
  title: "Tasks",
  description: "Manage your tasks and projects",
};

export default async function TasksPage() {
  const { isAuthenticated, user } = await verifyAuth();

  if (!isAuthenticated || !user) {
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
        projects={projects}
        tags={tags}
      />
    </div>
  );
}
