'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, Loader2 } from 'lucide-react';
import { getQuestions, getTopics } from '@/actions/interview';
import QuestionCard from '@/components/interview/QuestionCard';
import TopicSidebar from '@/components/interview/TopicSidebar';

export default function ExplorePage() {
  const [questions, setQuestions] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<string | null>(null);
  const [companyFilter, setCompanyFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const [qs, ts] = await Promise.all([getQuestions(), getTopics()]);
      setQuestions(qs);
      setTopics(ts);
      setLoading(false);
    }
    loadData();
  }, []);

  const uniqueCompanies = useMemo(() => {
    const all = questions.flatMap(q => q.companies || []);
    return Array.from(new Set(all)).filter(Boolean).sort();
  }, [questions]);
  
  const uniqueTags = useMemo(() => {
    const all = questions.flatMap(q => q.tags || []);
    return Array.from(new Set(all)).filter(Boolean).sort();
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const titleMatches = q.title?.toLowerCase().includes(searchQuery.toLowerCase());
      const tagsMatch = q.tags?.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesSearch = titleMatches || tagsMatch;
      
      const matchesTopic = selectedTopic ? q.topic === selectedTopic : true;
      const matchesDifficulty = difficultyFilter ? q.difficulty?.toLowerCase() === difficultyFilter.toLowerCase() : true;
      const matchesCompany = companyFilter ? (q.companies || []).includes(companyFilter) : true;
      const matchesTag = tagFilter ? (q.tags || []).includes(tagFilter) : true;
      
      return matchesSearch && matchesTopic && matchesDifficulty && matchesCompany && matchesTag;
    });
  }, [questions, searchQuery, selectedTopic, difficultyFilter, companyFilter, tagFilter]);

  return (
    <div className="flex flex-col md:flex-row gap-8 pb-20 md:pb-0">
      <div className="hidden md:block">
        <TopicSidebar topics={topics} selectedTopic={selectedTopic} onSelectTopic={setSelectedTopic} />
      </div>

      <div className="flex-1 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search questions, topics, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl dark:bg-gray-900 dark:border-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-5 h-5 text-gray-500 shrink-0" />
            <select 
              value={difficultyFilter || ''}
              onChange={(e) => setDifficultyFilter(e.target.value || null)}
              className="py-2.5 px-4 bg-white border border-gray-200 rounded-xl dark:bg-gray-900 dark:border-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-900 dark:text-white max-w-[130px] truncate"
            >
              <option value="">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <select 
              value={companyFilter || ''}
              onChange={(e) => setCompanyFilter(e.target.value || null)}
              className="py-2.5 px-4 bg-white border border-gray-200 rounded-xl dark:bg-gray-900 dark:border-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-900 dark:text-white max-w-[130px] truncate"
            >
              <option value="">All Companies</option>
              {uniqueCompanies.map(c => <option key={c as string} value={c as string}>{c as string}</option>)}
            </select>
            <select 
              value={tagFilter || ''}
              onChange={(e) => setTagFilter(e.target.value || null)}
              className="py-2.5 px-4 bg-white border border-gray-200 rounded-xl dark:bg-gray-900 dark:border-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-900 dark:text-white max-w-[130px] truncate"
            >
              <option value="">All Tags</option>
              {uniqueTags.map(t => <option key={t as string} value={t as string}>{t as string}</option>)}
            </select>
          </div>
        </div>

        {/* Mobile Topic Selector (Visible only on small screens) */}
        <div className="md:hidden flex overflow-x-auto pb-2 gap-2 hide-scrollbar">
          <button 
            onClick={() => setSelectedTopic(null)}
            className={`flex-none px-5 py-2 text-sm font-semibold rounded-full transition-all ${!selectedTopic ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md' : 'bg-white/60 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300 border border-gray-200 dark:border-gray-700 backdrop-blur-md hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            All
          </button>
          {topics.map(t => (
            <button 
              key={t.id}
              onClick={() => setSelectedTopic(t.id)}
              className={`flex-none px-5 py-2 text-sm font-semibold rounded-full capitalize transition-all ${selectedTopic === t.id ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md' : 'bg-white/60 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300 border border-gray-200 dark:border-gray-700 backdrop-blur-md hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              {t.name.replace('-', ' ')}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {loading ? (
            <div className="col-span-full py-20 flex justify-center text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : (
            <AnimatePresence>
              {filteredQuestions.map((q) => (
                <motion.div
                  key={q.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <QuestionCard question={q} />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          {!loading && filteredQuestions.length === 0 && (
            <div className="col-span-full py-20 text-center text-gray-500 dark:text-gray-400">
              <p className="text-lg font-medium">No questions found</p>
              <p className="text-sm">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
