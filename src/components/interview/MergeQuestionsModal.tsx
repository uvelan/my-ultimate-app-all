'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, GitMerge, AlertCircle, Save } from 'lucide-react';
import { mergeQuestions } from '@/actions/interview';
import toast from 'react-hot-toast';

interface MergeQuestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  questionA: any;
  questionB: any;
}

export default function MergeQuestionsModal({ isOpen, onClose, onSuccess, questionA, questionB }: MergeQuestionsModalProps) {
  // We'll keep track of which side is selected for each field: 'A' or 'B'. 
  // We can also allow manual edits if needed, but for MVP, let's just let them pick A or B for each major field.
  const [selections, setSelections] = useState<Record<string, 'A' | 'B'>>({
    title: 'A',
    topic: 'A',
    difficulty: 'A',
    problemStatement: 'A',
    explanation: 'A',
    bestAnswer: 'A',
    companies: 'A',
    tags: 'A',
    estimatedTime: 'A',
    frequency: 'A',
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [keepId, setKeepId] = useState<'A' | 'B'>('A');

  if (!isOpen || !questionA || !questionB) return null;

  const handleSelectAll = (side: 'A' | 'B') => {
    const newSelections: Record<string, 'A' | 'B'> = {};
    Object.keys(selections).forEach(k => {
      newSelections[k] = side;
    });
    setSelections(newSelections);
    setKeepId(side);
  };

  const handleMerge = async () => {
    setIsSubmitting(true);
    
    // Construct the merged data based on selections
    const mergedData: any = {};
    const fields = Object.keys(selections);
    
    fields.forEach(field => {
      const selectedSide = selections[field];
      mergedData[field] = selectedSide === 'A' ? questionA[field] : questionB[field];
    });

    // Also need to merge fields we aren't explicitly diffing, just take them from the keepId side
    const baseQuestion = keepId === 'A' ? questionA : questionB;
    const finalMergedData = {
      ...baseQuestion,
      ...mergedData
    };

    const targetKeepId = keepId === 'A' ? questionA.id : questionB.id;
    const targetDeleteId = keepId === 'A' ? questionB.id : questionA.id;

    const res = await mergeQuestions(targetKeepId, targetDeleteId, finalMergedData);
    
    setIsSubmitting(false);
    if (res.success) {
      toast.success("Questions merged successfully!");
      onSuccess();
      onClose();
    } else {
      toast.error(res.error || "Failed to merge questions.");
    }
  };

  const FieldDiff = ({ label, fieldName }: { label: string, fieldName: string }) => {
    const valA = questionA[fieldName];
    const valB = questionB[fieldName];
    const isSelectedA = selections[fieldName] === 'A';
    const isSelectedB = selections[fieldName] === 'B';

    const renderVal = (val: any) => {
      if (!val) return <span className="text-gray-400 italic">Empty</span>;
      if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : <span className="text-gray-400 italic">Empty array</span>;
      if (typeof val === 'string' && val.length > 150) return val.substring(0, 150) + '...';
      return String(val);
    };

    return (
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-text-secondary mb-2">{label}</h4>
        <div className="grid grid-cols-2 gap-4">
          <div 
            onClick={() => setSelections({...selections, [fieldName]: 'A'})}
            className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${isSelectedA ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-border bg-surface hover:border-blue-300'}`}
          >
            <div className="flex justify-between items-start mb-1">
              <span className="text-xs font-medium text-gray-500">Question A</span>
              {isSelectedA && <Check className="w-4 h-4 text-blue-500" />}
            </div>
            <div className="text-sm text-text-primary break-words whitespace-pre-wrap max-h-32 overflow-y-auto custom-scrollbar">
              {renderVal(valA)}
            </div>
          </div>
          
          <div 
            onClick={() => setSelections({...selections, [fieldName]: 'B'})}
            className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${isSelectedB ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'border-border bg-surface hover:border-purple-300'}`}
          >
            <div className="flex justify-between items-start mb-1">
              <span className="text-xs font-medium text-gray-500">Question B</span>
              {isSelectedB && <Check className="w-4 h-4 text-purple-500" />}
            </div>
            <div className="text-sm text-text-primary break-words whitespace-pre-wrap max-h-32 overflow-y-auto custom-scrollbar">
              {renderVal(valB)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-5xl max-h-[90vh] flex flex-col bg-surface border border-border shadow-2xl rounded-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border bg-surface-2">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2 text-text-primary">
                <GitMerge className="w-5 h-5 text-blue-500" /> Merge Duplicate Questions
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Select which content to keep from each question. The unselected question will be deleted.
              </p>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-4 p-4 border-b border-border bg-surface">
             <button 
                onClick={() => handleSelectAll('A')}
                className="py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 rounded-lg transition-colors"
             >
               Select All from Question A
             </button>
             <button 
                onClick={() => handleSelectAll('B')}
                className="py-2 text-sm font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:hover:bg-purple-900/40 rounded-lg transition-colors"
             >
               Select All from Question B
             </button>
          </div>

          {/* Diff Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50 dark:bg-black/20">
            <div className="flex items-center gap-2 mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-xl text-amber-800 dark:text-amber-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>Base record to keep: <strong>Question {keepId}</strong>. The other record will be permanently deleted after merging.</p>
            </div>

            <FieldDiff label="Title" fieldName="title" />
            <FieldDiff label="Topic" fieldName="topic" />
            <FieldDiff label="Difficulty" fieldName="difficulty" />
            <FieldDiff label="Problem Statement" fieldName="problemStatement" />
            <FieldDiff label="Explanation" fieldName="explanation" />
            <FieldDiff label="Best Answer" fieldName="bestAnswer" />
            <FieldDiff label="Tags" fieldName="tags" />
            <FieldDiff label="Companies" fieldName="companies" />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-surface">
            <button 
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 bg-surface-2 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              onClick={handleMerge}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/20 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Confirm Merge
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
