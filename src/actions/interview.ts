'use server';

import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';
import { revalidatePath } from 'next/cache';

export async function getTopics() {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  try {
    const topicGroups = await prisma.interviewQuestion.groupBy({
      by: ['topic'],
      _count: { topic: true },
    });
    
    // Map topic names to icons roughly
    const getIcon = (t: string) => {
      if (t.includes('frontend')) return 'Layout';
      if (t.includes('backend')) return 'Server';
      if (t.includes('database')) return 'Database';
      if (t.includes('system') || t.includes('architecture')) return 'Network';
      if (t.includes('cloud')) return 'Cloud';
      return 'Code';
    };

    return topicGroups.map(t => ({
      id: t.topic,
      topicId: t.topic,
      name: t.topic, // Will capitalize in UI
      count: t._count.topic,
      icon: getIcon(t.topic.toLowerCase())
    }));
  } catch (error) {
    console.error('Error fetching topics:', error);
    return [];
  }
}

export async function getQuestions(topicId?: string, difficulty?: string, search?: string) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  try {
    const whereClause: any = {};
    if (topicId) whereClause.topic = topicId;
    if (difficulty) whereClause.difficulty = { equals: difficulty, mode: 'insensitive' };
    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { problemStatement: { contains: search, mode: 'insensitive' } },
        { tags: { hasSome: [search] } }
      ];
    }

    const questions = await prisma.interviewQuestion.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' }
    });
    
    // Parse JSON fields safely to objects
    return questions.map((q: any) => ({
      ...q,
      codeSnippet: q.codeSnippet ? (typeof q.codeSnippet === 'string' ? JSON.parse(q.codeSnippet) : q.codeSnippet) : null,
      mcqs: q.mcqs ? (typeof q.mcqs === 'string' ? JSON.parse(q.mcqs) : q.mcqs) : null,
    }));
  } catch (error) {
    console.error('Error fetching questions:', error);
    return [];
  }
}

export async function getQuestionTitles() {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  try {
    return await prisma.interviewQuestion.findMany({
      select: { id: true, title: true }
    });
  } catch (error) {
    console.error('Error fetching titles:', error);
    return [];
  }
}

export async function getQuestionById(id: string) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  try {
    const q = await prisma.interviewQuestion.findUnique({ where: { id } });
    if (!q) return null;
    return {
      ...q,
      codeSnippet: q.codeSnippet ? (typeof q.codeSnippet === 'string' ? JSON.parse(q.codeSnippet) : q.codeSnippet) : null,
      mcqs: q.mcqs ? (typeof q.mcqs === 'string' ? JSON.parse(q.mcqs) : q.mcqs) : null,
    };
  } catch (error) {
    console.error('Error fetching question:', error);
    return null;
  }
}

export async function createQuestion(data: any) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  try {
    const newQuestion = await prisma.interviewQuestion.create({
      data: {
        title: data.title,
        topic: data.topic,
        difficulty: data.difficulty,
        estimatedTime: parseInt(data.estimatedTime) || 10,
        frequency: parseInt(data.frequency) || 50,
        companies: data.companies || [],
        tags: data.tags || [],
        problemStatement: data.problemStatement,
        expectation: data.expectation || '',
        explanation: data.explanation || '',
        bestAnswer: data.bestAnswer || '',
        alternativeAnswer: data.alternativeAnswer,
        commonMistakes: data.commonMistakes || [],
        followUpQuestions: data.followUpQuestions || [],
        realWorldUsage: data.realWorldUsage,
        codeSnippet: data.codeSnippet || null,
        mcqs: data.mcqs || null,
        isAiGenerated: data.isAiGenerated || false
      }
    });
    revalidatePath('/interview');
    revalidatePath('/interview/explore');
    revalidatePath('/interview/manage');
    return { success: true, id: newQuestion.id };
  } catch (error) {
    console.error('Error creating question:', error);
    return { success: false, error: 'Failed to create question' };
  }
}

export async function updateQuestion(id: string, data: any) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  try {
    await prisma.interviewQuestion.update({
      where: { id },
      data: {
        title: data.title,
        topic: data.topic,
        difficulty: data.difficulty,
        estimatedTime: parseInt(data.estimatedTime) || 10,
        frequency: parseInt(data.frequency) || 50,
        companies: data.companies || [],
        tags: data.tags || [],
        problemStatement: data.problemStatement,
        expectation: data.expectation || '',
        explanation: data.explanation || '',
        bestAnswer: data.bestAnswer || '',
        alternativeAnswer: data.alternativeAnswer,
        commonMistakes: data.commonMistakes || [],
        followUpQuestions: data.followUpQuestions || [],
        realWorldUsage: data.realWorldUsage,
        codeSnippet: data.codeSnippet || null,
        mcqs: data.mcqs || null,
        isAiGenerated: data.isAiGenerated || false
      }
    });
    revalidatePath(`/interview/question/${id}`);
    revalidatePath('/interview/explore');
    revalidatePath('/interview/manage');
    return { success: true };
  } catch (error) {
    console.error('Error updating question:', error);
    return { success: false, error: 'Failed to update question' };
  }
}

