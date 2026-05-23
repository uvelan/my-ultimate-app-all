'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Loader2, Play, Layers, FileText } from 'lucide-react';
import { generateQuestionWithAI, getAiModels } from '@/actions/ai';
import toast from 'react-hot-toast';

interface AskAIModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AskAIModal({ isOpen, onClose }: AskAIModalProps) {
  const [prompt, setPrompt] = useState('');
  const [models, setModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);

  useEffect(() => {
    if (isOpen && models.length === 0) {
      getAiModels().then(data => {
        setModels(data);
        const activeModels = data.filter((m: any) => m.isActive);
        if (activeModels.length > 0) {
          setSelectedModel(activeModels[0].modelId);
        } else if (data.length > 0) {
          setSelectedModel(data[0].modelId);
        }
      });
    }
  }, [isOpen, models.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }
    
    setIsSubmitting(true);

    if (isBatchMode) {
      const prompts = prompt.split('\n').map(p => p.trim()).filter(Boolean);
      if (prompts.length === 0) {
        toast.error('Please enter at least one valid prompt');
        setIsSubmitting(false);
        return;
      }
      
      let successCount = 0;
      for (const p of prompts) {
        const res = await generateQuestionWithAI(p, undefined, selectedModel);
        if (res.success) successCount++;
        // stagger submissions slightly to prevent slamming the server
        await new Promise(r => setTimeout(r, 500));
      }
      
      setIsSubmitting(false);
      if (successCount > 0) {
        toast.success(`Successfully queued ${successCount} background jobs! Check the AI Jobs tab.`);
        setPrompt('');
        onClose();
      } else {
        toast.error('Failed to submit batch jobs');
      }
    } else {
      const res = await generateQuestionWithAI(prompt, undefined, selectedModel);
      setIsSubmitting(false);
      
      if (res.success) {
        toast.success('Job submitted successfully! Check the AI Jobs tab to view progress.');
        setPrompt('');
        onClose();
      } else {
        toast.error(res.error || 'Failed to submit job');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl rounded-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-900/10 dark:to-indigo-900/10">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Ask AI to Generate Questions
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Describe the topic or problem you want the AI to generate.
              </p>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
              <button
                type="button"
                onClick={() => setIsBatchMode(false)}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${!isBatchMode ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              >
                <FileText className="w-4 h-4" /> Single
              </button>
              <button
                type="button"
                onClick={() => setIsBatchMode(true)}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${isBatchMode ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              >
                <Layers className="w-4 h-4" /> Batch
              </button>
            </div>

            <div>
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={isBatchMode ? "Enter multiple questions or topics here.\nPut each question on a NEW LINE.\nThey will be queued as separate AI generation jobs..." : "e.g., Generate 3 hard system design questions for a Senior Backend role at Uber..."}
                className="w-full p-4 text-sm font-medium bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none custom-scrollbar text-gray-900 dark:text-gray-200"
                rows={isBatchMode ? 6 : 4}
                autoFocus
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Model:</label>
                <select 
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-transparent rounded-lg text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Default Selection</option>
                  {models.map(m => (
                    <option key={m.id} value={m.modelId}>
                      {m.name} {m.isActive ? '' : '(Inactive)'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting || !prompt.trim()}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Generate
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
