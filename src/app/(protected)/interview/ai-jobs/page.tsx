'use client';

import React, { useState, useEffect } from 'react';
import { getAIJobs, deleteAIJob, generateQuestionWithAI, getAiModels, cancelAIJob } from '@/actions/ai';
import { Activity, Trash2, RefreshCw, Clock, Sparkles, Loader2, Play, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AIJobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Retry Modal State
  const [retryJob, setRetryJob] = useState<any>(null);
  const [selectedModel, setSelectedModel] = useState('');

  const loadJobs = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const fetchedJobs = await getAIJobs();
      setJobs(fetchedJobs);
    } catch (err) {
      console.error("Failed to load AI Jobs", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getAiModels().then(fetchedModels => {
      setModels(fetchedModels);
      if (fetchedModels.length > 0 && !selectedModel) {
        setSelectedModel(fetchedModels[0].modelId);
      }
    });
    loadJobs();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    // Check if any job is currently pending/generating
    const hasPending = jobs.some(j => j.status === 'PENDING');
    
    if (hasPending) {
      interval = setInterval(() => loadJobs(false), 5000);
    }
    
    return () => clearInterval(interval);
  }, [jobs]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this job record?')) return;
    const res = await deleteAIJob(id);
    if (res.success) {
      toast.success("Job record deleted");
      loadJobs(false);
    } else {
      toast.error(res.error || "Failed to delete");
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this job?')) return;
    const res = await cancelAIJob(id);
    if (res.success) {
      toast.success("Job cancelled");
      loadJobs(false);
    } else {
      toast.error(res.error || "Failed to cancel");
    }
  };

  const handleRetrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retryJob) return;
    
    // Check if it was an update or new question
    const updateId = retryJob.questionId || undefined;
    
    const res = await generateQuestionWithAI(retryJob.prompt, updateId, selectedModel);
    
    if (res.success) {
      toast.success('Retrying in the background!');
      setRetryJob(null);
      loadJobs(false);
    } else {
      toast.error(res.error || 'Failed to dispatch retry');
    }
  };

  const formatTimeTaken = (ms: number | null) => {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full text-xs font-semibold">Completed</span>;
      case 'FAILED':
        return <span className="px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full text-xs font-semibold">Failed</span>;
      case 'PENDING':
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full text-xs font-semibold">
            <Loader2 className="w-3 h-3 animate-spin" /> Generating
          </span>
        );
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400 rounded-full text-xs font-semibold">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
          <Activity className="w-6 h-6 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI Generation Jobs</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Track the status of your background AI tasks.</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800 text-sm font-semibold text-gray-600 dark:text-gray-300">
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Prompt / Title</th>
                <th className="px-6 py-4">Model</th>
                <th className="px-6 py-4">Time Taken</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {loading && jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-500" />
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <Sparkles className="w-10 h-10 mb-3 text-gray-300 dark:text-gray-700" />
                      <p className="text-lg font-medium text-gray-600 dark:text-gray-300">No AI jobs found</p>
                      <p className="text-sm mt-1">Generate a question to see it tracked here.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(job.status)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 max-w-sm">
                        {job.prompt}
                      </div>
                      {job.errorReason && (
                        <div className="text-xs text-red-500 mt-1 line-clamp-1" title={job.errorReason}>
                          {job.errorReason}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {job.modelName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatTimeTaken(job.timeTakenMs)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        {job.status === 'FAILED' && (
                          <button 
                            onClick={() => {
                              setRetryJob(job);
                              setSelectedModel(job.modelName);
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 dark:text-blue-400 rounded-lg transition-colors font-medium text-xs"
                            title="Retry Generation"
                          >
                            <RefreshCw className="w-3.5 h-3.5" /> Retry
                          </button>
                        )}
                        {job.status === 'PENDING' && (
                          <button 
                            onClick={() => handleCancel(job.id)} 
                            className="flex items-center gap-1 px-3 py-1.5 text-orange-600 bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/40 dark:text-orange-400 rounded-lg transition-colors font-medium text-xs"
                            title="Cancel Generation"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Cancel
                          </button>
                        )}
                        <button 
                          onClick={() => handleDelete(job.id)} 
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" 
                          title="Delete Record"
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

      {/* Retry Modal */}
      {retryJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-200 dark:border-gray-800 shadow-xl">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Retry Generation</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Select an AI model to retry generating the question.
            </p>
            
            <form onSubmit={handleRetrySubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prompt</label>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                  {retryJob.prompt}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Model</label>
                <select 
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                >
                  {models.map(m => (
                    <option key={m.id} value={m.modelId}>
                      {m.name} ({m.modelId})
                    </option>
                  ))}
                  {models.length === 0 && (
                    <option value={retryJob.modelName}>{retryJob.modelName}</option>
                  )}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRetryJob(null)}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  <Play className="w-4 h-4" /> Start Job
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
