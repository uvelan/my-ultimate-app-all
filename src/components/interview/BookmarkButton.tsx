'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Bookmark } from 'lucide-react';
import { useInterviewStore } from '@/hooks/interview/useInterviewStore';

export default function BookmarkButton({ questionId }: { questionId: string }) {
  const { stats, toggleBookmark } = useInterviewStore();
  const isBookmarked = stats.bookmarkedQuestions.includes(questionId);

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleBookmark(questionId);
      }}
      className={`p-2 rounded-full transition-colors ${
        isBookmarked 
          ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' 
          : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      <Bookmark className={`w-5 h-5 ${isBookmarked ? 'fill-current' : ''}`} />
    </motion.button>
  );
}
