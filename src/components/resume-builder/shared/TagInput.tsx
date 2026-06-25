'use client';

import { useState, KeyboardEvent } from 'react';
import { X } from 'lucide-react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  label?: string;
}

export function TagInput({ tags = [], onChange, placeholder = "Add a tag...", label }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const newTag = inputValue.trim().replace(/,$/, '');
      if (newTag && !tags.includes(newTag)) {
        onChange([...tags, newTag]);
      }
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (indexToRemove: number) => {
    onChange(tags.filter((_, index) => index !== indexToRemove));
  };

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className="text-sm font-medium text-text-secondary">{label}</label>}
      <div className="flex flex-wrap gap-2 p-2 border border-border rounded-md bg-surface focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-shadow">
        {tags.map((tag, index) => (
          <span 
            key={index} 
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-50 text-indigo-700 text-sm font-medium"
          >
            {tag}
            <button 
              onClick={() => removeTag(index)}
              className="hover:bg-indigo-200 rounded-full p-0.5 transition-colors"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] outline-none text-sm text-text-primary placeholder:text-text-muted bg-transparent"
        />
      </div>
    </div>
  );
}
