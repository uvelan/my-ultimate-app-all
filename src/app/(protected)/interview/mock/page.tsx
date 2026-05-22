'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Check, X, RotateCcw, Loader2 } from 'lucide-react';
import InterviewTimer from '@/components/interview/InterviewTimer';
import { getQuestions } from '@/actions/interview';

export default function MockInterviewPage() {
  const [isStarted, setIsStarted] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  
  const [sessionQuestions, setSessionQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadQuestions() {
      const data = await getQuestions();
      const randomThree = data.sort(() => 0.5 - Math.random()).slice(0, 3);
      setSessionQuestions(randomThree);
      setLoading(false);
    }
    loadQuestions();
  }, []);

  const [scores, setScores] = useState<Record<string, 'pass' | 'fail'>>({});

  const handleStart = () => {
    setIsStarted(true);
    setIsFinished(false);
    setCurrentIdx(0);
    setScores({});
  };

  const handleScore = (status: 'pass' | 'fail') => {
    setScores(prev => ({ ...prev, [sessionQuestions[currentIdx].id]: status }));
    if (currentIdx < sessionQuestions.length - 1) {
      setCurrentIdx(prev => prev + 1);
    } else {
      setIsFinished(true);
    }
  };

  const handleTimeUp = () => {
    setIsFinished(true);
  };

  if (!isStarted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md p-8 bg-white border border-gray-200 shadow-xl dark:bg-gray-900 dark:border-gray-800 rounded-3xl"
        >
          <div className="w-16 h-16 mx-auto mb-6 text-blue-600 bg-blue-100 rounded-2xl dark:bg-blue-900/30 flex items-center justify-center">
            {loading ? <Loader2 className="w-8 h-8 animate-spin" /> : <Play className="w-8 h-8 fill-current" />}
          </div>
          <h1 className="mb-4 text-3xl font-bold text-gray-900 dark:text-white">Mock Interview</h1>
          <p className="mb-8 text-gray-500 dark:text-gray-400">
            {loading 
              ? "Loading questions from database..."
              : `You will face ${sessionQuestions.length} randomized questions. You have 30 minutes. Speak your answers out loud as if in a real interview, then self-evaluate.`}
          </p>
          <button
            onClick={handleStart}
            disabled={loading || sessionQuestions.length === 0}
            className="w-full py-4 text-lg font-bold text-white transition-colors bg-blue-600 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/30 disabled:opacity-50"
          >
            {loading ? "Please wait..." : "Start Session"}
          </button>
        </motion.div>
      </div>
    );
  }

  if (isFinished) {
    const passed = Object.values(scores).filter(s => s === 'pass').length;
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-lg p-8 w-full bg-white border border-gray-200 shadow-xl dark:bg-gray-900 dark:border-gray-800 rounded-3xl"
        >
          <h2 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">Interview Complete</h2>
          <p className="mb-8 text-xl text-gray-500 dark:text-gray-400">
            You passed {passed} out of {sessionQuestions.length} questions.
          </p>
          
          <div className="space-y-3 mb-8">
            {sessionQuestions.map((q, idx) => (
              <div key={q.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
                <span className="font-medium text-left line-clamp-1 text-gray-900 dark:text-white">{idx + 1}. {q.title}</span>
                {scores[q.id] === 'pass' ? (
                  <span className="flex items-center gap-1 text-sm font-bold text-green-500"><Check className="w-4 h-4"/> Pass</span>
                ) : (
                  <span className="flex items-center gap-1 text-sm font-bold text-red-500"><X className="w-4 h-4"/> Fail</span>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleStart}
            className="flex items-center justify-center w-full gap-2 py-4 text-lg font-bold text-gray-700 bg-gray-100 dark:bg-gray-800 dark:text-gray-200 transition-colors rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <RotateCcw className="w-5 h-5" /> Try Again
          </button>
        </motion.div>
      </div>
    );
  }

  const currentQ = sessionQuestions[currentIdx];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between p-4 bg-white border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800 rounded-2xl">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Question {currentIdx + 1} of {sessionQuestions.length}
          </p>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 text-xs font-semibold text-purple-600 bg-purple-100 rounded-full dark:bg-purple-900/30 dark:text-purple-400">
              {currentQ.difficulty}
            </span>
          </div>
        </div>
        <InterviewTimer durationMinutes={30} onTimeUp={handleTimeUp} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentQ.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="p-8 bg-white border border-gray-200 shadow-md dark:bg-gray-900 dark:border-gray-800 rounded-3xl"
        >
          <h2 className="mb-6 text-3xl font-bold text-gray-900 dark:text-white leading-tight">
            {currentQ.title}
          </h2>
          <div className="prose max-w-none dark:prose-invert mb-8">
            <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
              {currentQ.problemStatement}
            </p>
          </div>

          <div className="p-6 mb-8 bg-blue-50 border border-blue-100 rounded-2xl dark:bg-blue-900/10 dark:border-blue-900/30">
            <h4 className="mb-2 font-semibold text-blue-900 dark:text-blue-400">Ideal Answer Outline</h4>
            <p className="text-blue-800 dark:text-blue-300">{currentQ.bestAnswer}</p>
          </div>

          <div className="flex flex-col gap-4 mt-8 pt-8 border-t border-gray-100 dark:border-gray-800 sm:flex-row">
            <button
              onClick={() => handleScore('fail')}
              className="flex-1 py-4 text-lg font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-400 transition-colors"
            >
              Needs Improvement
            </button>
            <button
              onClick={() => handleScore('pass')}
              className="flex-1 py-4 text-lg font-semibold text-green-600 bg-green-50 border border-green-200 rounded-xl hover:bg-green-100 dark:bg-green-900/20 dark:border-green-900/50 dark:text-green-400 transition-colors"
            >
              Nailed It
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
