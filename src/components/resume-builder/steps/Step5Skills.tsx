'use client';

import { useResumeStore } from '@/store/resume-builder/resumeStore';
import { TagInput } from '@/components/resume-builder/shared/TagInput';
import { Sparkles, Plus, Loader2, Wand2 } from 'lucide-react';
import { ResumeData, SkillsSection } from '@/types/resume-builder';
import { useState } from 'react';
import { suggestMissingSkillsWithAI, validateAndOrganizeSkillsWithAI } from '@/actions/resume-ai';
import { Button } from '@/components/ui/Button';

export function Step5Skills() {
  const { data, updateSkills, setAllSkills, activeAiModel } = useResumeStore();
  const [targetRole, setTargetRole] = useState(data.meta.targetRole || '');
  const [jobDescription, setJobDescription] = useState('');
  const [suggestedSkills, setSuggestedSkills] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const handleSkillsChange = (category: keyof ResumeData['skills'], newTags: string[]) => {
    updateSkills(category, newTags);
  };

  const addMissingSkill = (skill: string) => {
    const currentTechnical = data.skills?.technical || [];
    if (!currentTechnical.includes(skill)) {
      updateSkills('technical', [...currentTechnical, skill]);
      setSuggestedSkills(prev => prev.filter(s => s !== skill));
    }
  };

  const handleSuggest = async () => {
    setIsLoading(true);
    try {
      const res = await suggestMissingSkillsWithAI(data, targetRole, jobDescription, activeAiModel);
      if (res.success && res.skills) {
        setSuggestedSkills(res.skills);
      } else {
        alert(res.error || 'Failed to suggest skills.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred during AI suggestion.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleValidateSkills = async () => {
    setIsValidating(true);
    try {
      const res = await validateAndOrganizeSkillsWithAI(data.skills, activeAiModel);
      if (res.success && res.skills) {
        setAllSkills(res.skills as SkillsSection);
      } else {
        alert(res.error || 'Failed to validate skills.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred during AI validation.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-surface rounded-xl shadow-sm border border-border p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-bold text-[#e5e2e1] mb-1">Skills</h2>
            <p className="text-sm text-text-muted">Highlight your top technical, soft, and tool-based skills.</p>
          </div>
          <Button 
            onClick={handleValidateSkills} 
            disabled={isValidating}
            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-none h-9 text-sm"
          >
            {isValidating ? <Loader2 size={16} className="animate-spin mr-2" /> : <Wand2 size={16} className="mr-2" />}
            {isValidating ? 'Validating...' : 'Auto-Organize & Fix Spelling'}
          </Button>
        </div>

        <div className="space-y-6">
          <TagInput 
            label="Programming Languages" 
            tags={data.skills.languages} 
            onChange={(t) => handleSkillsChange('languages', t)} 
            placeholder="e.g. Java, Python, TypeScript..."
          />
          <TagInput 
            label="Technical Skills" 
            tags={data.skills.technical} 
            onChange={(t) => handleSkillsChange('technical', t)} 
            placeholder="e.g. React, Node.js, Spring Boot..."
          />
          <TagInput 
            label="Frameworks & Libraries" 
            tags={data.skills.frameworks} 
            onChange={(t) => handleSkillsChange('frameworks', t)} 
            placeholder="e.g. Express, Django, Next.js..."
          />
          <TagInput 
            label="Tools" 
            tags={data.skills.tools} 
            onChange={(t) => handleSkillsChange('tools', t)} 
            placeholder="e.g. Git, Jira, Figma..."
          />
          <TagInput 
            label="Platforms & Cloud" 
            tags={data.skills.platforms} 
            onChange={(t) => handleSkillsChange('platforms', t)} 
            placeholder="e.g. AWS, GCP, Vercel..."
          />
          <TagInput 
            label="Soft Skills" 
            tags={data.skills.soft} 
            onChange={(t) => handleSkillsChange('soft', t)} 
            placeholder="e.g. Leadership, Communication..."
          />
        </div>
      </div>

      {/* AI Missing Skills Panel */}
      <div className="bg-surface rounded-xl shadow-sm border border-border p-6 flex flex-col relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-purple-500" />
        <div className="flex items-center gap-2 mb-4 text-indigo-600">
          <Sparkles size={18} />
          <h3 className="font-bold">AI Skill Gap Analysis</h3>
        </div>
        <p className="text-sm text-text-muted mb-4">Let AI compare your current profile against a target role or job description to find missing skills.</p>
        
        <div className="flex flex-col gap-3 mb-5">
          <input 
            type="text" 
            placeholder="Target Job Role (e.g. Senior Frontend Engineer)" 
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            className="w-full text-sm border border-border rounded-md p-2 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
          <textarea 
            placeholder="Optional: Paste Job Description here..." 
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            className="w-full text-sm border border-border rounded-md p-2 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none min-h-[60px] resize-y"
          />
          <Button 
            onClick={handleSuggest} 
            disabled={isLoading}
            className="self-start bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-none h-8 px-3 text-xs"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Sparkles size={14} className="mr-1.5" />}
            {isLoading ? 'Analyzing...' : 'Detect Missing Skills'}
          </Button>
        </div>

        {suggestedSkills.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2 pt-4 border-t border-slate-100">
            {suggestedSkills.map(skill => (
              <button 
                key={skill}
                onClick={() => addMissingSkill(skill)}
                className="flex items-center gap-1 text-sm bg-surface border border-border shadow-sm px-3 py-1.5 rounded-full hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all text-text-secondary"
              >
                <Plus size={14} />
                {skill}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
