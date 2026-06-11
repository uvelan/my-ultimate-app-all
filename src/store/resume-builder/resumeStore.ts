import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ResumeData, TemplateId } from '@/types/resume-builder';

interface ResumeState {
  data: ResumeData;
  activeAiModel: string;
  setActiveAiModel: (modelId: string) => void;

  updatePersonalInfo: (info: Partial<ResumeData['personalInfo']>) => void;
  updateSummary: (summary: string) => void;
  
  // Array operations
  addExperience: (exp: ResumeData['experience'][0]) => void;
  updateExperience: (id: string, exp: Partial<ResumeData['experience'][0]>) => void;
  removeExperience: (id: string) => void;
  reorderExperience: (startIndex: number, endIndex: number) => void;

  addEducation: (edu: ResumeData['education'][0]) => void;
  updateEducation: (id: string, edu: Partial<ResumeData['education'][0]>) => void;
  removeEducation: (id: string) => void;
  reorderEducation: (startIndex: number, endIndex: number) => void;

  updateSkills: (category: keyof ResumeData['skills'], skills: string[]) => void;
  setAllSkills: (skills: ResumeData['skills']) => void;

  addProject: (proj: ResumeData['projects'][0]) => void;
  updateProject: (id: string, proj: Partial<ResumeData['projects'][0]>) => void;
  removeProject: (id: string) => void;
  reorderProject: (startIndex: number, endIndex: number) => void;

  addCertification: (cert: ResumeData['certifications'][0]) => void;
  updateCertification: (id: string, cert: Partial<ResumeData['certifications'][0]>) => void;
  removeCertification: (id: string) => void;
  reorderCertification: (startIndex: number, endIndex: number) => void;

  addAward: (award: ResumeData['awards'][0]) => void;
  updateAward: (id: string, award: Partial<ResumeData['awards'][0]>) => void;
  removeAward: (id: string) => void;
  reorderAward: (startIndex: number, endIndex: number) => void;

  addPublication: (pub: ResumeData['publications'][0]) => void;
  updatePublication: (id: string, pub: Partial<ResumeData['publications'][0]>) => void;
  removePublication: (id: string) => void;
  reorderPublication: (startIndex: number, endIndex: number) => void;

  updateMeta: (meta: Partial<ResumeData['meta']>) => void;
  
  setFullData: (data: ResumeData) => void;
}

const initialData: ResumeData = {
  id: '',
  personalInfo: {
    fullName: '',
    professionalTitle: '',
    email: '',
    phone: '',
    location: '',
  },
  summary: '',
  experience: [],
  education: [],
  skills: {
    technical: [],
    soft: [],
    tools: [],
    frameworks: [],
    platforms: [],
    languages: [],
  },
  projects: [],
  certifications: [],
  awards: [],
  publications: [],
  meta: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    templateId: 'modern-professional' as TemplateId,
    customization: {
      accentColor: '#4F46E5',
      fontPairing: 'modern',
      fontSizeScale: 'M',
      spacingDensity: 'balanced',
      columnLayout: '2-col',
      sectionOrder: ['experience', 'education', 'skills', 'projects', 'certifications', 'awards', 'publications'],
      hiddenSections: [],
    }
  }
};

const reorder = <T>(list: T[], startIndex: number, endIndex: number): T[] => {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
};

