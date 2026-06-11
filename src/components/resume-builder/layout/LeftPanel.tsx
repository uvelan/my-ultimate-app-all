'use client';

import { useUiStore } from '@/store/resume-builder/uiStore';
import { useResumeStore } from '@/store/resume-builder/resumeStore';
import { useAtsStore } from '@/store/resume-builder/atsStore';
import { cn } from '@/lib/utils';
import { 
  User, FileText, Briefcase, GraduationCap, 
  Wrench, FolderGit2, Award, Trophy, BookOpen, CheckCircle,
  LayoutTemplate, Target
} from 'lucide-react';
import { TemplateId } from '@/types/resume-builder';
import { calculateAtsScore } from '@/lib/utils';

const SECTIONS = [
  { id: 1, label: 'Personal Info', icon: User },
  { id: 2, label: 'Summary', icon: FileText },
  { id: 3, label: 'Experience', icon: Briefcase },
  { id: 4, label: 'Education', icon: GraduationCap },
  { id: 5, label: 'Skills', icon: Wrench },
  { id: 6, label: 'Projects', icon: FolderGit2 },
  { id: 7, label: 'Certifications', icon: Award },
  { id: 8, label: 'Awards', icon: Trophy },
  { id: 9, label: 'Publications', icon: BookOpen },
  { id: 10, label: 'Review & ATS', icon: Target },
];

const TEMPLATES: { id: TemplateId | 'stitch-premium'; name: string; color: string }[] = [
  { id: 'stitch-premium', name: 'Stitch', color: '#050505' },
  { id: 'modern-professional', name: 'Modern', color: '#4F46E5' },
  { id: 'executive-premium', name: 'Executive', color: '#0F172A' },
  { id: 'minimal-corporate', name: 'Minimal', color: '#334155' },
  { id: 'software-engineer-elite', name: 'Full Stack', color: '#6366F1' },
  { id: 'enterprise-architect', name: 'Backend', color: '#10B981' },
];

export function LeftPanel() {
  const { activeStep, setActiveStep, isTemplateGalleryExpanded, setTemplateGalleryExpanded } = useUiStore();
  const { data, updateMeta } = useResumeStore();
  const { atsScore: aiAtsScore } = useAtsStore();
  const currentTemplate = data.meta.templateId;
  const hasAtsScore = aiAtsScore && aiAtsScore.overall !== undefined;
  const atsScore = aiAtsScore?.overall || 0;
  
  return (
    <div className="h-full w-[230px] shrink-0 bg-[#050505] flex flex-col text-[#e5e2e1] border-r border-white/10 shadow-2xl z-10 relative">
      {/* Branding / Title Area */}
      <div className="px-4 py-4 border-b border-white/5">
        <h2 className="text-xs font-bold text-[#99907c] uppercase tracking-[0.2em]">Resume Sections</h2>
      </div>

      {/* Section Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5 scrollbar-thin scrollbar-thumb-white/10">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = activeStep === section.id;
          
          return (
            <button
              key={section.id}
              onClick={() => setActiveStep(section.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-medium transition-all text-left group",
                isActive 
                  ? "bg-[#d4af37]/10 text-[#d4af37]" 
                  : "text-[#d0c5af] hover:bg-white/5 hover:text-[#e5e2e1]"
              )}
            >
              <Icon size={16} className={isActive ? "text-[#d4af37]" : "text-[#99907c] group-hover:text-[#d0c5af] transition-colors"} />
              <span className="flex-1 tracking-wide">{section.label}</span>
              {section.id < activeStep && !isActive && (
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
              )}
            </button>
          );
        })}
      </div>

      {/* Template Selector Area */}
      <div className="flex-1 flex flex-col border-t border-white/5 bg-[#050505]/50 overflow-hidden">
        <div className="px-4 py-4 shrink-0 bg-[#050505]">
          <button 
            onClick={() => setTemplateGalleryExpanded(!isTemplateGalleryExpanded)}
            className="flex items-center justify-between w-full text-[13px] font-semibold text-[#e5e2e1] hover:text-white transition-colors"
          >
            <div className="flex items-center gap-2 tracking-wide">
              <LayoutTemplate size={16} className="text-[#d4af37]" />
              <span className="uppercase tracking-wider text-[11px]">Templates</span>
            </div>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 pb-5 scrollbar-thin scrollbar-thumb-white/10">
          <div className="grid grid-cols-2 gap-3">
            {TEMPLATES.map(template => {
              const isSelected = currentTemplate === template.id;
              return (
                <button 
                  key={template.id}
                  onClick={() => updateMeta({ templateId: template.id })}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div 
                    className={cn(
                      "w-full aspect-[1/1.4] rounded-md shadow-sm transition-all duration-300 relative overflow-hidden",
                      isSelected ? "ring-2 ring-[#d4af37] ring-offset-2 ring-offset-[#050505] border-transparent" : "border border-white/10 hover:border-white/30"
                    )}
                    style={{ backgroundColor: isSelected ? 'white' : '#1c1b1b' }}
                  >
                    {/* Decorative mini layout to look like a template */}
                    <div className="absolute top-0 left-0 w-full h-2" style={{ backgroundColor: template.color }} />
                    <div className="absolute top-4 left-2 w-3/4 h-1 bg-slate-300 rounded-full" />
                    <div className="absolute top-6 left-2 w-1/2 h-1 bg-slate-200 rounded-full" />
                    <div className="absolute top-10 left-2 w-5/6 h-[1px] bg-slate-200" />
                  </div>
                  <span className={cn(
                    "text-[10px] uppercase tracking-wider font-semibold transition-colors",
                    isSelected ? "text-[#d4af37]" : "text-[#99907c] group-hover:text-[#d0c5af]"
                  )}>
                    {template.name}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Mini ATS Score Ring */}
      <div className="px-4 py-5 border-t border-white/5 bg-[#050505]">
        <div className="text-[10px] font-bold text-[#99907c] uppercase tracking-widest mb-3">ATS Analysis</div>
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center relative w-12 h-12">
            <svg className="w-12 h-12 transform -rotate-90">
              <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-slate-800" />
              {hasAtsScore && (
                <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="3" fill="transparent" 
                  strokeDasharray="125.6" strokeDashoffset={125.6 * (1 - (atsScore / 100))} className="text-emerald-500 transition-all duration-1000" />
              )}
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-sm font-bold text-white">{hasAtsScore ? atsScore : '?'}</span>
            </div>
          </div>
          <div className="flex-1">
            <div className="text-[10px] text-slate-400 tracking-wide">Optimization</div>
            <div className={cn(
              "text-xs font-semibold",
              !hasAtsScore ? "text-[#99907c]" :
              atsScore > 75 ? "text-emerald-400" : 
              atsScore > 50 ? "text-amber-400" : "text-red-400"
            )}>
              {!hasAtsScore ? 'Not Scanned' : atsScore > 75 ? 'Excellent' : atsScore > 50 ? 'Good' : 'Needs Work'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
