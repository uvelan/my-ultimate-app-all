'use client';

import { ReactNode, useEffect, useState } from 'react';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { StickyActionBar } from '../shared/StickyActionBar';
import { StepProgress } from '../shared/StepProgress';
import { ArrowLeft, Edit2, Zap, ChevronDown, Eye, X } from 'lucide-react';
import Link from 'next/link';
import { useResumeStore } from '@/store/resume-builder/resumeStore';
import { useUiStore } from '@/store/resume-builder/uiStore';
import { getAiModels } from '@/actions/ai';
import { useAuth } from '@/hooks/useAuth';

export function BuilderShell({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const { data, activeAiModel, setActiveAiModel } = useResumeStore();
  const { isActionBarMinimized } = useUiStore();
  const [aiModels, setAiModels] = useState<any[]>([]);
  const { user } = useAuth();
  
  const isSuperUser = user?.role === 'SUPERUSER';
  const updatedAt = data.meta?.updatedAt || new Date().toISOString();
  const fullName = data.personalInfo?.fullName;

  useEffect(() => {
    setMounted(true);
    if (isSuperUser) {
      getAiModels().then(models => {
        if (!models) return;
        const active = models.filter((m: any) => m.isActive);
        setAiModels(active);
        if (active.length > 0 && !activeAiModel) {
          setActiveAiModel(active[0].modelId);
        }
      }).catch(err => {
        console.error('Failed to load AI models:', err);
      });
    }
  }, [isSuperUser, activeAiModel, setActiveAiModel]);

  const formattedDate = new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex flex-col h-full w-full bg-[#050505] font-sans text-[#e5e2e1] print:bg-surface">
      {/* Top Nav (56px) */}
      <header className="print:hidden h-[56px] shrink-0 w-full bg-[#121212] border-b border-white/10 flex items-center justify-between px-8 z-20 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center w-[200px]">
          <Link href="/resume-builder" className="text-[13px] font-semibold text-[#d0c5af] hover:text-[#d4af37] transition-colors flex items-center gap-2 group">
            <ArrowLeft size={16} className="text-[#99907c] group-hover:-translate-x-1 transition-transform" />
            Back to App
          </Link>
        </div>
        
        <div className="flex items-center gap-3 flex-1 justify-center">
          <span className="text-[15px] font-bold text-[#e5e2e1] tracking-wide" style={{ fontFamily: 'var(--font-display), serif' }}>
            {fullName ? `${fullName}'s Resume` : 'Untitled Resume'}
          </span>
          <button className="text-[#99907c] hover:text-[#d4af37] transition-colors p-1 rounded-md hover:bg-surface/5">
            <Edit2 size={14} />
          </button>
        </div>

        <div className="flex items-center gap-4 w-auto justify-end">
          {isSuperUser && aiModels.length > 0 && (
            <div className="relative group min-w-[140px]">
              <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-[#d4af37]">
                <Zap size={14} fill="currentColor" />
              </div>
              <select
                value={activeAiModel}
                onChange={(e) => setActiveAiModel(e.target.value)}
                className="appearance-none w-full pl-7 pr-8 py-1.5 text-[11px] font-bold tracking-wide uppercase text-[#d0c5af] bg-[#d4af37]/10 border border-[#d4af37]/20 rounded-full hover:bg-[#d4af37]/20 focus:ring-2 focus:ring-[#d4af37]/50 focus:outline-none transition-colors cursor-pointer shadow-sm"
              >
                {aiModels.map((m: any) => (
                  <option key={m.modelId} value={m.modelId} className="bg-[#121212] text-[#e5e2e1] normal-case tracking-normal">
                    {m.name}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
                <ChevronDown className="w-3 h-3 text-[#d4af37]" />
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface/5 rounded-md border border-white/10 ml-2 sm:ml-4">
            <span className="text-[10px] sm:text-xs text-[#99907c] font-medium whitespace-nowrap">
              <span className="hidden sm:inline">Last auto-saved at </span>{mounted ? formattedDate : ''}
            </span>
          </div>
        </div>
      </header>

      {/* 3-Panel Content Area */}
      <div className="flex-1 flex overflow-hidden w-full relative print:overflow-visible">
        <div className="hidden md:block print:hidden">
          <LeftPanel />
        </div>
        <main className="print:hidden flex-1 overflow-y-auto no-scrollbar relative flex flex-col min-w-0">
          <StepProgress />
          <div className="flex-1 p-4 lg:p-6 xl:p-8">
            {children}
          </div>
        </main>
        <div className="hidden xl:flex w-[32vw] max-w-[450px] min-w-[320px] shrink-0 border-l border-white/10 bg-[#121212] z-10 flex-col shadow-[-4px_0_20px_rgba(0,0,0,0.5)] print:flex print:absolute print:left-0 print:top-0 print:w-full print:max-w-none print:min-w-full print:border-none print:shadow-none print:bg-surface print:h-screen">
          <RightPanel />
        </div>
      </div>

      {/* Mobile Preview FAB */}
      <button 
        className="xl:hidden fixed bottom-20 right-6 z-40 bg-[#d4af37] text-[#121212] p-3 rounded-full shadow-lg hover:scale-105 transition-transform print:hidden flex items-center justify-center"
        onClick={() => setShowMobilePreview(true)}
      >
        <Eye size={24} />
      </button>

      {/* Mobile Preview Overlay */}
      {showMobilePreview && (
        <div className="xl:hidden fixed inset-0 z-[60] bg-[#121212] flex flex-col print:hidden">
          <div className="flex justify-between items-center p-4 border-b border-white/10 bg-[#121212]">
            <span className="text-[#d4af37] font-bold">Resume Preview</span>
            <button onClick={() => setShowMobilePreview(false)} className="text-[#99907c] hover:text-white p-2 bg-surface/5 rounded-full">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden relative flex flex-col">
            <RightPanel />
          </div>
        </div>
      )}

      {/* Sticky Action Bar */}
      {!isActionBarMinimized ? (
        <div key="action-bar-max" className="print:hidden h-[56px] shrink-0 w-full z-20">
          <StickyActionBar />
        </div>
      ) : (
        <div key="action-bar-min" className="print:hidden">
          <StickyActionBar />
        </div>
      )}
    </div>
  );
}
