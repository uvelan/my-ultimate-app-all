'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Circle } from 'lucide-react';
import { MCQType } from '@/types/interview';

export default function MCQCard({ mcq }: { mcq: MCQType }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const isCorrect = selected === mcq.correctAnswerIndex;

  const handleSubmit = () => {
    if (selected !== null) setSubmitted(true);
  };

  const getOptionStyle = (idx: number) => {
    if (!submitted) {
      if (selected === idx) {
        return 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-500/40 shadow-md';
      }
      return 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 hover:border-blue-400 hover:bg-blue-50/40 dark:hover:border-blue-500 dark:hover:bg-blue-900/20';
    }
    if (idx === mcq.correctAnswerIndex) {
      return 'border-green-500 bg-green-50 dark:bg-green-900/30 shadow-sm';
    }
    if (selected === idx && !isCorrect) {
      return 'border-red-400 bg-red-50 dark:bg-red-900/30 shadow-sm';
    }
    return 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/30 opacity-50';
  };

  const getOptionTextStyle = (idx: number) => {
    if (!submitted) {
      if (selected === idx) return 'text-blue-700 dark:text-blue-300 font-medium';
      return 'text-gray-800 dark:text-gray-200';
    }
    if (idx === mcq.correctAnswerIndex) return 'text-green-800 dark:text-green-200 font-semibold';
    if (selected === idx && !isCorrect) return 'text-red-800 dark:text-red-200';
    return 'text-gray-500 dark:text-gray-500';
  };

  const getLetterBadge = (idx: number) => {
    const letters = ['A', 'B', 'C', 'D'];
    let badgeStyle = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
    if (!submitted && selected === idx) badgeStyle = 'bg-blue-500 text-white';
    if (submitted && idx === mcq.correctAnswerIndex) badgeStyle = 'bg-green-500 text-white';
    if (submitted && selected === idx && !isCorrect) badgeStyle = 'bg-red-500 text-white';
    return (
      <span className={`shrink-0 w-7 h-7 flex items-center justify-center text-xs font-bold rounded-lg transition-colors ${badgeStyle}`}>
        {letters[idx] ?? idx + 1}
      </span>
    );
  };

  return (
    <div className="p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm rounded-[1.5rem]">
      <div className="flex items-start gap-3 mb-5">
        <span className="shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center bg-blue-600 text-white text-xs font-bold rounded-full">Q</span>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white leading-snug">
          {mcq.question}
        </h3>
      </div>

      <div className="space-y-3">
        {mcq.options.map((option, idx) => (
          <div
            key={idx}
            onClick={() => !submitted && setSelected(idx)}
            className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 ${getOptionStyle(idx)} ${!submitted ? 'hover:scale-[1.01]' : ''}`}
          >
            {getLetterBadge(idx)}
            <span className={`flex-1 text-sm leading-snug ${getOptionTextStyle(idx)}`}>
              {option}
            </span>
            {submitted && idx === mcq.correctAnswerIndex && (
              <CheckCircle2 className="shrink-0 w-5 h-5 text-green-500" />
            )}
            {submitted && selected === idx && !isCorrect && (
              <XCircle className="shrink-0 w-5 h-5 text-red-500" />
            )}
          </div>
        ))}
      </div>

      {!submitted ? (
        <button
          onClick={handleSubmit}
          disabled={selected === null}
          className="w-full py-3 mt-6 font-semibold text-white transition-all bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {selected === null ? 'Select an answer…' : 'Check Answer'}
        </button>
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5"
          >
            <div className={`p-4 rounded-xl border ${isCorrect ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900/50' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/50'}`}>
              <div className="flex items-center gap-2 mb-2">
                {isCorrect
                  ? <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  : <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                }
                <h4 className={`font-bold text-sm ${isCorrect ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                  {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
                </h4>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {mcq.explanation}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