export async function deleteQuestion(id: string) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  try {
    await prisma.interviewQuestion.delete({ where: { id } });
    revalidatePath('/interview/explore');
    revalidatePath('/interview/manage');
    return { success: true };
  } catch (error) {
    console.error('Error deleting question:', error);
    return { success: false, error: 'Failed to delete question' };
  }
}

export async function bulkDeleteQuestions(ids: string[]) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  try {
    await prisma.interviewQuestion.deleteMany({
      where: { id: { in: ids } }
    });
    revalidatePath('/interview/explore');
    revalidatePath('/interview/manage');
    return { success: true };
  } catch (error) {
    console.error('Error bulk deleting questions:', error);
    return { success: false, error: 'Failed to bulk delete questions' };
  }
}

export async function deleteAllQuestions() {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  try {
    await prisma.interviewQuestion.deleteMany({});
    revalidatePath('/interview/explore');
    revalidatePath('/interview/manage');
    return { success: true };
  } catch (error) {
    console.error('Error deleting all questions:', error);
    return { success: false, error: 'Failed to delete all questions' };
  }
}

export async function bulkUploadQuestions(jsonData: string) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  try {
    let parsedData = JSON.parse(jsonData);
    if (!Array.isArray(parsedData)) {
      parsedData = [parsedData];
    }

    // Filter valid questions
    const validQuestions = parsedData.filter((q: any) => q.title && q.problemStatement);

    if (validQuestions.length === 0) {
      return { success: false, error: 'No valid questions found in JSON.' };
    }

    let updatedCount = 0;
    let createdCount = 0;

    const sanitizeStringArray = (val: any): string[] => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map(String);
      if (typeof val === 'object') {
        // If it's an object like { basic: [], advanced: [] }, flatten the values
        return Object.values(val).flat().map(String);
      }
      return [String(val)];
    };

    for (const q of validQuestions) {
      const existing = await prisma.interviewQuestion.findFirst({
        where: { title: q.title }
      });

      const mappedData = {
        title: q.title,
        topic: q.topic || 'general',
        difficulty: q.difficulty || 'Medium',
        estimatedTime: parseInt(q.estimatedTime) || 10,
        frequency: parseInt(q.frequency) || 50,
        companies: sanitizeStringArray(q.companies),
        tags: sanitizeStringArray(q.tags),
        problemStatement: q.problemStatement,
        expectation: q.expectation || '',
        explanation: q.explanation || '',
        bestAnswer: q.bestAnswer || '',
        alternativeAnswer: q.alternativeAnswer,
        commonMistakes: sanitizeStringArray(q.commonMistakes),
        followUpQuestions: sanitizeStringArray(q.followUpQuestions),
        realWorldUsage: q.realWorldUsage,
        codeSnippet: q.codeSnippet || undefined,
        mcqs: q.mcqs || undefined
      };

      if (existing) {
        await prisma.interviewQuestion.update({
          where: { id: existing.id },
          data: mappedData
        });
        updatedCount++;
      } else {
        await prisma.interviewQuestion.create({
          data: mappedData
        });
        createdCount++;
      }
    }

    revalidatePath('/interview/explore');
    revalidatePath('/interview/manage');
    return { success: true, count: validQuestions.length, updatedCount, createdCount };
  } catch (error: any) {
    console.error('Bulk upload error:', error);
    return { success: false, error: error.message || 'Bulk upload failed' };
  }
}

export async function mergeQuestions(keepId: string, deleteId: string, mergedData: any) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Update the question we are keeping
      await tx.interviewQuestion.update({
        where: { id: keepId },
        data: {
          title: mergedData.title,
          topic: mergedData.topic,
          difficulty: mergedData.difficulty,
          estimatedTime: parseInt(mergedData.estimatedTime) || 10,
          frequency: parseInt(mergedData.frequency) || 50,
          companies: mergedData.companies || [],
          tags: mergedData.tags || [],
          problemStatement: mergedData.problemStatement,
          expectation: mergedData.expectation || '',
          explanation: mergedData.explanation || '',
          bestAnswer: mergedData.bestAnswer || '',
          alternativeAnswer: mergedData.alternativeAnswer,
          commonMistakes: mergedData.commonMistakes || [],
          followUpQuestions: mergedData.followUpQuestions || [],
          realWorldUsage: mergedData.realWorldUsage,
          codeSnippet: mergedData.codeSnippet || null,
          mcqs: mergedData.mcqs || null,
        }
      });

      // 2. Delete the question we are merging from
      await tx.interviewQuestion.delete({
        where: { id: deleteId }
      });
    });

    revalidatePath('/interview/explore');
    revalidatePath('/interview/manage');
    return { success: true };
  } catch (error: any) {
    console.error('Error merging questions:', error);
    return { success: false, error: 'Failed to merge questions' };
  }
}
