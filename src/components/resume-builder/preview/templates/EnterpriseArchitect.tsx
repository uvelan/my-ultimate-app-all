'use client';

import { ResumeData, TemplateCustomization } from '@/types/resume-builder';
import { Database, Server, GitMerge, LayoutGrid, Mail, Phone, MapPin, Linkedin, Github, Globe, Hexagon, Layers, Cpu, Cloud, Workflow, Terminal } from 'lucide-react';
import { formatMonthYear } from '@/lib/utils';

interface TemplateProps {
  data: ResumeData;
  customization: TemplateCustomization;
}

export function EnterpriseArchitect({ data, customization }: TemplateProps) {
  const { personalInfo, summary = '', experience = [], education = [], skills } = data || ({} as ResumeData);
  const accentColor = customization?.accentColor || '#10B981'; // Emerald/Green theme by default

  return (
    <div className="flex flex-col h-full w-full text-[11.5px] leading-[1.6] text-slate-800 bg-white" style={{ fontFamily: 'var(--font-classic), serif' }}>
      {/* Heavy Header */}
      <header className="w-full bg-slate-900 text-slate-100 p-8 flex flex-col items-center justify-center text-center relative border-b-[6px]" style={{ borderColor: accentColor }}>
        <h1 className="text-4xl font-bold tracking-tight mb-2" style={{ fontFamily: 'var(--font-display)' }}>
          {personalInfo?.fullName || 'Backend Developer'}
        </h1>
        <h2 className="text-[14px] font-medium tracking-[0.2em] uppercase text-slate-300 mb-4">
          {personalInfo?.professionalTitle || 'Enterprise Architect'}
        </h2>
        
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs font-mono text-slate-400">
           {personalInfo?.email && <span>{personalInfo.email}</span>}
           {personalInfo?.phone && <span>{personalInfo.phone}</span>}
           {personalInfo?.location && <span>{personalInfo.location}</span>}
           {personalInfo?.gitHub && <span>{personalInfo.gitHub.replace('https://', '')}</span>}
        </div>
      </header>

      {/* Grid Content */}
      <div className="flex-1 p-8 grid grid-cols-12 gap-8">
        
        {/* Main Column - Experience */}
        <div className="col-span-8 flex flex-col gap-6">
          {summary && (
            <section>
              <h3 className="text-[14px] font-bold uppercase tracking-widest mb-2 pb-1 border-b-2" style={{ borderColor: accentColor, color: 'var(--slate-900)' }}>
                Executive Profile
              </h3>
              <div className="text-slate-700 font-sans" dangerouslySetInnerHTML={{ __html: summary }} />
            </section>
          )}

          {experience?.length > 0 && (
            <section>
              <h3 className="text-[14px] font-bold uppercase tracking-widest mb-4 pb-1 border-b-2" style={{ borderColor: accentColor }}>
                System Architecture & Experience
              </h3>
              <div className="flex flex-col gap-6 font-sans">
                {experience.map(exp => (
                  <div key={exp.id} className="flex flex-col">
                    <div className="flex justify-between items-baseline border-b border-slate-100 pb-1 mb-2">
                      <div className="flex items-center gap-2">
                        <Server size={14} style={{ color: accentColor }} />
                        <h4 className="font-bold text-[14px] text-slate-900">{exp.position}</h4>
                        <span className="text-slate-400 text-[13px]">at</span>
                        <span className="font-bold text-[13px]" style={{ color: accentColor }}>{exp.company}</span>
                      </div>
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
                        {formatMonthYear(exp.startDate)} — {exp.isCurrent ? 'Present' : formatMonthYear(exp.endDate)}
                      </span>
                    </div>
                    
                    <ul className="list-square list-inside flex flex-col gap-1.5 text-slate-700 pl-2">
                      {exp.achievements?.map((bullet, i) => (
                        bullet ? <li key={i} className="pl-1"><span className="relative -left-1">{bullet}</span></li> : null
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Side Column - Technical Domain */}
        <div className="col-span-4 flex flex-col gap-6">
          <section>
            <h3 className="text-[14px] font-bold uppercase tracking-widest mb-3 pb-1 border-b-2" style={{ borderColor: accentColor }}>
              Technical Domain
            </h3>
            
            <div className="grid grid-cols-2 gap-x-8 gap-y-6">
              {skills?.languages?.length > 0 && (
                <div>
                  <h4 className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                    <Terminal size={12} style={{ color: accentColor }} /> Programming Languages
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {skills.languages.map(skill => (
                      <span key={skill} className="px-2.5 py-1 bg-white border border-gray-200 rounded-sm shadow-sm text-gray-800 text-[10px] font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {skills?.platforms?.length > 0 && (
                <div>
                  <h4 className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                    <Cloud size={12} style={{ color: accentColor }} /> Cloud & Infrastructure
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {skills.platforms.map(skill => (
                      <span key={skill} className="px-2.5 py-1 bg-[#1e293b] text-white rounded-sm shadow-sm text-[10px] font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {skills?.technical?.length > 0 && (
                <div>
                  <h4 className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                    <Cpu size={12} style={{ color: accentColor }} /> Core Technologies
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {skills.technical.map(skill => (
                      <span key={skill} className="px-2.5 py-1 bg-white border border-gray-200 rounded-sm shadow-sm text-gray-800 text-[10px] font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {skills?.frameworks?.length > 0 && (
                <div>
                  <h4 className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                    <Layers size={12} style={{ color: accentColor }} /> Architecture & Frameworks
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {skills.frameworks.map(skill => (
                      <span key={skill} className="px-2.5 py-1 bg-white border border-gray-200 rounded-sm shadow-sm text-gray-800 text-[10px] font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {skills?.tools?.length > 0 && (
                <div>
                  <h4 className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                    <Workflow size={12} style={{ color: accentColor }} /> DevOps & Tools
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {skills.tools.map(skill => (
                      <span key={skill} className="px-2.5 py-1 bg-white border border-gray-200 rounded-sm shadow-sm text-gray-800 text-[10px] font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {education?.length > 0 && (
            <section>
              <h3 className="text-[14px] font-bold uppercase tracking-widest mb-3 pb-1 border-b-2" style={{ borderColor: accentColor }}>
                Academic
              </h3>
              <div className="flex flex-col gap-3 font-sans">
                {education.map(edu => (
                  <div key={edu.id} className="bg-slate-50 p-3 rounded-md border border-slate-200">
                    <div className="font-bold text-[12px] text-slate-900">{edu.degree}</div>
                    <div className="text-slate-600 text-[11px] mb-1">{edu.institution}</div>
                    <div className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                      {formatMonthYear(edu.graduationDate)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
