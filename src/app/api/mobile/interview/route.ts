import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/lib/auth-server';
import { getTopics, getQuestions, getQuestionById, createQuestion, updateQuestion, deleteQuestion, bulkDeleteQuestions, bulkUploadQuestions, mergeQuestions } from '@/actions/interview';
import { getGoals, addGoal, updateGoal, deleteGoal, getCompletedQuestions, toggleQuestionComplete } from '@/actions/goal';
import { syncInterviewBook } from '@/actions/interview-book';
import { getAiModels, getAIJobs, generateQuestionWithAI, deleteAIJob, cancelAIJob, addAiModel, updateAiModel, deleteAiModel } from '@/actions/ai';
import { getMockInterviewSessions, getMockInterviewSessionById, submitMockInterview, retryMockInterviewAnswer, deleteMockInterviewSession } from '@/actions/mock-interview';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 300;
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
const text = z.string().max(100_000);
const list = z.array(z.string().max(500)).max(100).default([]);
const questionSchema = z.object({
    title: z.string().trim().min(1).max(500), topic: z.string().trim().min(1).max(100),
    difficulty: z.enum(['Easy', 'Medium', 'Hard']), estimatedTime: z.coerce.number().int().min(1).max(300).default(10),
    frequency: z.coerce.number().int().min(0).max(100).default(50), companies: list, tags: list,
    problemStatement: text.min(1), expectation: text.default(''), explanation: text.default(''), bestAnswer: text.default(''),
    alternativeAnswer: text.nullable().optional(), realWorldUsage: text.nullable().optional(),
    commonMistakes: list, followUpQuestions: list,
    codeSnippet: z.object({ language: z.string().max(100), code: text }).nullable().optional(),
    mcqs: z.array(z.unknown()).max(100).nullable().optional(), isAiGenerated: z.boolean().default(false),
});
const goalSchema = z.object({
    title: z.string().trim().min(1).max(200), targetCount: z.coerce.number().int().min(1).max(10000),
    topic: z.string().max(100).optional(), company: z.string().max(100).optional(), difficulty: z.string().max(30).optional(),
});
const audioSchema = z.string().max(7_000_100).regex(/^data:audio\/(?:m4a|mp4|mpeg|mp3|3gpp|aac|webm|wav|ogg|flac);base64,[A-Za-z0-9+/]+={0,2}$/, 'Use a valid audio recording');
function decodedAudio(value: string) {
    const match = /^data:(audio\/[a-z0-9]+);base64,(.+)$/.exec(value)!;
    const bytes = Buffer.from(match[2], 'base64');
    return { mimeType: match[1] === 'audio/mp4' ? 'audio/m4a' : match[1], data: match[2],
        valid: bytes.length > 0 && bytes.length <= 5 * 1024 * 1024 && bytes.toString('base64') === match[2] };
}
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const idFrom = (value: unknown) => objectId.parse(value);
function failure(error: unknown) {
    if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message || 'Invalid details' }, 400);
    if (error instanceof SyntaxError) return json({ error: 'Invalid JSON' }, 400);
    console.error('[Mobile interview]', error);
    return json({ error: 'Unable to complete the interview request. Please try again.' }, 500);
}
function result(value: any) {
    if (value?.success !== false) return json(value);
    const safeMessages = ['Unauthorized', 'Administrator access required', 'A model with this ID already exists.',
        'Another model with this ID already exists.', 'Question not found', 'Answer not found', 'Job not found',
        'Job is not pending', 'No valid questions found to generate a book.'];
    return json({ error: safeMessages.includes(value.error) ? value.error : 'Unable to complete this action. Please try again.' }, 400);
}

