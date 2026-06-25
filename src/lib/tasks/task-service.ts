import { prisma } from "@/lib/prisma";
import {
  CreateTaskInput,
  UpdateTaskInput,
  BulkUpdateStatusInput,
  BulkDeleteInput,
} from "./task-schema";

export async function getTasks(userId: string) {
  return prisma.task.findMany({
    where: { userId },
    include: {
      project: true,
      tags: true,
    },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
  });
}

export async function getTaskById(userId: string, taskId: string) {
  return prisma.task.findUnique({
    where: { id: taskId, userId },
    include: {
      project: true,
      tags: true,
    },
  });
}

export async function createTask(userId: string, data: CreateTaskInput) {
  return prisma.task.create({
    data: {
      ...data,
      userId,
    },
    include: {
      project: true,
      tags: true,
    },
  });
}

export async function updateTask(userId: string, data: UpdateTaskInput) {
  const { id, ...rest } = data;
  const updateData: any = { ...rest };
  
  if (updateData.status === "DONE" && !updateData.completedAt) {
    updateData.completedAt = new Date();
    
    // Handle Recurring Task Logic
    const existingTask = await prisma.task.findUnique({ where: { id, userId } });
    if (existingTask && existingTask.frequency) {
      // Spawn next occurrence
      const { addDays, addWeeks, addMonths, addYears } = require("date-fns");
      
      let nextDueDate = existingTask.dueDate ? new Date(existingTask.dueDate) : new Date();
      let nextStartDate = existingTask.startDate ? new Date(existingTask.startDate) : null;
      
      switch (existingTask.frequency) {
        case "DAILY":
          nextDueDate = addDays(nextDueDate, 1);
          if (nextStartDate) nextStartDate = addDays(nextStartDate, 1);
          break;
        case "WEEKLY":
          nextDueDate = addWeeks(nextDueDate, 1);
          if (nextStartDate) nextStartDate = addWeeks(nextStartDate, 1);
          break;
        case "MONTHLY":
          nextDueDate = addMonths(nextDueDate, 1);
          if (nextStartDate) nextStartDate = addMonths(nextStartDate, 1);
          break;
        case "YEARLY":
          nextDueDate = addYears(nextDueDate, 1);
          if (nextStartDate) nextStartDate = addYears(nextStartDate, 1);
          break;
      }
      
      // Create the new spawned task
      await prisma.task.create({
        data: {
          userId,
          title: existingTask.title,
          description: existingTask.description,
          priority: existingTask.priority,
          status: "TODO",
          frequency: existingTask.frequency,
          startDate: nextStartDate,
          dueDate: nextDueDate,
          projectId: existingTask.projectId,
          tagIds: (existingTask as any).tagIds || []
        }
      });
    }
  } else if (updateData.status && updateData.status !== "DONE") {
    updateData.completedAt = null;
  }

  return prisma.task.update({
    where: { id, userId },
    data: updateData,
    include: {
      project: true,
      tags: true,
    },
  });
}

export async function deleteTask(userId: string, taskId: string) {
  return prisma.task.delete({
    where: { id: taskId, userId },
  });
}

export async function bulkUpdateTaskStatus(
  userId: string,
  data: BulkUpdateStatusInput
) {
  const completedAt = data.status === "DONE" ? new Date() : null;
  
  return prisma.task.updateMany({
    where: {
      userId,
      id: { in: data.taskIds },
    },
    data: {
      status: data.status,
      completedAt,
    },
  });
}

export async function bulkDeleteTasks(userId: string, data: BulkDeleteInput) {
  return prisma.task.deleteMany({
    where: {
      userId,
      id: { in: data.taskIds },
    },
  });
}

export async function getProjects(userId: string) {
  return prisma.project.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  });
}

export async function getTags(userId: string) {
  return prisma.tag.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  });
}
