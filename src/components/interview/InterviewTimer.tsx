'use client';

import React, { useEffect, useState } from 'react';
import { Timer, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function InterviewTimer({ durationMinutes, onTimeUp }: { durationMinutes: number, onTimeUp: () => void }) {
  const [timeLeft, setTimeLeft] = useState(durationMinutes * 60);

  useEffect(() => {
    if (timeLeft <= 0) {
      onTimeUp();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, onTimeUp]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  
  const progress = (timeLeft / (durationMinutes * 60)) * 100;
  const isWarning = timeLeft < 60; // Less than 1 minute

  return (
    <div className="flex flex-col items-center">
      <div className={`flex items-center gap-2 font-mono text-2xl font-bold ${isWarning ? 'text-red-500 animate-pulse' : 'text-gray-800 dark:text-gray-200'}`}>
        {isWarning ? <AlertCircle className="w-6 h-6" /> : <Timer className="w-6 h-6" />}
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </div>
      <div className="w-48 h-2 mt-2 overflow-hidden bg-gray-200 rounded-full dark:bg-gray-800">
        <motion.div 
          className={`h-full ${isWarning ? 'bg-red-500' : 'bg-blue-500'}`}
          initial={{ width: '100%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1, ease: 'linear' }}
        />
      </div>
    </div>
  );
}
