'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { getQuestions, deleteQuestion, bulkDeleteQuestions, deleteAllQuestions, bulkUploadQuestions } from '@/actions/interview';
import { generateQuestionWithAI, getSchemaTemplate, getAiModels, addAiModel, updateAiModel, deleteAiModel } from '@/actions/ai';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Upload, Trash2, Sparkles, Loader2, X, Download, Search, Filter, ArrowUpDown, LayoutGrid, Cpu, Edit2, Plus, Check, GitMerge, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import MergeQuestionsModal from '@/components/interview/MergeQuestionsModal';
import BulkUploadModal from '@/components/interview/BulkUploadModal';
import RegenerateAIModal from '@/components/interview/RegenerateAIModal';
import AskAIModal from '@/components/interview/AskAIModal';

export default function ManageInterviewPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  
  // Regenerate Modal State
  const [regenQuestionId, setRegenQuestionId] = useState<string | null>(null);
  const [regenQuestionTitle, setRegenQuestionTitle] = useState<string>('');

  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Merge Modal State
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeQuestionA, setMergeQuestionA] = useState<any>(null);
  const [mergeQuestionB, setMergeQuestionB] = useState<any>(null);
  
  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  
  // Models State for Dropdown
  const [aiModels, setAiModels] = useState<any[]>([]);

  // Sorting, Filtering, Selection State
  const [searchQuery, setSearchQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'title' | 'topic' | 'difficulty' | 'createdAt' | 'updatedAt'>('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchQuestions = async () => {
    setLoading(true);
    const [qData, mData] = await Promise.all([getQuestions(), getAiModels()]);
    setQuestions(qData);
    setAiModels(mData);
    if (mData.length > 0 && !selectedModel) {
      setSelectedModel(mData[0].modelId);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  // Derived state for filters
  const uniqueTopics = useMemo(() => Array.from(new Set(questions.map(q => q.topic))).filter(Boolean).sort(), [questions]);
  
  const uniqueCompanies = useMemo(() => {
    const all = questions.flatMap(q => q.companies || []);
    return Array.from(new Set(all)).filter(Boolean).sort();
  }, [questions]);
  
  const uniqueTags = useMemo(() => {
    const all = questions.flatMap(q => q.tags || []);
    return Array.from(new Set(all)).filter(Boolean).sort();
  }, [questions]);

  // Apply filters and sorting
  const filteredAndSortedQuestions = useMemo(() => {
    return questions
      .filter(q => {
        const matchesSearch = q.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              q.problemStatement?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesTopic = topicFilter === 'all' || q.topic === topicFilter;
        const matchesDifficulty = difficultyFilter === 'all' || q.difficulty?.toLowerCase() === difficultyFilter.toLowerCase();
        const matchesCompany = companyFilter === 'all' || (q.companies || []).includes(companyFilter);
        const matchesTag = tagFilter === 'all' || (q.tags || []).includes(tagFilter);
        return matchesSearch && matchesTopic && matchesDifficulty && matchesCompany && matchesTag;
      })
      .sort((a, b) => {
        let aVal = a[sortField];
        let bVal = b[sortField];
        
        // Handle dates
        if (sortField === 'createdAt' || sortField === 'updatedAt') {
          aVal = new Date(a[sortField] || 0).getTime();
          bVal = new Date(b[sortField] || 0).getTime();
        } else if (typeof aVal === 'string' && typeof bVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
  }, [questions, searchQuery, topicFilter, difficultyFilter, companyFilter, tagFilter, sortField, sortDirection]);

  // Selection Logic
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredAndSortedQuestions.map(q => q.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this question?')) {
      const res = await deleteQuestion(id);
      if (res.success) {
        toast.success('Question deleted');
        setSelectedIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
        fetchQuestions();
      } else {
        toast.error('Failed to delete');
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedIds.size} selected questions?`)) {
      const res = await bulkDeleteQuestions(Array.from(selectedIds));
      if (res.success) {
        toast.success(`${selectedIds.size} questions deleted`);
        setSelectedIds(new Set());
        fetchQuestions();
      } else {
        toast.error('Failed to delete selected questions');
      }
    }
  };

  const handleClearAll = async () => {
    if (confirm('WARNING: Are you sure you want to delete ALL questions? This cannot be undone.')) {
      const res = await deleteAllQuestions();
      if (res.success) {
        toast.success('All questions deleted');
        setSelectedIds(new Set());
        fetchQuestions();
      } else {
        toast.error('Failed to delete all');
      }
    }
  };

  const openMergeModal = () => {
    const selectedArray = Array.from(selectedIds);
    if (selectedArray.length !== 2) return;
    
    const q1 = questions.find(q => q.id === selectedArray[0]);
    const q2 = questions.find(q => q.id === selectedArray[1]);
    
    if (q1 && q2) {
      setMergeQuestionA(q1);
      setMergeQuestionB(q2);
      setIsMergeModalOpen(true);
    }
  };


  const openRegenerateModal = (id: string, title: string) => {
    setRegenQuestionId(id);
    setRegenQuestionTitle(title);
  };

  const handleDownloadSchema = async () => {
    setIsDownloading(true);
    const json = await getSchemaTemplate();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'interview_questions_template.json';
    a.click();
    URL.revokeObjectURL(url);
    setIsDownloading(false);
    toast.success('Template downloaded! Edit and re-upload via Bulk Upload JSON.');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      {/* Header Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 bg-white border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800 rounded-2xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
            <Settings className="w-6 h-6" /> Management Console
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage your interview database and AI models.
          </p>
      </div>

        <div className="space-y-6 mt-6">
        <div className="flex flex-wrap items-center justify-end gap-3 p-4 bg-white border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800 rounded-2xl">
          <div className="flex items-center gap-3 w-full justify-between">
            <span className="text-sm font-medium text-gray-500">Total: {questions.length}</span>
            <div className="flex items-center gap-3 flex-wrap">
          <div className="relative group">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="appearance-none pl-4 pr-8 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-lg dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-purple-500 focus:outline-none transition-colors cursor-pointer"
            >
              {aiModels.map((m: any) => (
                <option key={m.modelId} value={m.modelId}>{m.name}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
          <button 
            onClick={() => setIsAiModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg hover:shadow-lg hover:shadow-purple-500/30 transition-all"
          >
            <Sparkles className="w-4 h-4" /> Ask AI
          </button>
          <button
            onClick={handleDownloadSchema}
            disabled={isDownloading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Download Schema</span>
          </button>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Bulk Upload</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

      {/* Toolbar: Filters & Bulk Actions */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-white border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800 rounded-2xl">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-grow md:flex-grow-0">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search questions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 w-full md:w-64 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg dark:bg-gray-800 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors dark:text-white"
            />
          </div>

          {/* Topic Filter */}
          <div className="relative group min-w-[140px]">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Filter className="h-4 w-4 text-gray-400" />
            </div>
            <select
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              className="appearance-none pl-10 pr-8 py-2 w-full text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
            >
              <option value="all">All Topics</option>
              {uniqueTopics.map(topic => (
                <option key={topic} value={topic}>{topic.charAt(0).toUpperCase() + topic.slice(1).replace('-', ' ')}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>

          {/* Difficulty Filter */}
          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
            className="appearance-none px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
          >
            <option value="all">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>

          {/* Company Filter */}
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="appearance-none px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer max-w-[150px] truncate"
          >
            <option value="all">All Companies</option>
            {uniqueCompanies.map(c => <option key={c as string} value={c as string}>{c as string}</option>)}
          </select>

          {/* Tag Filter */}
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="appearance-none px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer max-w-[150px] truncate"
          >
            <option value="all">All Tags</option>
            {uniqueTags.map(t => <option key={t as string} value={t as string}>{t as string}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          {selectedIds.size > 0 && (
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
              {selectedIds.size} selected
            </span>
          )}
          {selectedIds.size === 2 && (
            <button 
              onClick={openMergeModal}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 transition-colors"
              title="Merge Selected"
            >
              <GitMerge className="w-4 h-4" /> <span className="hidden sm:inline">Merge</span>
            </button>
          )}
          <button 
            onClick={handleBulkDelete}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Delete Selected"
          >
            <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Delete Selected</span>
          </button>
          <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1"></div>
          <button 
            onClick={handleClearAll}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg dark:hover:bg-red-900/20 transition-colors"
            title="Delete All Database Items"
          >
            <span className="hidden sm:inline">Clear DB</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800 select-none">
                <th className="px-6 py-4 w-10">
                  <input 
                    type="checkbox"
                    checked={filteredAndSortedQuestions.length > 0 && selectedIds.size === filteredAndSortedQuestions.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group" onClick={() => toggleSort('title')}>
                  <div className="flex items-center gap-1">Title <ArrowUpDown className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity ${sortField === 'title' ? 'opacity-100 text-blue-500' : ''}`} /></div>
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group" onClick={() => toggleSort('topic')}>
                  <div className="flex items-center gap-1">Topic <ArrowUpDown className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity ${sortField === 'topic' ? 'opacity-100 text-blue-500' : ''}`} /></div>
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group" onClick={() => toggleSort('difficulty')}>
                  <div className="flex items-center gap-1">Difficulty <ArrowUpDown className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity ${sortField === 'difficulty' ? 'opacity-100 text-blue-500' : ''}`} /></div>
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group" onClick={() => toggleSort('createdAt')}>
                  <div className="flex items-center gap-1">Date Added <ArrowUpDown className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity ${sortField === 'createdAt' ? 'opacity-100 text-blue-500' : ''}`} /></div>
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group" onClick={() => toggleSort('updatedAt')}>
                  <div className="flex items-center gap-1">Updated At <ArrowUpDown className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity ${sortField === 'updatedAt' ? 'opacity-100 text-blue-500' : ''}`} /></div>
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500"><Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500" /></td></tr>
              ) : filteredAndSortedQuestions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <Filter className="w-10 h-10 mb-3 text-gray-400 opacity-50" />
                      <p className="text-lg font-medium text-gray-600 dark:text-gray-300">No questions found</p>
                      <p className="text-sm mt-1">Try adjusting your filters, or upload/generate new questions.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAndSortedQuestions.map((q) => (
                  <tr 
                    key={q.id} 
                    className={`hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors cursor-pointer ${selectedIds.has(q.id) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                    onClick={(e) => {
                      // Only trigger if clicking on the row, not the buttons/checkboxes
                      if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
                      router.push(`/interview/question/${q.id}`);
                    }}
                  >
                    <td className="px-6 py-4">
                      <input 
                        type="checkbox"
                        checked={selectedIds.has(q.id)}
                        onChange={() => handleSelectOne(q.id)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {q.isAiGenerated && <span title="AI Generated" className="flex shrink-0"><Sparkles className="w-4 h-4 text-purple-500" /></span>}
                        <div className="text-sm font-medium text-gray-900 dark:text-white line-clamp-1" title={q.title}>{q.title}</div>
                      </div>
                      {q.tags?.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {q.tags.slice(0, 3).map((tag: string) => (
                            <span key={tag} className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">{tag}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 capitalize whitespace-nowrap">
                      {q.topic.replace('-', ' ')}
                    </td>
                    <td className="px-6 py-4 text-sm whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${q.difficulty.toLowerCase() === 'hard' ? 'bg-red-100 text-red-700 dark:bg-red-900/30' : q.difficulty.toLowerCase() === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30' : 'bg-green-100 text-green-700 dark:bg-green-900/30'}`}>
                        {q.difficulty}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(q.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(q.updatedAt || q.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          onClick={() => openRegenerateModal(q.id, q.title)} 
                          className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
                          title="Regenerate with AI"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(q.id); }} 
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" 
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AskAIModal 
        isOpen={isAiModalOpen} 
        onClose={() => {
          setIsAiModalOpen(false);
          fetchQuestions();
        }} 
      />

      <MergeQuestionsModal 
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        onSuccess={() => {
          setSelectedIds(new Set());
          fetchQuestions();
        }}
        questionA={mergeQuestionA}
        questionB={mergeQuestionB}
      />

      <BulkUploadModal 
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={fetchQuestions}
      />

      <RegenerateAIModal 
        isOpen={!!regenQuestionId}
        onClose={() => {
          setRegenQuestionId(null);
          setRegenQuestionTitle('');
        }}
        questionId={regenQuestionId || ''}
        questionTitle={regenQuestionTitle}
      />
    </div>
  );
}
