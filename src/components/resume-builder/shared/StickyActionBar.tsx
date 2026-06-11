'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Save, CheckCircle2, Sparkles, Download, ChevronDown, Loader2, Minimize2, PanelBottomClose, PanelBottomOpen } from 'lucide-react';
import { useResumeStore } from '@/store/resume-builder/resumeStore';
import { useUiStore } from '@/store/resume-builder/uiStore';
import { useAtsStore } from '@/store/resume-builder/atsStore';
import { calculateAtsScore } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { suggestOverallImprovementsWithAI } from '@/actions/resume-ai';
import { useAuth } from '@/hooks/useAuth';

export function StickyActionBar() {
  const { data, setFullData } = useResumeStore();
  const { isActionBarMinimized, setActionBarMinimized, setMaskingEnabled } = useUiStore();
  const { atsScore: aiAtsScore, fetchAtsScore, isScoring } = useAtsStore();
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [isImproving, setIsImproving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const handleAIImprove = async () => {
    setIsImproving(true);
    try {
      const activeAiModel = useResumeStore.getState().activeAiModel;
      const res = await suggestOverallImprovementsWithAI(data, activeAiModel);
      if (res.success && res.suggestions) {
        setSuggestions(res.suggestions);
        setIsModalOpen(true);
      } else {
        alert(res.error || 'Failed to analyze resume.');
      }
    } catch (e) {
      console.error(e);
      alert('An error occurred.');
    } finally {
      setIsImproving(false);
    }
  };

  const { user } = useAuth();
  const isSuperUser = user?.role === 'SUPERUSER';

  const handleNext = () => {
    const { activeStep, setActiveStep } = useUiStore.getState();
    if (activeStep < 10) setActiveStep(activeStep + 1);
  };

  const handlePrev = () => {
    const { activeStep, setActiveStep } = useUiStore.getState();
    if (activeStep > 1) setActiveStep(activeStep - 1);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      if (data.id) {
        const res = await fetch('/api/resumes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: data.id, content: data }),
        });
        if (!res.ok) throw new Error('Failed to update');
        setSaveStatus('saved');
      } else {
        const res = await fetch('/api/resumes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create');
        const result = await res.json();
        // Update the store with the new MongoDB ID so future saves are PUTs
        setFullData({ ...data, id: result.id });
        setSaveStatus('saved');
      }
    } catch (error) {
      console.error(error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  return (
    <>
      {isActionBarMinimized ? (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-full h-full">
          <motion.div 
            drag 
            dragMomentum={false}
            className="pointer-events-auto absolute bottom-0 left-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing"
          >
            <button 
              onClick={() => setActionBarMinimized(false)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#1c1b1b] text-[#d0c5af] border border-white/10 shadow-xl hover:bg-[#2a2a2a] hover:text-white transition-colors group"
            >
              <PanelBottomOpen size={16} className="group-hover:text-[#d4af37] transition-colors" />
              <span className="text-xs font-bold uppercase tracking-wider">Show Actions</span>
            </button>
          </motion.div>
        </div>
      ) : (
        <div className="h-full w-full flex items-center justify-between px-6 mx-auto bg-[#121212] border-t border-white/10">
      <div className="flex items-center gap-4 flex-1 justify-center max-w-4xl">
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold text-[#d0c5af] hover:bg-white/5 transition-all disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : saveStatus === 'saved' ? (
            <CheckCircle2 size={16} className="text-emerald-500" />
          ) : (
            <Save size={16} />
          )}
          {isSaving ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save Draft'}
        </button>
        
        <button 
          onClick={() => fetchAtsScore(data)}
          disabled={isScoring}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold text-[#d0c5af] hover:bg-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isScoring ? <Loader2 size={16} className="text-[#6366F1] animate-spin" /> : <CheckCircle2 size={16} className="text-[#6366F1]" />}
          {isScoring ? 'Scanning...' : 'ATS Analysis'}
          {aiAtsScore && aiAtsScore.overall !== undefined && (
            <span className="ml-1 bg-[#6366F1]/10 text-[#6366F1] px-2 py-0.5 rounded text-xs border border-[#6366F1]/20">
              {aiAtsScore.overall}/100
            </span>
          )}
        </button>

        <div className="w-[1px] h-6 bg-white/10 mx-2" />

        <button 
          onClick={handleAIImprove}
          disabled={isImproving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-bold text-[#f2ca50] bg-[#d4af37]/10 hover:bg-[#d4af37]/20 transition-all border border-[#d4af37]/30 shadow-[0_0_15px_rgba(212,175,55,0.08)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isImproving ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {isImproving ? 'Analyzing...' : 'AI Improve'}
        </button>

        <div className="relative group">
          <button 
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-[13px] font-bold bg-[#1c1b1b] text-[#f2ca50] border border-[#d4af37] hover:bg-[#2a2a2a] transition-all shadow-md"
          >
            <Download size={16} />
            Export PDF
            <ChevronDown size={16} className="ml-1 opacity-70" />
          </button>
          
          <div className="absolute bottom-full right-0 mb-2 w-48 bg-[#1c1b1b] border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            <button 
              onClick={() => window.print()}
              className="w-full text-left px-4 py-2.5 text-[13px] text-white hover:bg-white/5 rounded-t-lg transition-colors"
            >
              Standard Export
            </button>
            <button 
              onClick={() => {
                setMaskingEnabled(true);
                setTimeout(() => {
                  window.print();
                  setMaskingEnabled(false);
                }, 100);
              }}
              className="w-full text-left px-4 py-2.5 text-[13px] text-[#f2ca50] hover:bg-white/5 rounded-b-lg transition-colors"
            >
              Masked Export (Hide Info)
            </button>
          </div>
        </div>
      </div>
      
      <button 
        onClick={() => setActionBarMinimized(true)}
        className="text-[#99907c] hover:text-white p-2 rounded-md hover:bg-white/5 transition-colors"
        title="Minimize Action Bar"
      >
        <PanelBottomClose size={18} />
      </button>
      </div>
      )}

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title="AI Improvement Suggestions"
        description="We've analyzed your masked resume and found a few areas where you can improve your chances."
        className="max-w-2xl bg-[#1c1b1b] border-white/10 text-[#e5e2e1]"
      >
        <div className="space-y-4 mt-4">
          {suggestions.map((sug, i) => (
            <div key={i} className="p-4 rounded-lg bg-[#2a2a2a] border border-white/5 flex gap-3">
              <div className="shrink-0 mt-0.5">
                {sug.priority === 'High' && <span className="w-2 h-2 mt-1.5 block rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />}
                {sug.priority === 'Medium' && <span className="w-2 h-2 mt-1.5 block rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />}
                {sug.priority === 'Low' && <span className="w-2 h-2 mt-1.5 block rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#d4af37]">{sug.section}</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded uppercase font-bold",
                    sug.priority === 'High' ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                    sug.priority === 'Medium' ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                    "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  )}>
                    {sug.priority} Priority
                  </span>
                </div>
                <p className="text-sm text-[#d0c5af] leading-relaxed">{sug.advice}</p>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
