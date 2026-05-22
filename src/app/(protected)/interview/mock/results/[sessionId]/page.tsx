import React from 'react';
import { getMockInterviewSessionById, retryMockInterviewAnswer } from '@/actions/mock-interview';
import { getAiModels } from '@/actions/ai';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, XCircle, CheckCircle2, RotateCcw, AlertTriangle } from 'lucide-react';
import { revalidatePath } from 'next/cache';

export default async function MockInterviewDetailsPage({ params }: { params: { sessionId: string } }) {
  const session = await getMockInterviewSessionById(params.sessionId);
  if (!session) return notFound();

  const models = await getAiModels();
  const defaultModel = models.length > 0 ? models[0].modelId : 'gemini-2.5-flash';

  async function handleRetry(answerId: string) {
    'use server';
    await retryMockInterviewAnswer(answerId, defaultModel);
    revalidatePath(`/interview/mock/results/${params.sessionId}`);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <Link href="/interview/mock/results" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Results
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Session Details</h1>
          <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-full shadow-sm">
            {session.status === 'EVALUATING' && <Clock className="w-5 h-5 text-yellow-500" />}
            {session.status === 'FAILED' && <XCircle className="w-5 h-5 text-red-500" />}
            {session.status === 'COMPLETED' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
            <span className="font-semibold text-gray-700 dark:text-gray-300">
              {session.status === 'EVALUATING' ? 'Evaluating Answers...' : session.status === 'FAILED' ? 'Evaluation Failed' : 'Evaluation Complete'}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {session.answers.map((answer, index) => {
          const isPending = answer.status === 'PENDING';
          const isFailed = answer.status === 'FAILED';
          const isCompleted = answer.status === 'COMPLETED';

          return (
            <div key={answer.id} className="p-8 bg-white border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800 rounded-3xl">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2">
                    Question {index + 1}
                  </p>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
                    {answer.question.title}
                  </h3>
                </div>
                {isCompleted && answer.aiScore !== null && (
                  <div className={`shrink-0 flex items-center justify-center w-16 h-16 rounded-full border-4 font-bold text-xl ${
                    answer.aiScore >= 80 ? 'border-green-500 text-green-600 dark:text-green-400' :
                    answer.aiScore >= 50 ? 'border-yellow-500 text-yellow-600 dark:text-yellow-400' :
                    'border-red-500 text-red-600 dark:text-red-400'
                  }`}>
                    {answer.aiScore}
                  </div>
                )}
              </div>

              <div className="mb-8 p-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                <h4 className="font-semibold text-gray-900 dark:text-gray-200 mb-3">Your Answer</h4>
                {answer.transcript ? (
                  <p className="text-gray-700 dark:text-gray-300 italic whitespace-pre-wrap">{answer.transcript}</p>
                ) : (
                  <p className="text-gray-400 italic">No audio transcribed.</p>
                )}
                {answer.audioBase64 && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Original Audio</p>
                    <audio controls src={answer.audioBase64} className="w-full h-10" />
                  </div>
                )}
              </div>

              {isPending && (
                <div className="flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 rounded-xl">
                  <Clock className="w-5 h-5" />
                  <p className="font-medium">AI is evaluating this answer...</p>
                </div>
              )}

              {isFailed && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-xl">
                  <div className="flex items-start gap-3 mb-4">
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-red-900 dark:text-red-300">Evaluation Failed</h4>
                      <p className="text-red-700 dark:text-red-400 mt-1">{answer.errorReason}</p>
                    </div>
                  </div>
                  <form action={handleRetry.bind(null, answer.id)}>
                    <button type="submit" className="flex items-center gap-2 px-4 py-2 font-semibold text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900/80">
                      <RotateCcw className="w-4 h-4" /> Retry Evaluation
                    </button>
                  </form>
                </div>
              )}

              {isCompleted && answer.aiFeedback && (
                <div className="p-6 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-400 mb-3">AI Feedback</h4>
                  <p className="text-blue-800 dark:text-blue-300 whitespace-pre-wrap leading-relaxed">{answer.aiFeedback}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
