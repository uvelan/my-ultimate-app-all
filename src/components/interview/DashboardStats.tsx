'use client';

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Flame, Star, Target, CheckCircle2 } from 'lucide-react';
import { useInterviewStore } from '@/hooks/interview/useInterviewStore';

export default function DashboardStats() {
  const { stats, updateStreak } = useInterviewStore();

  useEffect(() => {
    updateStreak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = [
    { label: 'Current Streak', value: `${stats.streak} Days`, icon: Flame, color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { label: 'Experience (XP)', value: stats.xp.toLocaleString(), icon: Star, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
    { label: 'Completed', value: stats.completedQuestions.length, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center p-6 bg-white border shadow-sm dark:bg-gray-900 border-gray-100/50 dark:border-gray-800 rounded-2xl"
          >
            <div className={`p-4 rounded-xl ${item.bg} ${item.color} mr-4`}>
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{item.label}</p>
              <h4 className="text-2xl font-bold text-gray-900 dark:text-white">{item.value}</h4>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
