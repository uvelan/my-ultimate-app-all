"use server";

import { revalidatePath } from "next/cache";
import { verifyAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { projectSchema, tagSchema, ProjectInput, TagInput } from "@/lib/tasks/task-schema";

export async function createProjectAction(data: ProjectInput) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = projectSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "Invalid input" };
  }

  try {
    const existing = await prisma.project.findFirst({
      where: { userId: user.id, name: parsed.data.name }
    });
    if (existing) {
      return { success: false, error: "Project name already exists" };
    }

    const project = await prisma.project.create({
      data: {
        ...parsed.data,
        userId: user.id,
      },
    });
    revalidatePath("/tasks");
    return { success: true, data: project };
  } catch (error) {
    console.error("Error creating project:", error);
    return { success: false, error: "Failed to create project" };
  }
}

export async function deleteProjectAction(projectId: string) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await prisma.project.delete({
      where: { id: projectId, userId: user.id },
    });
    revalidatePath("/tasks");
    return { success: true };
  } catch (error) {
    console.error("Error deleting project:", error);
    return { success: false, error: "Failed to delete project" };
  }
}

export async function createTagAction(data: TagInput) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = tagSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "Invalid input" };
  }

  try {
    const existing = await prisma.tag.findFirst({
      where: { userId: user.id, name: parsed.data.name }
    });
    if (existing) {
      return { success: false, error: "Tag name already exists" };
    }

    const tag = await prisma.tag.create({
      data: {
        ...parsed.data,
        userId: user.id,
      },
    });
    revalidatePath("/tasks");
    return { success: true, data: tag };
  } catch (error) {
    console.error("Error creating tag:", error);
    return { success: false, error: "Failed to create tag" };
  }
}

export async function deleteTagAction(tagId: string) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await prisma.tag.delete({
      where: { id: tagId, userId: user.id },
    });
    revalidatePath("/tasks");
    return { success: true };
  } catch (error) {
    console.error("Error deleting tag:", error);
    return { success: false, error: "Failed to delete tag" };
  }
}
