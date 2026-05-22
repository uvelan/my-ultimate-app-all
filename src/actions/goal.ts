'use server';

import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';
import { revalidatePath } from 'next/cache';

export async function getGoals() {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');

  return await prisma.interviewGoal.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' }
  });
}

export async function addGoal(data: { title: string, targetCount: number, topic?: string, company?: string, difficulty?: string }) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');

  const goal = await prisma.interviewGoal.create({
    data: {
      userId: user.id,
      title: data.title,
      targetCount: data.targetCount,
      topic: data.topic,
      company: data.company,
      difficulty: data.difficulty,
    }
  });

  revalidatePath('/interview/goals');
  revalidatePath('/interview/manage');
  return goal;
}

export async function updateGoal(id: string, data: any) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');

  const goal = await prisma.interviewGoal.update({
    where: { id, userId: user.id },
    data
  });

  revalidatePath('/interview/goals');
  return goal;
}

export async function deleteGoal(id: string) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');

  await prisma.interviewGoal.delete({
    where: { id, userId: user.id }
  });

  revalidatePath('/interview/goals');
  return true;
}

// Progress tracking
export async function getCompletedQuestions() {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');

  const progress = await prisma.interviewProgress.findMany({
    where: { userId: user.id },
    select: { questionId: true }
  });

  return progress.map(p => p.questionId);
}

export async function toggleQuestionComplete(questionId: string) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');

  const existing = await prisma.interviewProgress.findUnique({
    where: {
      userId_questionId: {
        userId: user.id,
        questionId: questionId
      }
    }
  });

  let completed = false;

  if (existing) {
    await prisma.interviewProgress.delete({
      where: { id: existing.id }
    });
  } else {
    await prisma.interviewProgress.create({
      data: {
        userId: user.id,
        questionId: questionId
      }
    });
    completed = true;
  }

  // We should revalidate paths where completion shows
  revalidatePath(`/interview/question/${questionId}`);
  revalidatePath('/interview/goals');
  revalidatePath('/interview/explore');
  
  return { completed };
}
