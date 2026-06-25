'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, X, Loader2, Play } from 'lucide-react';
import { generateQuestionWithAI, getAiModels } from '@/actions/ai';
import toast from 'react-hot-toast';

interface RegenerateAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  questionId: string;
  questionTitle: string;
}

export default function RegenerateAIModal({ isOpen, onClose, questionId, questionTitle }: RegenerateAIModalProps) {
  const [models, setModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (!questionId) return;
    
    setIsSubmitting(true);
    const res = await generateQuestionWithAI('', questionId, selectedModel);
    setIsSubmitting(false);
    
    if (res.success) {
      toast.success('Regeneration job submitted! Check the AI Jobs tab to view progress.');
      onClose();
    } else {
      toast.error(res.error || 'Failed to submit job');
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
          className="w-full max-w-lg bg-surface border border-border shadow-2xl rounded-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between p-6 border-b border-border bg-gradient-to-r from-purple-50/50 to-fuchsia-50/50 dark:from-purple-900/10 dark:to-fuchsia-900/10">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2 text-text-primary">
                <RefreshCw className="w-5 h-5 text-purple-600 dark:text-purple-400" /> Regenerate Question
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Select an AI model to regenerate this question.
              </p>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Target Question</label>
              <div className="p-3 bg-surface-2 rounded-lg text-sm text-text-secondary border border-border font-medium">
                {questionTitle}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 mr-4">
                <label className="text-sm font-medium text-text-muted">Model:</label>
                <select 
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="px-3 py-1.5 w-full bg-surface-2 border border-transparent rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Default Selection</option>
                  {models.map(m => (
                    <option key={m.id} value={m.modelId}>
                      {m.name} {m.isActive ? '' : '(Inactive)'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button 
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-colors shadow-md shadow-purple-500/20 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Regenerate
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
