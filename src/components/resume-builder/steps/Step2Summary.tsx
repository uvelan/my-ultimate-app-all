'use client';

import { useResumeStore } from '@/store/resume-builder/resumeStore';
import { useAtsStore } from '@/store/resume-builder/atsStore';
import { Sparkles, Plus } from 'lucide-react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { calculateAtsScore } from '@/lib/utils';
import { generateResumeSummaryWithAI } from '@/actions/resume-ai';
import { Loader2, Wand2 } from 'lucide-react';

const SUGGESTED_KEYWORDS = [
  'Cross-functional Leadership',
  'Scalable Architecture',
  'Agile Methodologies',
  'Cloud Infrastructure',
  'Performance Optimization'
];

export function Step2Summary() {
  const { data, updateSummary, activeAiModel } = useResumeStore();
  const { atsScore: aiAtsScore } = useAtsStore();
  const [targetRole, setTargetRole] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const atsScore = aiAtsScore?.overall || calculateAtsScore(data);

  const editor = useEditor({
    extensions: [StarterKit],
    content: data.summary,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[200px] text-sm text-[#e5e2e1] p-4',
      },
    },
    onUpdate: ({ editor }) => {
      updateSummary(editor.getHTML());
    },
  });

  // Sync external changes (if any)
  useEffect(() => {
    if (editor && data.summary !== editor.getHTML()) {
      editor.commands.setContent(data.summary, false);
    }
  }, [data.summary, editor]);

  const insertKeyword = (keyword: string) => {
    if (editor) {
      editor.chain().focus().insertContent(` ${keyword} `).run();
    }
  };

  const handleGenerateAI = async () => {
    if (!targetRole.trim()) {
      alert('Please enter a target role first!');
      return;
    }
    
    setIsGenerating(true);
    try {
      const res = await generateResumeSummaryWithAI(targetRole, data, activeAiModel);
      if (res.success && res.summary) {
        // Set the editor content
        editor?.commands.setContent(res.summary, false);
        // Also update the store directly
        updateSummary(res.summary);
      } else {
        alert(res.error || 'Failed to generate summary');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred while generating the summary.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 h-full text-[#e5e2e1]">
      {/* Editor Main Area */}
      <div className="flex-1 bg-[#121212] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.3)] border border-white/5 p-4 sm:p-6 flex flex-col relative min-w-0">
        <div className="absolute top-6 right-6 bg-[#050505] px-3 py-1 rounded-full border border-white/5 flex items-center gap-2 shadow-sm">
          <span className="text-xs font-bold text-[#99907c]">ATS</span>
          <span className="text-sm font-bold text-[#d4af37]">{atsScore}</span>
        </div>

        <h2 className="text-lg sm:text-xl font-bold text-[#e5e2e1] mb-1 sm:mb-2" style={{ fontFamily: 'var(--font-display), serif' }}>Professional Summary</h2>
        <p className="text-xs sm:text-sm text-[#d0c5af] mb-4 sm:mb-6">Write a 2-4 sentence summary of your background and value proposition.</p>

        {/* Premium AI Generation Bar */}
        <div className="relative mb-6 group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-[#6366F1] to-[#d4af37] rounded-xl opacity-20 group-hover:opacity-40 blur transition duration-500"></div>
          <div className="relative flex items-center bg-[#050505] rounded-xl border border-white/10 p-1.5 focus-within:border-[#6366F1] transition-all duration-300">
            <div className="pl-3 pr-2 flex items-center justify-center text-[#d4af37]">
              <Sparkles size={16} />
            </div>
            <input 
              placeholder="Describe your target role (e.g. Senior Frontend Engineer)..." 
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              className="flex-1 bg-transparent border-none text-sm text-[#e5e2e1] placeholder:text-[#99907c] focus:outline-none focus:ring-0 min-w-0 py-2"
              onKeyDown={(e) => e.key === 'Enter' && handleGenerateAI()}
            />
            <button 
              onClick={handleGenerateAI}
              disabled={isGenerating}
              className="bg-[#6366F1] hover:bg-[#4F46E5] text-white px-4 py-2 sm:px-5 sm:py-2 rounded-lg ml-2 shrink-0 transition-all font-medium text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(99,102,241,0.4)]"
            >
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
              <span className="hidden sm:inline">{isGenerating ? 'Generating...' : 'Generate'}</span>
            </button>
          </div>
        </div>

        {/* Rich Text Editor */}
        <div className="flex-1 border border-white/5 rounded-xl overflow-hidden flex flex-col focus-within:ring-1 focus-within:ring-[#6366F1] focus-within:border-[#6366F1] transition-all bg-[#050505] shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
          <div className="border-b border-white/10 bg-[#121212] p-2 flex gap-2">
            <button onClick={() => editor?.chain().focus().toggleBold().run()} className={`p-1.5 rounded text-[#d0c5af] hover:bg-white/5 ${editor?.isActive('bold') ? 'bg-white/10 font-bold text-[#e5e2e1]' : 'font-bold'}`}>B</button>
            <button onClick={() => editor?.chain().focus().toggleItalic().run()} className={`p-1.5 rounded text-[#d0c5af] hover:bg-white/5 ${editor?.isActive('italic') ? 'bg-white/10 italic text-[#e5e2e1]' : 'italic'}`}>I</button>
          </div>
          <EditorContent editor={editor} className="flex-1 overflow-y-auto" />
        </div>
      </div>

      {/* Keywords Sidebar */}
      <div className="w-full lg:w-64 shrink-0 bg-[#121212] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.3)] border border-white/5 p-4 sm:p-6 flex flex-col h-auto lg:h-full">
        <div className="flex items-center gap-2 mb-4 text-[#d4af37]">
          <Sparkles size={16} />
          <h3 className="font-bold text-sm text-[#e5e2e1]">Suggested Keywords</h3>
        </div>
        <p className="text-xs text-[#d0c5af] mb-4">Click to add these highly-searched terms to your summary.</p>
        
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_KEYWORDS.map(kw => (
            <button 
              key={kw}
              onClick={() => insertKeyword(kw)}
              className="flex items-center gap-1 text-xs bg-[#6366F1]/10 text-[#6366F1] border border-[#6366F1]/20 px-2 py-1.5 rounded-md hover:bg-[#6366F1] hover:text-white transition-all text-left shadow-[0_0_10px_rgba(99,102,241,0.05)] hover:shadow-[0_0_15px_rgba(99,102,241,0.3)]"
            >
              <Plus size={12} />
              {kw}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
