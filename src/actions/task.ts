"use server";

import { revalidatePath } from "next/cache";
import { verifyAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import {
  createTask,
  updateTask,
  deleteTask,
  bulkUpdateTaskStatus,
  bulkDeleteTasks,
} from "@/lib/tasks/task-service";
import {
  createTaskSchema,
  updateTaskSchema,
  bulkUpdateStatusSchema,
  bulkDeleteSchema,
  CreateTaskInput,
  UpdateTaskInput,
  BulkUpdateStatusInput,
  BulkDeleteInput,
} from "@/lib/tasks/task-schema";

export async function createTaskAction(data: CreateTaskInput) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = createTaskSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "Invalid input" };
  }

  try {
    const task = await createTask(user.id, parsed.data);
    revalidatePath("/activities");
    revalidatePath("/tasks");
    return { success: true, data: task };
  } catch (error) {
    console.error("Error creating task:", error);
    return { success: false, error: error instanceof Error && error.message.startsWith("Enter the email") ? error.message : "Failed to create task" };
  }
}

export async function updateTaskAction(data: UpdateTaskInput, assigned = false) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = updateTaskSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "Invalid input" };
  }

  try {
    if (assigned && (Object.keys(parsed.data).length !== 2 || !parsed.data.status)) {
      return { success: false, error: "Only the status of a shared task can be changed." };
    }
    if (assigned && !await prisma.user.findFirst({ where: { id: user.id, isActive: true }, select: { id: true } })) {
      return { success: false, error: "Unauthorized" };
    }
    const task = await updateTask(user.id, parsed.data, assigned);
    revalidatePath("/activities");
    revalidatePath("/tasks");
    return { success: true, data: task };
  } catch (error) {
    console.error("Error updating task:", error);
    return { success: false, error: error instanceof Error && error.message.startsWith("Enter the email") ? error.message : "Failed to update task" };
  }
}

export async function deleteTaskAction(taskId: string) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) {
    return { success: false, error: "Unauthorized" };
  }

  if (!taskId) {
    return { success: false, error: "Task ID is required" };
  }

  try {
    await deleteTask(user.id, taskId);
    revalidatePath("/tasks");
    return { success: true };
  } catch (error) {
    console.error("Error deleting task:", error);
    return { success: false, error: "Failed to delete task" };
  }
}

export async function bulkUpdateTaskStatusAction(data: BulkUpdateStatusInput) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = bulkUpdateStatusSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "Invalid input" };
  }

  try {
    await bulkUpdateTaskStatus(user.id, parsed.data);
    revalidatePath("/tasks");
    return { success: true };
  } catch (error) {
    console.error("Error in bulk update task status:", error);
    return { success: false, error: "Failed to bulk update tasks" };
  }
}

export async function bulkDeleteTasksAction(data: BulkDeleteInput) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = bulkDeleteSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "Invalid input" };
  }

  try {
    await bulkDeleteTasks(user.id, parsed.data);
    revalidatePath("/tasks");
    return { success: true };
  } catch (error) {
    console.error("Error in bulk delete tasks:", error);
    return { success: false, error: "Failed to bulk delete tasks" };
  }
}