export const useResumeStore = create<ResumeState>()(
  persist(
    (set) => ({
      data: initialData,
      activeAiModel: '',
      setActiveAiModel: (modelId) => set({ activeAiModel: modelId }),
      
      updatePersonalInfo: (info) => set((state) => ({ 
        data: { ...state.data, personalInfo: { ...state.data.personalInfo, ...info }, meta: { ...state.data.meta, updatedAt: new Date().toISOString() } } 
      })),
      
      updateSummary: (summary) => set((state) => ({ 
        data: { ...state.data, summary, meta: { ...state.data.meta, updatedAt: new Date().toISOString() } } 
      })),

      addExperience: (exp) => set((state) => ({
        data: { ...state.data, experience: [...state.data.experience, exp], meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      updateExperience: (id, exp) => set((state) => ({
        data: { ...state.data, experience: state.data.experience.map(e => e.id === id ? { ...e, ...exp } : e), meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      removeExperience: (id) => set((state) => ({
        data: { ...state.data, experience: state.data.experience.filter(e => e.id !== id), meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      reorderExperience: (start, end) => set((state) => ({
        data: { ...state.data, experience: reorder(state.data.experience, start, end), meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),

      addEducation: (edu) => set((state) => ({
        data: { ...state.data, education: [...state.data.education, edu], meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      updateEducation: (id, edu) => set((state) => ({
        data: { ...state.data, education: state.data.education.map(e => e.id === id ? { ...e, ...edu } : e), meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      removeEducation: (id) => set((state) => ({
        data: { ...state.data, education: state.data.education.filter(e => e.id !== id), meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      reorderEducation: (start, end) => set((state) => ({
        data: { ...state.data, education: reorder(state.data.education, start, end), meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),

      updateSkills: (category, skills) => set((state) => ({
        data: { ...state.data, skills: { ...state.data.skills, [category]: skills }, meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      
      setAllSkills: (skills) => set((state) => ({
        data: { ...state.data, skills, meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),

      addProject: (proj) => set((state) => ({
        data: { ...state.data, projects: [...state.data.projects, proj], meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      updateProject: (id, proj) => set((state) => ({
        data: { ...state.data, projects: state.data.projects.map(p => p.id === id ? { ...p, ...proj } : p), meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      removeProject: (id) => set((state) => ({
        data: { ...state.data, projects: state.data.projects.filter(p => p.id !== id), meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      reorderProject: (start, end) => set((state) => ({
        data: { ...state.data, projects: reorder(state.data.projects, start, end), meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),

      addCertification: (cert) => set((state) => ({
        data: { ...state.data, certifications: [...state.data.certifications, cert], meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      updateCertification: (id, cert) => set((state) => ({
        data: { ...state.data, certifications: state.data.certifications.map(c => c.id === id ? { ...c, ...cert } : c), meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      removeCertification: (id) => set((state) => ({
        data: { ...state.data, certifications: state.data.certifications.filter(c => c.id !== id), meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      reorderCertification: (start, end) => set((state) => ({
        data: { ...state.data, certifications: reorder(state.data.certifications, start, end), meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),

      addAward: (award) => set((state) => ({
        data: { ...state.data, awards: [...state.data.awards, award], meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      updateAward: (id, award) => set((state) => ({
        data: { ...state.data, awards: state.data.awards.map(a => a.id === id ? { ...a, ...award } : a), meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      removeAward: (id) => set((state) => ({
        data: { ...state.data, awards: state.data.awards.filter(a => a.id !== id), meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      reorderAward: (start, end) => set((state) => ({
        data: { ...state.data, awards: reorder(state.data.awards, start, end), meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),

      addPublication: (pub) => set((state) => ({
        data: { ...state.data, publications: [...state.data.publications, pub], meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      updatePublication: (id, pub) => set((state) => ({
        data: { ...state.data, publications: state.data.publications.map(p => p.id === id ? { ...p, ...pub } : p), meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      removePublication: (id) => set((state) => ({
        data: { ...state.data, publications: state.data.publications.filter(p => p.id !== id), meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),
      reorderPublication: (start, end) => set((state) => ({
        data: { ...state.data, publications: reorder(state.data.publications, start, end), meta: { ...state.data.meta, updatedAt: new Date().toISOString() } }
      })),

      updateMeta: (meta) => set((state) => ({
        data: { ...state.data, meta: { ...state.data.meta, ...meta, updatedAt: new Date().toISOString() } }
      })),

      setFullData: (data) => set({ data }),
    }),
    {
      name: 'resume-builder-draft',
    }
  )
);
