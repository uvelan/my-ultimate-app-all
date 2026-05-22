'use client';

import React from 'react';
import { Code, Server, Database, Network, Cloud, Layout } from 'lucide-react';

const icons: Record<string, React.ReactNode> = {
  Layout: <Layout className="w-5 h-5" />,
  Server: <Server className="w-5 h-5" />,
  Database: <Database className="w-5 h-5" />,
  Network: <Network className="w-5 h-5" />,
  Cloud: <Cloud className="w-5 h-5" />,
  Code: <Code className="w-5 h-5" />,
};

interface TopicSidebarProps {
  topics: any[];
  selectedTopic: string | null;
  onSelectTopic: (topicId: string | null) => void;
}

export default function TopicSidebar({ topics, selectedTopic, onSelectTopic }: TopicSidebarProps) {
  return (
    <div className="w-full md:w-64 space-y-2">
      <h3 className="px-4 mb-4 text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
        Categories
      </h3>
      
      <button
        onClick={() => onSelectTopic(null)}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
          selectedTopic === null 
            ? 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 dark:from-blue-900/40 dark:to-indigo-900/40 dark:text-blue-300 font-semibold shadow-sm border border-blue-100/50 dark:border-blue-800/50' 
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 hover:text-gray-900 dark:hover:text-white border border-transparent'
        }`}
      >
        <span>All Topics</span>
      </button>

      {topics.map((topic) => (
        <button
          key={topic.id}
          onClick={() => onSelectTopic(topic.id)}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
            selectedTopic === topic.id 
              ? 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 dark:from-blue-900/40 dark:to-indigo-900/40 dark:text-blue-300 font-semibold shadow-sm border border-blue-100/50 dark:border-blue-800/50' 
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 hover:text-gray-900 dark:hover:text-white border border-transparent'
          }`}
        >
          <div className="flex items-center gap-3">
            {topic.icon && icons[topic.icon]}
            <span>{topic.name.replace('-', ' ')}</span>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${selectedTopic === topic.id ? 'bg-blue-200/50 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200' : 'bg-gray-100/80 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
            {topic.count}
          </span>
        </button>
      ))}
    </div>
  );
}
