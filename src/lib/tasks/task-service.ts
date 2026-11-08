import { createHash } from 'node:crypto';
import { addDays, addWeeks, addMonths, addYears } from "date-fns";
import { prisma } from "@/lib/prisma";
import {
  CreateTaskInput,
  UpdateTaskInput,
  BulkUpdateStatusInput,
  BulkDeleteInput,
} from "./task-schema";

export async function getTasks(userId: string) {
  const tasks = await prisma.task.findMany({
    where: { OR: [{ userId }, { assignedUserId: userId, area: "OFFICE" }] },
    include: {
      project: true,
      tags: true,
    },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
  });
  return tasks.map(task => task.userId === userId ? task : { ...task, project: null, projectId: null, tags: [], tagIds: [] });
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

async function officeFields(userId: string, area: string | null | undefined, shareWith: string | null | undefined) {
  if (area !== "OFFICE" || shareWith === "" || shareWith === null) return { assignedUserId: null };
  if (shareWith === undefined) return {};
  const account = await prisma.user.findUnique({ where: { email: shareWith }, select: { id: true, isActive: true } });
  if (!account?.isActive || account.id === userId) throw new Error("Enter the email of an active colleague account.");
  return { assignedUserId: account.id };
}

export async function createTask(userId: string, data: CreateTaskInput, requestId?: string) {
  const { shareWith, ...fields } = data;
  const id = requestId ? createHash("sha256").update(userId + ":" + requestId).digest("hex").slice(0, 24) : undefined;
  const include = { project: true, tags: true } as const;
  if (id) {
    const existing = await prisma.task.findUnique({ where: { id, userId }, include });
    if (existing) return existing;
  }
  const sharing = await officeFields(userId, fields.area, shareWith);
  try {
    return await prisma.task.create({
      data: { ...fields, ...sharing, ...(id ? { id } : {}), userId,
        ...(fields.area !== "OFFICE" ? { colleague: null, jiraKey: null } : {}) },
      include,
    });
  } catch (error) {
    if (!id || (error as { code?: string }).code !== "P2002") throw error;
    return prisma.task.findUniqueOrThrow({ where: { id, userId }, include });
  }
}

const recurrenceIntervals = { DAILY: addDays, WEEKLY: addWeeks, MONTHLY: addMonths, YEARLY: addYears };

export async function updateTask(userId: string, data: UpdateTaskInput, assigned = false) {
  const { id, shareWith, ...fields } = data;
  const where = assigned ? { id, assignedUserId: userId, area: "OFFICE" } : { id, userId };
  const currentArea = shareWith !== undefined && fields.area === undefined
    ? (await prisma.task.findUniqueOrThrow({ where, select: { area: true } })).area : fields.area;
  const sharing = currentArea !== undefined || shareWith !== undefined ? await officeFields(userId, currentArea, shareWith) : {};
  const changes = { ...fields, ...sharing,
    ...(fields.area !== undefined && fields.area !== "OFFICE" ? { colleague: null, jiraKey: null } : {}) };
  const include = { project: true, tags: true } as const;
  if (changes.status !== "DONE") {
    return prisma.task.update({
      where,
      data: { ...changes, ...(changes.status ? { completedAt: null } : {}) },
      include,
    });
  }

  // Keep completion and the next occurrence in the same transaction. Retry Mongo write conflicts.
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const existing = await tx.task.findUniqueOrThrow({ where });
        const now = new Date();
        const frequency = changes.frequency === undefined ? existing.frequency : changes.frequency;
        const advance = existing.status !== "DONE" && !existing.recurrenceAdvanced && frequency;
        const task = await tx.task.update({
          where,
          data: { ...changes, completedAt: existing.status === "DONE" ? existing.completedAt : now,
            ...(advance ? { recurrenceAdvanced: true } : {}) },
          include,
        });
        if (advance) {
          const shift = recurrenceIntervals[advance];
          await tx.task.create({ data: {
            userId: task.userId, title: task.title, description: task.description, priority: task.priority,
            area: task.area, colleague: task.colleague, jiraKey: task.jiraKey, assignedUserId: task.assignedUserId,
            frequency: advance, projectId: task.projectId, tagIds: task.tagIds,
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
