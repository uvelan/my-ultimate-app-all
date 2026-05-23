'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getQuestionById, getQuestionTitles } from '@/actions/interview';
import { generateQuestionWithAI } from '@/actions/ai';
import toast from 'react-hot-toast';
import { useInterviewStore } from '@/hooks/interview/useInterviewStore';
import BookmarkButton from '@/components/interview/BookmarkButton';
import CompleteButton from '@/components/interview/CompleteButton';
import CodePlayground from '@/components/interview/CodePlayground';
import MCQCard from '@/components/interview/MCQCard';
import RegenerateAIModal from '@/components/interview/RegenerateAIModal';
import TTSButton from '@/components/interview/TTSButton';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  CheckCircle2,
  Lightbulb,
  AlertTriangle,
  Code,
  ArrowLeft,
  Loader2,
  Target,
  BookOpen,
  TrendingUp,
  Cpu,
  Zap,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';

type Params = Promise<{ id: string }>;

const TABS = [
  { id: 'problem', label: 'Problem', icon: BookOpen },
  { id: 'explanation', label: 'Deep Dive', icon: Cpu },
  { id: 'answers', label: 'Answer Evolution', icon: TrendingUp },
  { id: 'code', label: 'Code', icon: Code },
  { id: 'quiz', label: 'Quiz', icon: Zap },
] as const;

type TabId = typeof TABS[number]['id'];

const MarkdownContent = ({ children }: { children: string }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      h1: ({ children }) => <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-6 mb-3">{children}</h1>,
      h2: ({ children }) => <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-5 mb-2">{children}</h2>,
      h3: ({ children }) => <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-400 mt-4 mb-2">{children}</h3>,
      h4: ({ children }) => <h4 className="text-base font-semibold text-gray-800 dark:text-gray-200 mt-3 mb-1">{children}</h4>,
      p: ({ children }) => <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3">{children}</p>,
      ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-3 text-gray-700 dark:text-gray-300">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-3 text-gray-700 dark:text-gray-300">{children}</ol>,
      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
      strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>,
      em: ({ children }) => <em className="italic text-gray-600 dark:text-gray-400">{children}</em>,
      code: ({ children, className }) => {
        const isBlock = className?.includes('language-');
        if (isBlock) {
          return (
            <pre className="bg-gray-950 text-green-400 p-4 rounded-xl overflow-x-auto text-sm my-4 border border-gray-800">
              <code>{children}</code>
            </pre>
          );
        }
        return <code className="bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>;
      },
      blockquote: ({ children }) => (
        <blockquote className="border-l-4 border-blue-500 pl-4 my-3 text-gray-600 dark:text-gray-400 italic">{children}</blockquote>
      ),
      table: ({ children }) => (
        <div className="overflow-x-auto my-4">
          <table className="w-full border-collapse text-sm">{children}</table>
        </div>
      ),
      th: ({ children }) => <th className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">{children}</th>,
      td: ({ children }) => <td className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-gray-700 dark:text-gray-300">{children}</td>,
      hr: () => <hr className="border-gray-200 dark:border-gray-800 my-6" />,
    }}
  >
    {children}
  </ReactMarkdown>
);

