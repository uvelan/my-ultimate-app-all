import { create } from 'zustand';
import { ATSScore, JDMatchResult } from '@/types/resume-builder';
import { reviewResumeWithAI } from '@/actions/resume-ai';
import { useResumeStore } from './resumeStore';

interface AtsState {
  atsScore: ATSScore | null;
  jdMatch: JDMatchResult | null;
  isScoring: boolean;
  isMatching: boolean;
  
  setAtsScore: (score: ATSScore | null) => void;
  setJdMatch: (match: JDMatchResult | null) => void;
  setIsScoring: (isScoring: boolean) => void;
  setIsMatching: (isMatching: boolean) => void;
  
  fetchAtsScore: (resumeData: any) => Promise<void>;
  fetchJdMatch: (resumeData: any, jobDescription: string) => Promise<void>;
}

export const useAtsStore = create<AtsState>((set) => ({
  atsScore: null,
  jdMatch: null,
  isScoring: false,
  isMatching: false,
  
  setAtsScore: (score) => set({ atsScore: score }),
  setJdMatch: (match) => set({ jdMatch: match }),
  setIsScoring: (isScoring) => set({ isScoring }),
  setIsMatching: (isMatching) => set({ isMatching }),
  
  fetchAtsScore: async (resumeData) => {
    set({ isScoring: true });
    try {
      // Get the active model from resumeStore directly if possible, or pass null
      const activeAiModel = useResumeStore.getState().activeAiModel;
      
      const res = await reviewResumeWithAI(resumeData, activeAiModel);
      if (res.success && res.score) {
        set({ atsScore: res.score });
      } else {
        console.error("Failed to fetch ATS score:", res.error);
        alert(res.error || "Failed to analyze resume with AI.");
      }
    } catch (e) {
      console.error("Failed to fetch ATS score", e);
      alert("An unexpected error occurred during AI analysis.");
    } finally {
      set({ isScoring: false });
    }
  },
  
  fetchJdMatch: async (resumeData, jobDescription) => {
    set({ isMatching: true });
    try {
      const res = await fetch('/api/resume-builder/ai/jd-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeData, jobDescription })
      });
      if (res.ok) {
        const match = await res.json();
        set({ jdMatch: match });
      }
    } catch (e) {
      console.error("Failed to fetch JD match", e);
    } finally {
      set({ isMatching: false });
    }
  }
}));
