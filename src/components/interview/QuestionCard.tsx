'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock, TrendingUp, CheckCircle, Building } from 'lucide-react';
import { Question } from '@/types/interview';
import { useInterviewStore } from '@/hooks/interview/useInterviewStore';
import BookmarkButton from './BookmarkButton';

export default function QuestionCard({ question }: { question: Question }) {
  const { stats } = useInterviewStore();
  const isCompleted = stats.completedQuestions.includes(question.id);

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case 'easy': return 'text-green-500 bg-green-500/10 border-green-500/20';
      case 'medium': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      case 'hard': return 'text-red-500 bg-red-500/10 border-red-500/20';
      default: return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.015, y: -2 }}
      className="relative flex flex-col p-6 overflow-hidden transition-all duration-300 border shadow-lg bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-gray-200/60 dark:border-gray-700/50 rounded-[1.5rem] hover:shadow-2xl hover:border-blue-500/50 dark:hover:border-blue-400/50 group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getDifficultyColor(question.difficulty)}`}>
            {question.difficulty}
          </span>
          <span className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 dark:text-gray-200 dark:bg-gray-800/80 rounded-full border border-gray-200/50 dark:border-gray-700/50">
            {question.topic.replace('-', ' ')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isCompleted && (
            <CheckCircle className="w-5 h-5 text-green-500" />
          )}
          <BookmarkButton questionId={question.id} />
        </div>
      </div>

      <Link href={`/interview/question/${question.id}`} className="flex-1">
        <h3 className="mb-2 text-xl font-bold tracking-tight text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {question.title}
        </h3>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-2">
          {question.problemStatement}
        </p>

        <div className="flex items-center gap-4 mt-auto text-sm font-medium text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>{question.estimatedTime}m</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="w-4 h-4 text-orange-500" />
            <span>{question.frequency}% freq</span>
          </div>
          <div className="flex items-center gap-1">
            <Building className="w-4 h-4" />
            <span className="line-clamp-1">{question.companies.slice(0, 2).join(', ')}</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