export default function QuestionDetailPage({ params }: { params: Params }) {
  const [question, setQuestion] = useState<any>(null);
  const [allTitles, setAllTitles] = useState<{id: string, title: string}[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isRegenModalOpen, setIsRegenModalOpen] = useState(false);
  
  const [activeTab, setActiveTab] = useState<TabId>('problem');
  const [playingTTSField, setPlayingTTSField] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      const resolvedParams = await params;
      const [qData, titlesData] = await Promise.all([
        getQuestionById(resolvedParams.id),
        getQuestionTitles()
      ]);
      setQuestion(qData);
      setAllTitles(titlesData || []);
      setLoading(false);
    }
    loadData();
  }, [params]);

  const findMatchingQuestionId = (fq: string) => {
    const fqLower = fq.toLowerCase().replace(/\?$/, '').trim();
    const match = allTitles.find(t => {
      const tLower = t.title.toLowerCase().replace(/\?$/, '').trim();
      return fqLower === tLower || (tLower.length > 8 && fqLower.includes(tLower));
    });
    return match?.id || null;
  };

  const { stats, markQuestionCompleted } = useInterviewStore();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-gray-500 text-sm">Loading question...</p>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-500 text-lg">Question not found.</p>
        <Link href="/interview/explore" className="text-blue-600 text-sm mt-2 inline-block hover:underline">Back to Explore</Link>
      </div>
    );
  }

  const isCompleted = stats.completedQuestions.includes(question.id);
  const visibleTabs = TABS.filter(t => {
    if (t.id === 'code') return !!question.codeSnippet;
    if (t.id === 'quiz') return !!(question.mcqs?.length);
    if (t.id === 'answers') return !!(question.bestAnswer || question.alternativeAnswer);
    return true;
  });

  const getDiffColor = (d: string) => {
    switch (d?.toLowerCase()) {
      case 'easy': return 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-900/50';
      case 'medium': return 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-900/50';
      case 'hard': return 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-900/50';
      default: return 'text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-400 dark:bg-gray-800';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24 md:pb-8">
      {/* Back nav */}
      <Link href="/interview/explore" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Explore
      </Link>

      {/* Header card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 bg-white/80 backdrop-blur-xl border border-gray-200/60 shadow-lg dark:bg-gray-900/80 dark:border-gray-800/60 rounded-[1.5rem]"
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getDiffColor(question.difficulty)}`}>
                {question.difficulty}
              </span>
              <span className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100/80 dark:text-gray-200 dark:bg-gray-800/80 rounded-full border border-gray-200/50 dark:border-gray-700/50 capitalize">
                {question.topic?.replace(/-/g, ' ')}
              </span>
              {question.estimatedTime && (
                <span className="px-3 py-1 text-xs font-medium text-orange-600 bg-orange-50 rounded-full border border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-900/50">
                  ⏱ {question.estimatedTime} mins
                </span>
              )}
              {question.frequency && (
                <span className="px-3 py-1 text-xs font-medium text-purple-600 bg-purple-50 rounded-full border border-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-900/50">
                  🔥 {question.frequency}% asked
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 md:text-3xl dark:text-white leading-snug">
              {question.title}
            </h1>
            {question.tags?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {question.tags.map((tag: string) => (
                  <span key={tag} className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-md font-mono">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            {question.companies?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {question.companies.map((c: string) => (
                  <span key={c} className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md">
                    🏢 {c}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setIsRegenModalOpen(true)}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/40 transition-colors"
              title="Regenerate with AI"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <BookmarkButton questionId={question.id} />
            <CompleteButton questionId={question.id} showText={true} />
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex overflow-x-auto hide-scrollbar gap-1 bg-gray-100/80 dark:bg-gray-900/60 p-1.5 rounded-2xl border border-gray-200/50 dark:border-gray-800/50 backdrop-blur-xl">
        {visibleTabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap rounded-xl transition-all flex-1 justify-center ${
                activeTab === tab.id
                  ? 'bg-white text-blue-600 shadow-md dark:bg-gray-800 dark:text-blue-400'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        <AnimatePresence mode="wait">

          {/* Problem Tab */}
          {activeTab === 'problem' && (
            <motion.div key="problem" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="p-6 bg-white/80 backdrop-blur-xl border border-gray-200/60 shadow-sm dark:bg-gray-900/80 dark:border-gray-800/60 rounded-[1.5rem]">
                <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white mb-3">
                  <BookOpen className="w-5 h-5 text-blue-600" /> Problem Statement
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base">{question.problemStatement}</p>
              </div>

              {question.expectation && (
                <div className="p-5 bg-blue-50/80 dark:bg-blue-900/20 border border-blue-200/60 dark:border-blue-800/60 rounded-[1.5rem] backdrop-blur-xl">
                  <h4 className="flex items-center gap-2 font-bold text-blue-900 dark:text-blue-300 mb-2">
                    <Target className="w-4 h-4" /> Interviewer Expectation
                  </h4>
                  <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">{question.expectation}</p>
                </div>
              )}

              {question.realWorldUsage && (
                <div className="p-5 bg-white/80 backdrop-blur-xl border border-gray-200/60 dark:bg-gray-900/80 dark:border-gray-800/60 rounded-[1.5rem]">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">🌍 Real-World Usage</h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{question.realWorldUsage}</p>
                </div>
              )}

              {question.followUpQuestions?.length > 0 && (
                <div className="p-5 bg-white/80 backdrop-blur-xl border border-gray-200/60 dark:bg-gray-900/80 dark:border-gray-800/60 rounded-[1.5rem]">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white mb-3">💬 Follow-Up Questions</h3>
                  <ul className="space-y-2">
                    {question.followUpQuestions.map((q: string, i: number) => {
                      const matchedId = findMatchingQuestionId(q);
                      return (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                          <span className="text-blue-500 font-bold mt-0.5 shrink-0">Q{i + 1}.</span> 
                          {matchedId ? (
                            <Link 
                              href={`/interview/question/${matchedId}`}
                              className="text-blue-600 dark:text-blue-400 hover:underline hover:text-blue-800 dark:hover:text-blue-300 transition-colors cursor-pointer"
                            >
                              {q}
                            </Link>
                          ) : (
                            <span>{q}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </motion.div>
          )}

          {/* Deep Dive Tab */}
          {activeTab === 'explanation' && (
            <motion.div key="explanation" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="p-6 bg-white/80 backdrop-blur-xl border border-gray-200/60 shadow-sm dark:bg-gray-900/80 dark:border-gray-800/60 rounded-[1.5rem]">
                <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white mb-4">
                  <div className="flex items-center">
                    <Lightbulb className="w-5 h-5 text-yellow-500 mr-2" /> 
                    Deep Dive Explanation
                    <TTSButton 
                      containerId={`tts-content-${question.id}-explanation`}
                      onPlayStateChange={(isPlaying) => setPlayingTTSField(isPlaying ? 'explanation' : null)}
                    />
                  </div>
                </h3>
                <div 
                  id={`tts-content-${question.id}-explanation`}
                  className={`prose-sm transition-all duration-500`}
                >
                  <MarkdownContent>{question.explanation || '_No detailed explanation available. Use AI to regenerate._'}</MarkdownContent>
                </div>
              </div>

              {question.commonMistakes?.length > 0 && (
                <div className="p-5 bg-white/80 backdrop-blur-xl border border-gray-200/60 dark:bg-gray-900/80 dark:border-gray-800/60 rounded-[1.5rem]">
                  <h3 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white mb-4">
                    <AlertTriangle className="w-5 h-5 text-orange-500" /> Common Mistakes & Bugs
                  </h3>
                  <ul className="space-y-3">
                    {question.commonMistakes.map((m: string, i: number) => (
                      <li key={i} className="flex items-start gap-3 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/30 rounded-xl text-sm text-orange-900 dark:text-orange-300">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-orange-500" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}

          {/* Answer Evolution Tab */}
          {activeTab === 'answers' && (
            <motion.div key="answers" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {[
                { label: '🎓 Best Answer (Quick Revision)', content: question.bestAnswer, field: 'bestAnswer', color: 'green' },
                { label: '⚡ Alternative Answer', content: question.alternativeAnswer, field: 'alternativeAnswer', color: 'blue' },
              ].filter(s => s.content).map(section => (
                <div key={section.label} className={`p-5 bg-white/80 backdrop-blur-xl border border-gray-200/60 dark:bg-gray-900/80 dark:border-gray-800/60 rounded-[1.5rem]`}>
                  <h3 className="flex items-center text-base font-bold text-gray-900 dark:text-white mb-3">
                    {section.label}
                    <TTSButton 
                      containerId={`tts-content-${question.id}-${section.field}`}
                      onPlayStateChange={(isPlaying) => setPlayingTTSField(isPlaying ? section.field : null)}
                    />
                  </h3>
                  <div 
                    id={`tts-content-${question.id}-${section.field}`}
                    className={`prose-sm transition-all duration-500`}
                  >
                    <MarkdownContent>{section.content}</MarkdownContent>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {/* Code Tab */}
          {activeTab === 'code' && question.codeSnippet && (
            <motion.div key="code" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="p-5 bg-white/80 backdrop-blur-xl border border-gray-200/60 dark:bg-gray-900/80 dark:border-gray-800/60 rounded-[1.5rem]">
                <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white mb-4">
                  <Code className="w-5 h-5 text-blue-600" /> Code Examples
                </h3>
                {question.codeSnippet.beginner && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">📘 Beginner</h4>
                    <pre className="bg-gray-950 text-green-400 p-4 rounded-xl overflow-x-auto text-sm border border-gray-800">
                      <code>{question.codeSnippet.beginner}</code>
                    </pre>
                  </div>
                )}
                {question.codeSnippet.production && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">🏭 Production-Ready</h4>
                    <CodePlayground initialCode={question.codeSnippet.production} language={question.codeSnippet.language || 'javascript'} />
                  </div>
                )}
                {/* Fallback: old format */}
                {!question.codeSnippet.production && question.codeSnippet.code && (
                  <CodePlayground initialCode={question.codeSnippet.code} language={question.codeSnippet.language || 'javascript'} />
                )}
                {question.codeSnippet.antiPattern && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-red-500 uppercase tracking-wider">❌ Anti-Pattern</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-normal normal-case">(What NOT to do — and why)</span>
                    </div>
                    <pre className="bg-gray-950 text-amber-300 p-4 rounded-xl overflow-x-auto text-sm border-l-4 border-red-500">
                      <code>{question.codeSnippet.antiPattern}</code>
                    </pre>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Quiz Tab */}
          {activeTab === 'quiz' && question.mcqs?.length > 0 && (
            <motion.div key="quiz" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="mb-2">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">⚡ Knowledge Check</h3>
                <p className="mt-1 text-sm text-gray-500">Test your understanding with these FAANG-style MCQs.</p>
              </div>
              {question.mcqs.map((mcq: any) => (
                <MCQCard key={mcq.id} mcq={mcq} />
              ))}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      <RegenerateAIModal 
        isOpen={isRegenModalOpen}
        onClose={() => setIsRegenModalOpen(false)}
        questionId={question.id}
        questionTitle={question.title}
      />
    </div>
  );
}
