'use server';

import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';
import { getAiModels } from './ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function submitMockInterview(answers: { questionId: string, transcript: string, audioBase64: string }[]) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');

  // Create session
  const session = await prisma.mockInterviewSession.create({
    data: {
      userId: user.id,
      status: 'EVALUATING',
      answers: {
        create: answers.map(a => ({
          questionId: a.questionId,
          transcript: a.transcript || null,
          audioBase64: a.audioBase64 || null,
          status: 'PENDING'
        }))
      }
    },
    include: { answers: true }
  });

  // Dispatch background job (fire and forget)
  processSessionEvaluations(session.id).catch(console.error);

  return { success: true, sessionId: session.id };
}

async function processSessionEvaluations(sessionId: string) {
  try {
    const session = await prisma.mockInterviewSession.findUnique({
      where: { id: sessionId },
      include: { 
        answers: { include: { question: true } }
      }
    });

    if (!session) return;

    // Get default model
    const models = await getAiModels();
    const modelName = models.length > 0 ? models[0].modelId : 'gemini-2.5-flash';

    let allCompleted = true;

    for (const answer of session.answers) {
      if (answer.status === 'COMPLETED') continue;

      const success = await evaluateSingleAnswer(answer, modelName);
      if (!success) {
        allCompleted = false;
      }
    }

    await prisma.mockInterviewSession.update({
      where: { id: sessionId },
      data: { status: allCompleted ? 'COMPLETED' : 'FAILED' }
    });

  } catch (error) {
    console.error('Session evaluation failed:', error);
    await prisma.mockInterviewSession.update({
      where: { id: sessionId },
      data: { status: 'FAILED' }
    });
  }
}

export async function retryMockInterviewAnswer(answerId: string, modelName: string) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');

  const answer = await prisma.mockInterviewAnswer.findUnique({
    where: { id: answerId, session: { userId: user.id } },
    include: { question: true, session: true }
  });

  if (!answer) return { success: false, error: 'Answer not found' };

  await prisma.mockInterviewAnswer.update({
    where: { id: answerId },
    data: { status: 'PENDING', errorReason: null }
  });

  // Re-evaluate in background
  (async () => {
    await evaluateSingleAnswer(answer, modelName);
    
    // Check if whole session is now completed
    const pendingAnswers = await prisma.mockInterviewAnswer.count({
      where: { sessionId: answer.sessionId, status: 'PENDING' }
    });
    const failedAnswers = await prisma.mockInterviewAnswer.count({
      where: { sessionId: answer.sessionId, status: 'FAILED' }
    });
    
    if (pendingAnswers === 0) {
      await prisma.mockInterviewSession.update({
        where: { id: answer.sessionId },
        data: { status: failedAnswers > 0 ? 'FAILED' : 'COMPLETED' }
      });
    }
  })().catch(console.error);

  return { success: true };
}

async function evaluateSingleAnswer(answer: any, modelName: string): Promise<boolean> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2 * 60 * 1000); // 2 mins per answer

  try {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing');
    
    if (!answer.transcript || answer.transcript.trim() === '') {
      throw new Error('No transcript provided. The user did not speak or transcription failed.');
    }

    const prompt = `You are a senior FAANG interviewer conducting a mock interview.
The candidate was asked the following question:
Title: "${answer.question.title}"
Problem Statement: "${answer.question.problemStatement}"

The candidate provided the following answer (transcribed from audio):
"${answer.transcript}"

Please evaluate their answer in real-time. Do not rely on any pre-written perfect answers. Judge their knowledge, clarity, and correctness based on standard software engineering principles.

Respond ONLY with a valid JSON object matching this schema:
{
  "score": 85, // integer 0-100
  "feedback": "Your detailed feedback explaining what was good, what was missing, and how to improve."
}`;

    let res: Response | null = null;
    let data: any = null;
    let retries = 3;

    for (let i = 0; i < retries; i++) {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
        })
      });

      if (res.status === 429) {
        throw new Error('API quota exhausted');
      }
      if (res.status >= 500) {
        if (i === retries - 1) break;
        await new Promise(r => setTimeout(r, 2000 * Math.pow(2, i)));
        continue;
      }
      
      data = await res.json();
      break;
    }

    if (!res || !res.ok) {
      throw new Error(data?.error?.message || 'Failed to evaluate AI response.');
    }

    let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) throw new Error('Empty response from AI.');

    textResponse = textResponse.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(textResponse);

    if (typeof parsed.score !== 'number' || typeof parsed.feedback !== 'string') {
      throw new Error('Invalid JSON schema returned by AI');
    }

    await prisma.mockInterviewAnswer.update({
      where: { id: answer.id },
      data: {
        status: 'COMPLETED',
        aiScore: parsed.score,
        aiFeedback: parsed.feedback,
        timeTakenMs: Date.now() - startTime
      }
    });

    clearTimeout(timeoutId);
    return true;

  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error(`Evaluation failed for answer ${answer.id}:`, error);
    
    const isTimeout = error.name === 'AbortError' || (error.message && error.message.includes('aborted'));
    const errorMessage = isTimeout ? 'Evaluation timed out.' : error.message || 'Unexpected error';

    await prisma.mockInterviewAnswer.update({
      where: { id: answer.id },
      data: {
        status: 'FAILED',
        errorReason: errorMessage,
        timeTakenMs: Date.now() - startTime
      }
    });
    return false;
  }
}

export async function getMockInterviewSessions() {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');

  return await prisma.mockInterviewSession.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      answers: {
        select: { status: true, aiScore: true }
      }
    }
  });
}

export async function getMockInterviewSessionById(id: string) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');

  return await prisma.mockInterviewSession.findUnique({
    where: { id, userId: user.id },
    include: {
      answers: {
        include: { question: true }
      }
    }
  });
}

export async function deleteMockInterviewSession(id: string) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  
  try {
    await prisma.mockInterviewSession.delete({
      where: { id, userId: user.id }
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Failed to delete session' };
  }
}
