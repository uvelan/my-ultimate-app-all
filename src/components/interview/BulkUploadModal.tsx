'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FileText, FileArchive, Check, Loader2, AlertCircle, Type } from 'lucide-react';
import JSZip from 'jszip';
import { bulkUploadQuestions } from '@/actions/interview';
import toast from 'react-hot-toast';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BulkUploadModal({ isOpen, onClose, onSuccess }: BulkUploadModalProps) {
  const [activeTab, setActiveTab] = useState<'file' | 'paste'>('file');
  const [isUploading, setIsUploading] = useState(false);
  
  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Paste state
  const [pastedJson, setPastedJson] = useState('');

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.name.endsWith('.json') || file.name.endsWith('.zip')) {
        setSelectedFile(file);
      } else {
        toast.error('Please select a .json or .zip file');
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.json') || file.name.endsWith('.zip')) {
        setSelectedFile(file);
      } else {
        toast.error('Please drop a .json or .zip file');
      }
    }
  };

  const processJsonString = (jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      console.warn("Skipping invalid JSON file");
      return [];
    }
  };

  const handleUploadSubmit = async () => {
    setIsUploading(true);
    let finalQuestions: any[] = [];

    try {
      if (activeTab === 'paste') {
        if (!pastedJson.trim()) throw new Error("Please paste some JSON data");
        finalQuestions = processJsonString(pastedJson);
      } else {
        if (!selectedFile) throw new Error("Please select a file");

        if (selectedFile.name.endsWith('.json')) {
          const text = await selectedFile.text();
          finalQuestions = processJsonString(text);
        } else if (selectedFile.name.endsWith('.zip')) {
          const zip = new JSZip();
          const contents = await zip.loadAsync(selectedFile);
          
          for (const [filename, fileData] of Object.entries(contents.files)) {
            if (!fileData.dir && filename.endsWith('.json')) {
              const text = await fileData.async('text');
              const parsedArray = processJsonString(text);
              finalQuestions = finalQuestions.concat(parsedArray);
            }
          }
        }
      }

      if (finalQuestions.length === 0) {
        throw new Error("No valid JSON questions found");
      }

      const res = await bulkUploadQuestions(JSON.stringify(finalQuestions));
      if (res.success) {
        toast.success(`Success! Created: ${res.createdCount}, Updated: ${res.updatedCount}`);
        setSelectedFile(null);
        setPastedJson('');
        onSuccess();
        onClose();
      } else {
        throw new Error(res.error || 'Upload failed');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error processing upload');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl rounded-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                <Upload className="w-5 h-5 text-blue-500" /> Bulk Upload Questions
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Upload a JSON file, a ZIP of JSONs, or paste JSON text directly. Existing titles will be updated.
              </p>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100 dark:border-gray-800">
            <button 
              onClick={() => setActiveTab('file')}
              className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'file' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50 dark:bg-blue-900/10' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              <FileArchive className="w-4 h-4" /> File Upload
            </button>
            <button 
              onClick={() => setActiveTab('paste')}
              className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'paste' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50 dark:bg-blue-900/10' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              <Type className="w-4 h-4" /> Paste JSON
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {activeTab === 'file' ? (
              <div 
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${selectedFile ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10' : 'border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => !selectedFile && fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept=".json,.zip" 
                  className="hidden" 
                />
                
                {selectedFile ? (
                  <div className="flex flex-col items-center">
                    {selectedFile.name.endsWith('.zip') ? <FileArchive className="w-12 h-12 text-blue-500 mb-3" /> : <FileText className="w-12 h-12 text-blue-500 mb-3" />}
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedFile.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{(selectedFile.size / 1024).toFixed(2)} KB</p>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                      className="mt-4 px-4 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 rounded-lg transition-colors"
                    >
                      Remove File
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center cursor-pointer">
                    <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
                      <Upload className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Click or drag file to this area</h3>
                    <p className="text-sm text-gray-500">Supports single .json or multiple .json files inside a .zip archive</p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <textarea
                  value={pastedJson}
                  onChange={(e) => setPastedJson(e.target.value)}
                  placeholder="Paste your JSON object or array here..."
                  className="w-full h-64 p-4 text-sm font-mono text-gray-900 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none custom-scrollbar dark:text-gray-200"
                />
              </div>
            )}
            
            <div className="mt-4 flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-lg text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>Duplicates are automatically checked by <strong>Title</strong>. Existing questions will be updated (Upsert).</p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <button 
              onClick={onClose}
              disabled={isUploading}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              onClick={handleUploadSubmit}
              disabled={isUploading || (activeTab === 'file' && !selectedFile) || (activeTab === 'paste' && !pastedJson.trim())}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/20 transition-all disabled:opacity-50"
            >
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {isUploading ? 'Processing...' : 'Upload Questions'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
