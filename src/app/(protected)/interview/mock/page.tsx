import React from 'react';
import { getMockInterviewSessions, deleteMockInterviewSession } from '@/actions/mock-interview';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Trash2, ChevronRight, CheckCircle2, Clock, XCircle, BarChart3, MonitorPlay } from 'lucide-react';
import { revalidatePath } from 'next/cache';

export default async function MockInterviewDashboard() {
  const sessions = await getMockInterviewSessions();

  async function handleDelete(id: string) {
    'use server';
    await deleteMockInterviewSession(id);
    revalidatePath('/interview/mock');
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Mock Interviews</h1>
          <p className="mt-2 text-gray-500 dark:text-gray-400">Practice your interview skills and get real-time AI feedback.</p>
        </div>
        <Link 
          href="/interview/mock/start" 
          className="flex items-center gap-2 px-6 py-3 font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30"
        >
          <MonitorPlay className="w-5 h-5" /> Start New Session
        </Link>
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Past Results</h2>
        {sessions.length === 0 ? (
          <div className="p-12 text-center bg-white border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800 rounded-3xl">
            <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Results Yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">Take a mock interview to see your AI-driven evaluation here.</p>
            <Link href="/interview/mock/start" className="font-semibold text-blue-600 hover:text-blue-700">Get Started &rarr;</Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sessions.map(session => {
              const isEvaluating = session.status === 'EVALUATING';
              const isFailed = session.status === 'FAILED';
              
              const totalScore = session.answers.reduce((acc, curr) => acc + (curr.aiScore || 0), 0);
              const avgScore = session.answers.length > 0 && !isEvaluating && !isFailed 
                ? Math.round(totalScore / session.answers.length) 
                : null;

              return (
                <div key={session.id} className="relative group p-6 bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow dark:bg-gray-900 dark:border-gray-800 rounded-2xl flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      {isEvaluating && <Clock className="w-5 h-5 text-yellow-500" />}
                      {isFailed && <XCircle className="w-5 h-5 text-red-500" />}
                      {session.status === 'COMPLETED' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {isEvaluating ? 'Evaluating...' : isFailed ? 'Failed' : 'Completed'}
                      </span>
                    </div>
                    <form action={handleDelete.bind(null, session.id)}>
                      <button type="submit" className="p-2 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </form>
                  </div>
                  
                  <div className="flex-1">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                      {formatDistanceToNow(session.createdAt, { addSuffix: true })}
                    </p>
                    
                    {avgScore !== null && (
                      <div className="mb-4">
                        <div className="flex items-end gap-1">
                          <span className="text-4xl font-bold text-gray-900 dark:text-white">{avgScore}</span>
                          <span className="text-gray-500 dark:text-gray-400 font-medium mb-1">/ 100 avg</span>
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-1">
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                        {session.answers.length} Questions Answered
                      </p>
                    </div>
                  </div>

                  <Link 
                    href={`/interview/mock/results/${session.id}`}
                    className="mt-6 flex items-center justify-center w-full gap-2 py-3 font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    View Details <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
