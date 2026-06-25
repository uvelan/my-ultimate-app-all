'use client';

import React, { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { useInterviewStore } from '@/hooks/interview/useInterviewStore';
import { toggleQuestionComplete } from '@/actions/goal';
import { toast } from 'react-hot-toast';

export default function CompleteButton({ questionId, showText = false }: { questionId: string, showText?: boolean }) {
  const { stats, toggleQuestionCompleted } = useInterviewStore();
  const isCompleted = stats.completedQuestions.includes(questionId);
  const [loading, setLoading] = useState(false);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigating if wrapped in a link
    e.stopPropagation();

    if (loading) return;
    setLoading(true);

    // Optimistic UI update
    toggleQuestionCompleted(questionId);

    try {
      await toggleQuestionComplete(questionId);
      if (!isCompleted) {
        toast.success("Marked as complete!");
      }
    } catch (error) {
      // Revert optimistic update
      toggleQuestionCompleted(questionId);
      toast.error('Failed to update progress');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (showText) {
    return (
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
          isCompleted
            ? 'text-emerald-700 bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-900/50 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
            : 'text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:shadow-lg hover:shadow-green-500/30'
        }`}
      >
        <CheckCircle className={`w-4 h-4 ${isCompleted ? 'fill-green-100 dark:fill-green-900/30' : ''}`} /> 
        {isCompleted ? 'Completed' : 'Mark Complete'}
      </button>
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`p-2 transition-all rounded-full ${
        isCompleted
          ? 'text-green-500 bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20'
          : 'text-gray-400 bg-surface-2 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
      title={isCompleted ? "Mark as incomplete" : "Mark as complete"}
    >
      <CheckCircle className={`w-5 h-5 ${isCompleted ? 'fill-green-100 dark:fill-green-900/30' : ''}`} />
    </button>
  );
}