export async function GET(request: Request) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated || !auth.user?.id) return json({ error: 'Unauthorized' }, 401);
    try {
        const params = new URL(request.url).searchParams;
        const resource = params.get('resource') || 'overview';
        if (resource === 'overview') {
            const [topics, goals, completed, models] = await Promise.all([getTopics(), getGoals(), getCompletedQuestions(), getAiModels()]);
            return json({ topics, goals, completed, models, canManageModels: ['ADMIN', 'SUPERUSER'].includes(auth.user.role) });
        }
        if (resource === 'topics') return json(await getTopics());
        if (resource === 'models') return json(await getAiModels());
        if (resource === 'progress') return json(await getCompletedQuestions());
        if (resource === 'question') {
            const question = await getQuestionById(idFrom(params.get('id')));
            return question ? json(question) : json({ error: 'Question not found' }, 404);
        }
        if (resource === 'questions' || resource === 'deck' || resource === 'goals') {
            let questions: any[] = resource === 'goals' ? await getQuestions() : await getQuestions(params.get('topic') || undefined, params.get('difficulty') || undefined, params.get('search')?.slice(0, 300) || undefined);
            const company = params.get('company');
            if (company && resource !== 'goals') questions = questions.filter(item => item.companies.some((name: string) => name.toLowerCase() === company.toLowerCase()));
            const tag = params.get('tag');
            if (tag && resource !== 'goals') questions = questions.filter(item => item.tags.some((value: string) => value.toLowerCase() === tag.toLowerCase()));
            if (resource === 'goals') {
                const [goals, completed] = await Promise.all([getGoals(), getCompletedQuestions()]);
                const done = new Set(completed);
                return json(goals.map(goal => ({ ...goal, completedCount: questions.filter(question => done.has(question.id)
                    && (!goal.topic || goal.topic === question.topic) && (!goal.difficulty || goal.difficulty.toLowerCase() === question.difficulty.toLowerCase())
                    && (!goal.company || question.companies.some((name: string) => name.toLowerCase() === goal.company!.toLowerCase()))).length })));
            }
            if (resource === 'deck') {
                const count = Math.max(1, Math.min(20, Number(params.get('limit')) || 10));
                for (let index = questions.length - 1; index > 0; index--) {
                    const swap = Math.floor(Math.random() * (index + 1));
                    [questions[index], questions[swap]] = [questions[swap], questions[index]];
                }
                return json(questions.slice(0, count));
            }
            const limit = 30;
            const page = Math.max(1, Math.min(10000, Math.trunc(Number(params.get('page')) || 1)));
            return json({ items: questions.slice((page - 1) * limit, page * limit).map(item => ({
                id: item.id, title: item.title, topic: item.topic, difficulty: item.difficulty,
                estimatedTime: item.estimatedTime, companies: item.companies, tags: item.tags, isAiGenerated: item.isAiGenerated,
            })), total: questions.length, page, totalPages: Math.ceil(questions.length / limit) });
        }
        if (resource === 'jobs') return json(await getAIJobs());
        if (resource === 'sessions') return json(await getMockInterviewSessions());
        if (resource === 'session') {
            const session = await getMockInterviewSessionById(idFrom(params.get('id')));
            return session ? json(session) : json({ error: 'Session not found' }, 404);
        }
        return json({ error: 'Unknown interview resource' }, 400);
    } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated || !auth.user?.id) return json({ error: 'Unauthorized' }, 401);
    try {
        const raw = await request.text();
        if (raw.length > 4_200_000) return json({ error: 'This submission is too large. Remove or shorten recordings, or split questions into smaller batches.' }, 413);
        const body = z.object({ operation: z.string() }).passthrough().parse(JSON.parse(raw));
        switch (body.operation) {
            case 'saveQuestion': {
                const data = questionSchema.parse(body.data);
                return result(body.id ? await updateQuestion(idFrom(body.id), data) : await createQuestion(data));
            }
            case 'deleteQuestion': return result(await deleteQuestion(idFrom(body.id)));
            case 'bulkDelete': return result(await bulkDeleteQuestions(z.array(objectId).min(1).max(200).parse(body.ids)));
            case 'bulkUpload': {
                const entries = typeof body.data === 'string' ? JSON.parse(body.data) : body.data;
                const parsed = z.array(questionSchema).min(1).max(200).parse(Array.isArray(entries) ? entries : [entries]);
                return result(await bulkUploadQuestions(JSON.stringify(parsed)));
            }
            case 'mergeQuestions': {
                const keep = idFrom(body.keepId), remove = idFrom(body.deleteId);
                if (keep === remove) return json({ error: 'Choose two different questions' }, 400);
                return result(await mergeQuestions(keep, remove, questionSchema.parse(body.data)));
            }
            case 'saveGoal': {
                const data = goalSchema.parse(body.data);
                return result(body.id ? await updateGoal(idFrom(body.id), data) : await addGoal(data));
            }
            case 'deleteGoal': return result(await deleteGoal(idFrom(body.id)));
            case 'toggleComplete': return result(await toggleQuestionComplete(idFrom(body.id)));
            case 'syncBook': return result(await syncInterviewBook());
            case 'generate': {
                const prompt = z.string().trim().max(20000).parse(body.prompt || '');
                const updateId = body.id ? idFrom(body.id) : undefined;
                if (!prompt && !updateId) return json({ error: 'Enter a question prompt' }, 400);
                const models = await getAiModels();
                const model = z.string().min(1).max(200).parse(body.model || 'gemini-2.5-flash');
                if (!models.some(item => item.modelId === model && item.isActive)) return json({ error: 'Select an active AI model' }, 400);
                return result(await generateQuestionWithAI(prompt, updateId, model));
            }
            case 'deleteJob': return result(await deleteAIJob(idFrom(body.id)));
            case 'cancelJob': return result(await cancelAIJob(idFrom(body.id)));
            case 'saveModel': {
                if (!['ADMIN', 'SUPERUSER'].includes(auth.user.role)) return json({ error: 'Administrator access required' }, 403);
                const data = z.object({ modelId: z.string().trim().min(1).max(200), name: z.string().trim().min(1).max(100), isActive: z.boolean().default(true) }).parse(body.data);
                return result(body.id ? await updateAiModel(idFrom(body.id), data) : await addAiModel(data.modelId, data.name));
            }
            case 'deleteModel': {
                if (!['ADMIN', 'SUPERUSER'].includes(auth.user.role)) return json({ error: 'Administrator access required' }, 403);
                return result(await deleteAiModel(idFrom(body.id)));
            }
            case 'submitMock': {
                const answers = z.array(z.object({ questionId: objectId, transcript: z.string().trim().min(1).max(30000),
                    audioBase64: z.union([z.literal(''), audioSchema]).default(''),
                })).min(1).max(20).parse(body.answers);
                if (answers.some(answer => answer.audioBase64 && !decodedAudio(answer.audioBase64).valid)) return json({ error: 'Each recording must be valid audio of at most 5 MB.' }, 400);
                return result(await submitMockInterview(answers));
            }
            case 'transcribe': {
                const audio = decodedAudio(audioSchema.parse(body.audioBase64));
                if (!audio.valid) return json({ error: 'Use a valid recording of at most 5 MB.' }, 400);
                if (audio.mimeType === 'audio/3gpp') return json({ error: 'Record a new M4A answer to use voice transcription.' }, 400);
                const key = process.env.GEMINI_API_KEY;
                if (!key) return json({ error: 'Voice transcription is unavailable. You can type your response or use keyboard dictation.' }, 503);
                request.signal.throwIfAborted();
                try {
                    const model = new GoogleGenerativeAI(key).getGenerativeModel({
                        model: process.env.GEMINI_TRANSCRIPTION_MODEL || 'gemini-2.5-flash',
                        generationConfig: { temperature: 0, maxOutputTokens: 8192 },
                    });
                    const response = await model.generateContent([
                        { text: 'Transcribe the speech in this recording verbatim. Preserve the spoken language and technical terms. Return only the transcript, without headings, commentary, translation, summaries, or answers. If there is no intelligible speech, return an empty string.' },
                        { inlineData: { mimeType: audio.mimeType, data: audio.data } },
                    ], { signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]) });
                    request.signal.throwIfAborted();
                    const finishReason = response.response.candidates?.[0]?.finishReason;
                    if (finishReason && finishReason !== 'STOP') return json({ error: 'The recording could not be fully transcribed. Try a shorter recording.' }, 422);
                    const transcript = response.response.text().trim();
                    if (!transcript) return json({ error: 'No clear speech was detected. Record again or type your answer.' }, 422);
                    if (transcript.length > 30000) return json({ error: 'The transcript is too long. Try a shorter recording.' }, 422);
                    return json({ transcript });
                } catch {
                    if (request.signal.aborted) return json({ error: 'Transcription cancelled.' }, 499);
                    return json({ error: 'Voice transcription could not complete. Try again or type your response.' }, 502);
                }
            }
            case 'retryAnswer': {
                const models = await getAiModels();
                const model = z.string().min(1).max(200).parse(body.model);
                if (!models.some(item => item.modelId === model && item.isActive)) return json({ error: 'Select an active AI model' }, 400);
                return result(await retryMockInterviewAnswer(idFrom(body.id), model));
            }
            case 'deleteSession': return result(await deleteMockInterviewSession(idFrom(body.id)));
            default: return json({ error: 'Unknown interview action' }, 400);
        }
    } catch (error) { return failure(error); }
}
