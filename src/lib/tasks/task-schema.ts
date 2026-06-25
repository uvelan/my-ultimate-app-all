import { z } from "zod";
import { TaskStatus, Priority, Frequency } from "@prisma/client";

export const baseTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(100, "Title is too long"),
  description: z.string().max(1000, "Description is too long").optional(),
  status: z.nativeEnum(TaskStatus).default(TaskStatus.TODO),
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
  frequency: z.nativeEnum(Frequency).optional().nullable(),
  startDate: z.date().optional().nullable(),
  dueDate: z.date().optional().nullable(),
  projectId: z.string().transform(val => val === "" ? null : val).optional().nullable(),
  tagIds: z.array(z.string()).optional(),
});

export const createTaskSchema = baseTaskSchema.refine(
  (data) => {
    if (data.startDate && data.dueDate) {
      return data.startDate <= data.dueDate;
    }
    return true;
  },
  {
    message: "Start date must be before or equal to due date",
    path: ["startDate"], // Path of error
  }
);

export const updateTaskSchema = baseTaskSchema.partial().extend({
  id: z.string().min(1, "ID is required"),
}).refine(
  (data) => {
    if (data.startDate && data.dueDate) {
      return data.startDate <= data.dueDate;
    }
    return true;
  },
  {
    message: "Start date must be before or equal to due date",
    path: ["startDate"],
  }
);

export const bulkUpdateStatusSchema = z.object({
  taskIds: z.array(z.string()).min(1, "At least one task must be selected"),
  status: z.nativeEnum(TaskStatus),
});

export const bulkDeleteSchema = z.object({
  taskIds: z.array(z.string()).min(1, "At least one task must be selected"),
});

export const projectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(50, "Name is too long"),
  color: z.string().optional(),
});

export const tagSchema = z.object({
  name: z.string().min(1, "Tag name is required").max(30, "Name is too long"),
  color: z.string().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type BulkUpdateStatusInput = z.infer<typeof bulkUpdateStatusSchema>;
export type BulkDeleteInput = z.infer<typeof bulkDeleteSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
export type TagInput = z.infer<typeof tagSchema>;
