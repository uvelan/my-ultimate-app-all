'use client';

import { useUiStore } from '@/store/resume-builder/uiStore';
import { cn } from '@/lib/utils';
import { Monitor, Smartphone, Printer, ZoomIn, ZoomOut } from 'lucide-react';

import { ResumePreview } from '../preview/ResumePreview';

export function RightPanel() {
  const { previewMode, setPreviewMode, previewZoom, setPreviewZoom } = useUiStore();

  return (
    <div className="h-full w-full flex flex-col text-[#e5e2e1] bg-[#121212] print:bg-surface print:text-black">
      {/* Header Row */}
      <div className="print:hidden h-[48px] shrink-0 border-b border-white/10 bg-[#121212] flex items-center justify-between px-4">
        <div className="flex bg-[#050505] rounded-md p-0.5 border border-white/5">
          {[
            { id: 'desktop', icon: Monitor },
            { id: 'mobile', icon: Smartphone },
            { id: 'print', icon: Printer },
          ].map(mode => (
            <button
              key={mode.id}
              onClick={() => setPreviewMode(mode.id as any)}
              className={cn(
                "p-1.5 rounded-sm transition-colors",
                previewMode === mode.id ? "bg-[#1c1b1b] shadow-sm text-[#d4af37]" : "text-[#99907c] hover:text-[#e5e2e1]"
              )}
            >
              <mode.icon size={16} />
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setPreviewZoom(Math.max(25, previewZoom - 25))}
            className="p-1 text-[#99907c] hover:text-[#d4af37] transition-colors"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-xs font-medium w-10 text-center text-[#d0c5af]">{previewZoom}%</span>
          <button 
            onClick={() => setPreviewZoom(Math.min(200, previewZoom + 25))}
            className="p-1 text-[#99907c] hover:text-[#d4af37] transition-colors"
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 overflow-auto bg-[#050505] print:bg-surface print:p-0 print:overflow-visible p-8 flex flex-col items-center relative">
        {/* The Live Resume Paper Preview */}
        <div 
          className="bg-surface shadow-[0_0_40px_rgba(212,175,55,0.05)] border border-[#ffffff]/10 shrink-0 origin-top overflow-hidden print-no-transform print:shadow-none print:border-none"
          style={{ 
            width: '8.5in', 
            height: '11in',
            transform: `scale(${previewZoom / 100})`,
            marginBottom: `-${(1 - (previewZoom / 100)) * 11}in` // Recoup the scaled height
          }}
        >
          <ResumePreview />
        </div>
      </div>

      <div className="print:hidden h-[32px] shrink-0 border-t border-white/10 bg-[#121212] flex items-center justify-center text-[11px] font-semibold tracking-wider uppercase text-[#99907c]">
        Page 1 of 1
      </div>
    </div>
  );
}
