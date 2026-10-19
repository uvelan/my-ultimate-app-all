import { api } from '../lib/api-client';

export interface InterviewQuestion {
    id: string; title: string; topic: string; difficulty: string; estimatedTime: number;
    frequency?: number; companies: string[]; tags: string[]; problemStatement?: string;
    expectation?: string; explanation?: string; bestAnswer?: string; alternativeAnswer?: string;
    commonMistakes?: string[]; followUpQuestions?: string[]; realWorldUsage?: string;
    codeSnippet?: { language?: string; code?: string } | null; mcqs?: any[] | null; isAiGenerated?: boolean;
}
export interface InterviewPage { items: InterviewQuestion[]; total: number; page: number; totalPages: number }
export const interviewService = {
    async read<T = any>(resource: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
        return (await api.get('/mobile/interview', { params: { resource, ...params } })).data;
    },
    async act<T = any>(operation: string, values: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
        return (await api.post('/mobile/interview', { operation, ...values }, { timeout: operation === 'transcribe' ? 180000 : 120000, signal })).data;
    },
};
