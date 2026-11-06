import { addDays, addWeeks, addMonths, addYears } from "date-fns";
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

const recurrenceIntervals = { DAILY: addDays, WEEKLY: addWeeks, MONTHLY: addMonths, YEARLY: addYears };

export async function updateTask(userId: string, data: UpdateTaskInput) {
  const { id, ...changes } = data;
  const include = { project: true, tags: true } as const;
  if (changes.status !== "DONE") {
    return prisma.task.update({
      where: { id, userId },
      data: { ...changes, ...(changes.status ? { completedAt: null } : {}) },
      include,
    });
  }

  // Keep completion and the next occurrence in the same transaction. Retry Mongo write conflicts.
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const existing = await tx.task.findUniqueOrThrow({ where: { id, userId } });
        const now = new Date();
        const frequency = changes.frequency === undefined ? existing.frequency : changes.frequency;
        const advance = existing.status !== "DONE" && !existing.recurrenceAdvanced && frequency;
        const task = await tx.task.update({
          where: { id, userId },
          data: { ...changes, completedAt: existing.status === "DONE" ? existing.completedAt : now,
            ...(advance ? { recurrenceAdvanced: true } : {}) },
          include,
        });
        if (advance) {
          const shift = recurrenceIntervals[advance];
          await tx.task.create({ data: {
            userId, title: task.title, description: task.description, priority: task.priority,
            area: task.area, frequency: advance, projectId: task.projectId, tagIds: task.tagIds,
            startDate: task.startDate ? shift(task.startDate, 1) : null,
            dueDate: shift(task.dueDate || now, 1),
          } });
        }
        return task;
      });
    } catch (error) {
      if (attempt >= 2 || (error as { code?: string }).code !== "P2034") throw error;
    }
  }
}
export async function deleteTask(userId: string, taskId: string) {
  return prisma.task.delete({
    where: { id: taskId, userId },
  });
}

export async function bulkUpdateTaskStatus(userId: string, data: BulkUpdateStatusInput) {
  const where = { userId, id: { in: data.taskIds } };
  if (data.status !== "DONE") {
    return prisma.task.updateMany({ where, data: { status: data.status, completedAt: null } });
  }
  const tasks = await prisma.task.findMany({ where, select: { id: true } });
  for (const { id } of tasks) await updateTask(userId, { id, status: data.status });
  return { count: tasks.length };
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
