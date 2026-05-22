'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FlashcardType } from '@/types/interview';
import { Check, X, RotateCw } from 'lucide-react';

interface FlashcardProps {
  card: FlashcardType;
  onNext: (knewAnswer: boolean) => void;
}

export default function Flashcard({ card, onNext }: FlashcardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto h-[500px]">
      <motion.div
        className="relative w-full h-full cursor-pointer perspective-1000"
        onClick={handleFlip}
        initial={false}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: 'spring', stiffness: 260, damping: 20 }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Front */}
        <div 
          className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-white/90 backdrop-blur-xl border border-gray-200/50 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] dark:bg-gray-900/90 dark:border-gray-700/50 rounded-[2rem]"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <span className="absolute px-3 py-1 text-sm font-medium text-blue-600 bg-blue-100 rounded-full top-6 left-6 dark:bg-blue-900/30 dark:text-blue-400">
            {card.topic}
          </span>
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white">
            {card.front}
          </h2>
          <div className="absolute flex items-center gap-2 text-gray-400 bottom-6">
            <RotateCw className="w-5 h-5" />
            <span>Tap to flip</span>
          </div>
        </div>

        {/* Back */}
        <div 
          className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-gradient-to-br from-blue-50/90 to-indigo-50/90 backdrop-blur-xl border border-blue-200/50 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] dark:from-blue-950/80 dark:to-indigo-950/80 dark:border-blue-800/50 rounded-[2rem]"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <h2 className="text-2xl font-medium leading-relaxed text-center text-gray-800 dark:text-gray-100">
            {card.back}
          </h2>
        </div>
      </motion.div>

      {/* Controls */}
      <motion.div 
        className="flex gap-4 mt-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: isFlipped ? 1 : 0, y: isFlipped ? 0 : 20 }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setIsFlipped(false); onNext(false); }}
          disabled={!isFlipped}
          className="flex items-center gap-2 px-6 py-3 font-semibold text-red-600 transition-colors bg-red-100 rounded-xl hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
        >
          <X className="w-5 h-5" /> Still Learning
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setIsFlipped(false); onNext(true); }}
          disabled={!isFlipped}
          className="flex items-center gap-2 px-6 py-3 font-semibold text-green-600 transition-colors bg-green-100 rounded-xl hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
        >
          <Check className="w-5 h-5" /> I Knew This
        </button>
      </motion.div>
    </div>
  );
}
