'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Flashcard from '@/components/interview/Flashcard';
import { getQuestions } from '@/actions/interview';
import { Layers, RotateCcw, Loader2 } from 'lucide-react';

export default function FlashcardsPage() {
  const [deck, setDeck] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchDeck = async () => {
    setLoading(true);
    const questions = await getQuestions();
    const randomQs = questions.sort(() => 0.5 - Math.random()).slice(0, 10);
    const generatedDeck = randomQs.map((q: any) => ({
      id: q.id,
      topic: q.topic,
      front: q.problemStatement || q.title, // Use full problem statement, fallback to title
      back: q.bestAnswer || q.explanation || "Please check the full explanation."
    }));
    setDeck(generatedDeck);
    setCurrentIndex(0);
    setCompleted(false);
    setLoading(false);
  };

  useEffect(() => {
    fetchDeck();
  }, []);

  const handleNext = (knewAnswer: boolean) => {
    // In a real app, 'knewAnswer' would trigger spaced repetition logic
    if (currentIndex < deck.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setCompleted(true);
    }
  };

  const handleRestart = () => {
    fetchDeck();
  };

  if (loading) {
    return <div className="flex justify-center items-center h-[50vh]"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  if (deck.length === 0) {
    return <div className="text-center py-20 text-gray-500">No questions found to generate flashcards.</div>;
  }

  if (completed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md p-8 bg-white border border-gray-200 shadow-xl dark:bg-gray-900 dark:border-gray-800 rounded-3xl"
        >
          <div className="w-20 h-20 mx-auto mb-6 text-green-500 bg-green-100 rounded-full dark:bg-green-900/30 flex items-center justify-center">
            <Layers className="w-10 h-10" />
          </div>
          <h2 className="mb-4 text-3xl font-bold text-gray-900 dark:text-white">Deck Complete!</h2>
          <p className="mb-8 text-gray-500 dark:text-gray-400">
            You went through all {deck.length} cards in this session. Great job!
          </p>
          <button
            onClick={handleRestart}
            className="flex items-center justify-center w-full gap-2 py-4 text-lg font-bold text-white transition-colors bg-blue-600 rounded-xl hover:bg-blue-700"
          >
            <RotateCcw className="w-5 h-5" /> Review Again
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Flashcard Review</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Card {currentIndex + 1} of {deck.length}
        </p>
        <div className="w-full max-w-md h-2 mx-auto mt-4 overflow-hidden bg-gray-200 rounded-full dark:bg-gray-800">
          <motion.div 
            className="h-full bg-blue-600"
            initial={{ width: 0 }}
            animate={{ width: `${((currentIndex) / deck.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="w-full"
          >
            <Flashcard card={deck[currentIndex]} onNext={handleNext} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
