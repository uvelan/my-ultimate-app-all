'use client';

import { useUiStore } from '@/store/resume-builder/uiStore';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

const STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function StepProgress() {
  const { activeStep, setActiveStep } = useUiStore();

  return (
    <div className="w-full px-8 py-6 bg-[#121212] border-b border-white/10 shrink-0 shadow-sm">
      <div className="flex items-center justify-between relative max-w-4xl mx-auto">
        {/* Progress Line */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-[2px] bg-surface/5 -z-10" />
        <div 
          className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] bg-[#d4af37] -z-10 transition-all duration-300 shadow-[0_0_10px_rgba(212,175,55,0.5)]"
          style={{ width: `${((activeStep - 1) / (STEPS.length - 1)) * 100}%` }}
        />

        {STEPS.map((step) => {
          const isActive = step === activeStep;
          const isComplete = step < activeStep;

          return (
            <button
              key={step}
              onClick={() => setActiveStep(step)}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-300 bg-[#121212]",
                isActive ? "border-[#d4af37] text-[#d4af37] shadow-[0_0_15px_rgba(212,175,55,0.2)]" : 
                isComplete ? "border-[#d4af37] bg-[#d4af37] text-[#121212]" : 
                "border-white/10 text-[#99907c] hover:border-white/30 hover:text-[#d0c5af]"
              )}
            >
              {isComplete ? <Check size={16} strokeWidth={3} /> : step}
            </button>
          );
        })}
      </div>
    </div>
  );
}
