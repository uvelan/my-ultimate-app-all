'use client';

import { useAtsStore } from '@/store/resume-builder/atsStore';
import { useResumeStore } from '@/store/resume-builder/resumeStore';
import { AlertCircle, CheckCircle2, Info, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { cn, calculateAtsScore } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

export function Step10Review() {
  const { atsScore, isScoring, fetchAtsScore } = useAtsStore();
  const { data } = useResumeStore();

  const handleAiScan = () => {
    fetchAtsScore(data);
  };

  const calculatedOverall = calculateAtsScore(data);

  // Dynamic score based on actual user data if not fully analyzed by AI
  const score = atsScore || {
    overall: calculatedOverall,
    readabilityGrade: calculatedOverall > 80 ? 'A' : calculatedOverall > 60 ? 'B' : 'C',
    keywordCoveragePct: Math.min(100, Math.max(10, calculatedOverall - 4)),
    recruiterReadiness: Math.min(100, Math.max(10, calculatedOverall + 3)),
    missingKeywords: ['Agile', 'Docker', 'GraphQL'],
    sectionCompleteness: { personal: 100, experience: data.experience?.length > 0 ? 100 : 0, education: data.education?.length > 0 ? 100 : 0 },
    suggestions: [
      data.experience?.length === 0 ? { severity: 'error', section: 'Experience', message: 'You have not added any experience. Recruiter readiness is severely impacted.', actionLabel: 'Add Experience' } : null,
      (data.summary?.length || 0) < 50 ? { severity: 'warning', section: 'Summary', message: 'Summary is a bit short. Consider adding 1-2 more impactful sentences.', actionLabel: 'Use AI Writer' } : null,
      (!data.skills?.technical || data.skills.technical.length < 3) ? { severity: 'info', section: 'Skills', message: 'You have very few technical skills listed. Add more to improve keyword coverage.' } : { severity: 'info', section: 'Skills', message: 'Your skills list is looking healthy, ensure they match the job description.' }
    ].filter(Boolean) as any[]
  };

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

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
        {/* Loading Overlay */}
        {isScoring && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-3" />
            <div className="text-base font-bold text-slate-900">Scanning Resume...</div>
            <div className="text-xs text-slate-500">Checking keywords, formatting, and impact.</div>
          </div>
        )}
        
        {/* Top gauge area */}
        <div className="p-6 border-b border-slate-200 flex flex-col items-center text-center">
          <div className="relative mb-4">
            <svg className="w-36 h-36 transform -rotate-90">
              <circle cx="72" cy="72" r="60" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-slate-100" />
              <circle cx="72" cy="72" r="60" stroke="currentColor" strokeWidth="10" fill="transparent" 
                strokeDasharray="377" strokeDashoffset={377 * (1 - score.overall / 100)} className="text-indigo-600 transition-all duration-1000 ease-out" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-extrabold text-slate-900">{score.overall}</span>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">ATS Score</span>
            </div>
          </div>
          <p className="text-slate-600 max-w-sm">
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
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 bg-slate-50">
          <div className="p-6 flex flex-col gap-2">
            <div className="flex justify-between text-sm font-medium">
              <span className="text-slate-700">Keyword Coverage</span>
              <span className="text-slate-900">{score.keywordCoveragePct}%</span>
            </div>
            <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${score.keywordCoveragePct}%` }} />
            </div>
          </div>
          <div className="p-6 flex flex-col gap-2">
            <div className="flex justify-between text-sm font-medium">
              <span className="text-slate-700">Recruiter Readiness</span>
              <span className="text-slate-900">{score.recruiterReadiness}%</span>
            </div>
            <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${score.recruiterReadiness}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Suggestions List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Improvement Suggestions</h3>
        <div className="space-y-4">
          {score.suggestions.map((suggestion, i) => (
            <div key={i} className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
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
                <p className="text-sm text-slate-700 leading-relaxed">{suggestion.message}</p>
                {suggestion.actionLabel && (
                  <button className="mt-3 text-sm font-medium text-indigo-600 flex items-center gap-1 hover:text-indigo-700 transition-colors">
                    {suggestion.actionLabel} <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
