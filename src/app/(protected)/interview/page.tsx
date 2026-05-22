'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import DashboardStats from '@/components/interview/DashboardStats';
import { getQuestions, getTopics } from '@/actions/interview';
import { ArrowRight, Code, Terminal, Database } from 'lucide-react';

export default function InterviewDashboard() {
  const [recommendedQuestions, setRecommendedQuestions] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [qs, ts] = await Promise.all([getQuestions(), getTopics()]);
        setRecommendedQuestions(qs.slice(0, 3));
        setTopics(ts);
      } catch (error) {
        console.error("Failed to fetch dashboard data", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="space-y-8 pb-20 md:pb-0">
      <motion.section 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl"
      >
        <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
          <Terminal className="w-64 h-64 text-white" />
        </div>
        <div className="relative p-8 md:p-12 z-10">
          <h1 className="mb-4 text-4xl font-extrabold text-white md:text-5xl">
            Nail your next <br className="hidden md:block"/> tech interview.
          </h1>
          <p className="max-w-xl mb-8 text-lg text-blue-100">
            Practice real-world questions from top tech companies. Track your progress, build your streak, and level up your engineering skills.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link 
              href="/interview/explore"
              className="px-6 py-3 font-semibold text-blue-900 bg-white rounded-xl hover:bg-gray-50 transition-colors"
            >
              Start Practicing
            </Link>
            <Link 
              href="/interview/mock"
              className="px-6 py-3 font-semibold text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl transition-colors"
            >
              Take Mock Interview
            </Link>
          </div>
        </div>
      </motion.section>

      <DashboardStats />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Recommended for you</h2>
            <Link href="/interview/explore" className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid gap-4">
            {loading ? (
              <div className="p-4 text-center text-gray-500">Loading recommendations...</div>
            ) : recommendedQuestions.length === 0 ? (
              <div className="p-4 text-center text-gray-500 border border-dashed border-gray-200 rounded-2xl dark:border-gray-800">
                No questions found. Upload questions in the Manage tab!
              </div>
            ) : (
              recommendedQuestions.map((q, i) => (
                <motion.div 
                  key={q.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center justify-between p-4 bg-white border border-gray-100 shadow-sm dark:bg-gray-900 dark:border-gray-800 rounded-2xl hover:border-blue-500 transition-colors group"
                >
                  <div>
                    <div className="flex gap-2 mb-1">
                      <span className="px-2 py-0.5 text-xs font-medium text-purple-600 bg-purple-100 rounded dark:bg-purple-900/30 dark:text-purple-400">
                        {q.difficulty}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                        {q.topic.replace('-', ' ')} • {q.estimatedTime}m
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">
                      {q.title}
                    </h3>
                  </div>
                  <Link 
                    href={`/interview/question/${q.id}`}
                    className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 bg-gray-50 dark:bg-gray-800 rounded-xl"
                  >
                    <ArrowRight className="w-5 h-5" />
                  </Link>
                </motion.div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Topics</h2>
          <div className="grid gap-3">
            {topics.length === 0 && !loading && (
              <div className="p-4 text-sm text-center text-gray-500 border border-dashed border-gray-200 rounded-xl dark:border-gray-800">
                No topics available.
              </div>
            )}
            {topics.slice(0, 5).map((topic, i) => (
              <Link 
                key={topic.id}
                href={`/interview/explore?topic=${topic.id}`}
                className="flex items-center justify-between p-4 bg-white border border-gray-100 shadow-sm dark:bg-gray-900 dark:border-gray-800 rounded-xl hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                  <div className="p-2 bg-gray-100 rounded-lg dark:bg-gray-800">
                    <Database className="w-5 h-5" />
                  </div>
                  <span className="font-medium capitalize">{topic.name || topic.topicId?.replace('-', ' ')}</span>
                </div>
                <span className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full dark:bg-gray-800 dark:text-gray-400">
                  {topic.count}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
