'use client';

import { useAtsStore } from '@/store/resume-builder/atsStore';
import { useResumeStore } from '@/store/resume-builder/resumeStore';
import { AlertCircle, Info, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { resumeAtsChecklist } from '@/lib/resume-document';

export function Step10Review() {
  const { atsScore, isScoring, fetchAtsScore } = useAtsStore();
  const { data, updateMeta } = useResumeStore();

  const handleAiScan = () => {
    fetchAtsScore(data);
  };

  const score = atsScore;

  return (
    <div className="space-y-6">
      <div className="flex flex-row flex-wrap justify-between items-center gap-4 mb-6">
        <h2 className="text-xl lg:text-2xl font-bold text-[#e5e2e1]">Final Review & ATS Dashboard</h2>
        <Button 
          onClick={handleAiScan}
          disabled={isScoring}
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-md transition-all whitespace-nowrap"
        >
          {isScoring ? <Loader2 className="animate-spin mr-1.5" size={16} /> : <Sparkles className="mr-1.5" size={16} />}
          {isScoring ? 'Scanning...' : 'Run Deep AI Scan'}
        </Button>
      </div>

      <div className="bg-surface rounded-xl border border-border p-5 space-y-2">
        <h3 className="font-bold text-text-primary">ATS checklist</h3>
        <p className="text-sm text-text-secondary">ATS Classic uses one column, standard headings, and selectable text.</p>
        <ul className="space-y-1 text-sm text-text-primary">
          {resumeAtsChecklist(data).map(check => <li key={check.label}>{check.ready ? '✓' : '○'} {check.label}</li>)}
        </ul>
        <Button size="sm" onClick={() => updateMeta({ templateId: 'ats-optimized' })}>Use ATS Classic</Button>
      </div>
      {isScoring && !score && <p role="status" className="text-text-secondary">Scanning resume…</p>}
      {score && <><div className="bg-surface rounded-xl shadow-sm border border-border overflow-hidden relative">
        {/* Loading Overlay */}
        {isScoring && (
          <div className="absolute inset-0 bg-surface/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-3" />
            <div className="text-base font-bold text-text-primary">Scanning Resume...</div>
            <div className="text-xs text-text-muted">Checking keywords, formatting, and impact.</div>
          </div>
        )}
        
        {/* Top gauge area */}
        <div className="p-6 border-b border-border flex flex-col items-center text-center">
          <div className="relative mb-4">
            <svg className="w-36 h-36 transform -rotate-90">
              <circle cx="72" cy="72" r="60" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-slate-100" />
              <circle cx="72" cy="72" r="60" stroke="currentColor" strokeWidth="10" fill="transparent" 
                strokeDasharray="377" strokeDashoffset={377 * (1 - score.overall / 100)} className="text-indigo-600 transition-all duration-1000 ease-out" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-extrabold text-text-primary">{score.overall}</span>
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider mt-1">AI estimate</span>
            </div>
          </div>
          <p className="text-text-muted max-w-sm">
            {score.overall >= 90 
              ? "Outstanding! Your resume is highly optimized and ready for top-tier applications."
              : score.overall >= 70
              ? "Great job! Your resume is strong. A few minor tweaks could push it even higher."
              : score.overall >= 50
              ? "Good start. You have the basics down, but there's room for significant improvement."
              : "Needs work. We strongly recommend following the suggestions below to improve your score."
            }
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 bg-surface-2">
          <div className="p-6 flex flex-col gap-2">
            <div className="flex justify-between text-sm font-medium">
              <span className="text-text-secondary">Keyword Coverage</span>
              <span className="text-text-primary">{score.keywordCoveragePct}%</span>
            </div>
            <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${score.keywordCoveragePct}%` }} />
            </div>
          </div>
          <div className="p-6 flex flex-col gap-2">
            <div className="flex justify-between text-sm font-medium">
              <span className="text-text-secondary">Recruiter Readiness</span>
              <span className="text-text-primary">{score.recruiterReadiness}%</span>
            </div>
            <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${score.recruiterReadiness}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Suggestions List */}
      <div className="bg-surface rounded-xl shadow-sm border border-border p-6">
        <h3 className="text-lg font-bold text-text-primary mb-4">Improvement Suggestions</h3>
        <div className="space-y-4">
          {score.suggestions.map((suggestion, i) => (
            <div key={i} className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-surface-2/50 hover:bg-surface-2 transition-colors">
              <div className="mt-0.5">
                {suggestion.severity === 'error' && <AlertCircle className="text-red-500" size={20} />}
                {suggestion.severity === 'warning' && <AlertCircle className="text-amber-500" size={20} />}
                {suggestion.severity === 'info' && <Info className="text-blue-500" size={20} />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide",
                    suggestion.severity === 'error' ? "bg-red-100 text-red-700" :
                    suggestion.severity === 'warning' ? "bg-amber-100 text-amber-700" :
                    "bg-blue-100 text-blue-700"
                  )}>
                    {suggestion.section}
                  </span>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed">{suggestion.message}</p>
              </div>
            </div>
          ))}
        </div>
      </div></>}
    </div>
  );
}
