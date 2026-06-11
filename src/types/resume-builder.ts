export type TemplateId = 
  | 'executive-premium' 
  | 'modern-professional' 
  | 'ats-optimized' 
  | 'silicon-valley' 
  | 'enterprise-architect' 
  | 'software-engineer-elite' 
  | 'product-manager' 
  | 'data-science' 
  | 'minimal-corporate' 
  | 'creative-professional';

export interface TemplateCustomization {
  accentColor: string;
  fontPairing: 'modern' | 'classic' | 'mono' | 'serif';
  fontSizeScale: 'S' | 'M' | 'L' | 'XL';
  spacingDensity: 'compact' | 'balanced' | 'airy';
  columnLayout: '1-col' | '2-col';
  sectionOrder: string[];
  hiddenSections: string[];
}

export interface PersonalInfo {
  fullName: string;
  professionalTitle: string;
  email: string;
  phone: string;
  location: string;
  linkedIn?: string;
  gitHub?: string;
  portfolio?: string;
  photoUrl?: string;
}

export interface WorkExperience {
  id: string;
  company: string;
  position: string;
  employmentType: 'Full-time' | 'Part-time' | 'Contract' | 'Freelance' | 'Internship';
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
  responsibilities: string[];
  achievements: string[];
  technologies: string[];
}

export interface Education {
  id: string;
  degree: string;
  institution: string;
  gpa?: string;
  graduationDate: string;
  certifications?: string[];
}

export interface SkillsSection {
  technical: string[];
  soft: string[];
  tools: string[];
  frameworks: string[];
  platforms: string[];
  languages: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  technologies: string[];
  gitHubUrl?: string;
  liveUrl?: string;
  achievements: string[];
}

export interface Certification {
  id: string;
  name: string;
  issuingOrg: string;
  issueDate: string;
  credentialUrl?: string;
}

export interface Award {
  id: string;
  name: string;
  date: string;
  description?: string;
}

export interface Publication {
  id: string;
  title: string;
  publisher: string;
  link?: string;
}

export interface ResumeMeta {
  createdAt: string;
  updatedAt: string;
  templateId: TemplateId;
  customization: TemplateCustomization;
  targetRole?: string;
}

export interface ResumeData {
  id: string;
  personalInfo: PersonalInfo;
  summary: string;
  experience: WorkExperience[];
  education: Education[];
  skills: SkillsSection;
  projects: Project[];
  certifications: Certification[];
  awards: Award[];
  publications: Publication[];
  meta: ResumeMeta;
}

export interface ATSSuggestion {
  severity: 'error' | 'warning' | 'info';
  section: string;
  message: string;
  actionLabel?: string;
}

export interface ATSScore {
  overall: number;
  readabilityGrade: string;
  keywordCoveragePct: number;
  missingKeywords: string[];
  sectionCompleteness: Record<string, number>;
  recruiterReadiness: number;
  formattingIssues: string[];
  suggestions: ATSSuggestion[];
}

export interface JDMatchResult {
  matchScorePct: number;
  missingKeywords: string[];
  requiredSkills: string[];
  presentSkills: string[];
  gapAnalysis: string[];
  aiSuggestions: string[];
}
