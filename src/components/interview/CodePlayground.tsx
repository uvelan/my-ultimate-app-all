'use client';

import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Copy, Check } from 'lucide-react';

interface CodePlaygroundProps {
  initialCode: string;
  language: string;
}

export default function CodePlayground({ initialCode, language }: CodePlaygroundProps) {
  const [code, setCode] = useState(initialCode);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="overflow-hidden border border-gray-200 dark:border-gray-800 rounded-xl bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-[#2d2d2d]">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          </div>
          <span className="ml-4 text-sm font-medium text-gray-400 uppercase">
            {language}
          </span>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleCopy}
            className="flex items-center gap-1 px-3 py-1 text-sm text-gray-300 transition-colors rounded hover:bg-white/10 hover:text-white"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-white transition-colors bg-blue-600 rounded hover:bg-blue-700">
            <Play className="w-4 h-4" /> Run
          </button>
        </div>
      </div>
      <div className="p-4">
        <Editor
          height="300px"
          language={language === 'tsx' ? 'typescript' : language}
          theme="vs-dark"
          value={code}
          onChange={(val) => setCode(val || '')}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            padding: { top: 16 },
            scrollBeyondLastLine: false,
            fontFamily: 'var(--font-mono), monospace',
          }}
        />
      </div>
    </div>
  );
}
