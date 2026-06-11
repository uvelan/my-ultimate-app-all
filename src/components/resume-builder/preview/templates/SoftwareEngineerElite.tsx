'use client';

import { ResumeData, TemplateCustomization } from '@/types/resume-builder';
import { Mail, Phone, Github, Linkedin, Globe, Code, Box, Layers, Terminal, Server, MapPin } from 'lucide-react';
import { formatMonthYear } from '@/lib/utils';

interface TemplateProps {
  data: ResumeData;
  customization: TemplateCustomization;
}

export function SoftwareEngineerElite({ data, customization }: TemplateProps) {
  const { personalInfo = {}, summary = '', experience = [], education = [], skills = { languages: [], technical: [], frameworks: [], tools: [], platforms: [] }, projects = [] } = data || {};
  const accentColor = customization?.accentColor || '#6366F1';

  return (
    <div className="flex flex-col h-full w-full text-[11px] leading-[1.6] text-gray-800 bg-white" style={{ fontFamily: 'var(--font-mono), monospace' }}>
      {/* Header Area */}
      <header className="w-full px-8 pt-8 pb-6 border-b-2" style={{ borderColor: accentColor }}>
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-gray-900 mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              {personalInfo?.fullName || 'Full Stack Developer'}
            </h1>
            <h2 className="text-[14px] font-bold tracking-widest uppercase" style={{ color: accentColor }}>
              {personalInfo?.professionalTitle || 'Software Engineer Elite'}
            </h2>
          </div>
          <div className="flex gap-4 text-xs font-semibold text-gray-600 pb-1">
             {personalInfo?.email && <span className="flex items-center gap-1"><Mail size={12} style={{ color: accentColor }}/> {personalInfo.email}</span>}
             {personalInfo?.phone && <span className="flex items-center gap-1"><Phone size={12} style={{ color: accentColor }}/> {personalInfo.phone}</span>}
             {personalInfo?.gitHub && <span className="flex items-center gap-1"><Github size={12} style={{ color: accentColor }}/> {personalInfo.gitHub.replace('https://', '')}</span>}
          </div>
        </div>
      </header>

      {/* Main Content Split */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Column (Main Content) */}
        <div className="w-[65%] p-8 flex flex-col gap-6 border-r border-gray-200">
          {summary && (
            <section>
              <h3 className="text-[13px] font-bold uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: accentColor }}>
                <Terminal size={16} /> Summary
              </h3>
              <div className="text-gray-700 font-sans text-[12px]" dangerouslySetInnerHTML={{ __html: summary }} />
            </section>
          )}

          {experience?.length > 0 && (
            <section>
              <h3 className="text-[13px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: accentColor }}>
                <Layers size={16} /> Professional Experience
              </h3>
              <div className="flex flex-col gap-5">
                {experience.map(exp => (
                  <div key={exp.id} className="relative pl-4 border-l-2" style={{ borderColor: `${accentColor}30` }}>
                    <div className="absolute w-2 h-2 rounded-full -left-[5px] top-1.5" style={{ backgroundColor: accentColor }} />
                    <div className="flex justify-between items-baseline mb-1">
                      <h4 className="font-bold text-[13px] text-gray-900 font-sans">{exp.position}</h4>
                      <div className="text-[10px] text-gray-500 font-mono tracking-wide">
                        {formatMonthYear(exp.startDate)} — {exp.isCurrent ? 'Present' : formatMonthYear(exp.endDate)}
                      </div>
                    </div>
                    <div className="text-[12px] font-bold mb-2 text-gray-700">
                      {exp.company}
                    </div>
                    <ul className="list-disc list-inside flex flex-col gap-1 text-gray-700 font-sans pl-1">
                      {exp.achievements?.map((bullet, i) => (
                        bullet ? <li key={i} className="pl-1"><span className="relative -left-1">{bullet}</span></li> : null
                      ))}
                    </ul>
                    {exp.technologies?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {exp.technologies.map((tech, i) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 border border-gray-200 rounded text-gray-500 font-bold">{tech}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right Column (Sidebar) */}
        <div className="w-[35%] p-8 flex flex-col gap-6 bg-gray-50/50">
          
          {/* Tech Stack */}
          <section>
            <h3 className="text-[13px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: accentColor }}>
              <Code size={16} /> Tech Stack
            </h3>
            
            <div className="grid grid-cols-1 gap-4">
              {skills?.languages?.length > 0 && (
                <div className="bg-gray-50 rounded-md p-3 border border-gray-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Code size={14} style={{ color: accentColor }} />
                    <h4 className="font-bold text-[11px] text-gray-800 uppercase tracking-wide">Programming Languages</h4>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed font-mono">
                    {skills.languages.join(' • ')}
                  </p>
                </div>
              )}
              {skills?.technical?.length > 0 && (
                <div className="bg-gray-50 rounded-md p-3 border border-gray-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Terminal size={14} style={{ color: accentColor }} />
                    <h4 className="font-bold text-[11px] text-gray-800 uppercase tracking-wide">Core Technologies</h4>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed font-mono">
                    {skills.technical.join(' • ')}
                  </p>
                </div>
              )}
              {skills?.frameworks?.length > 0 && (
                <div className="bg-gray-50 rounded-md p-3 border border-gray-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Layers size={14} style={{ color: accentColor }} />
                    <h4 className="font-bold text-[11px] text-gray-800 uppercase tracking-wide">Frameworks & Libraries</h4>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed font-mono">
                    {skills.frameworks.join(' • ')}
                  </p>
                </div>
              )}
              {skills?.tools?.length > 0 && (
                <div className="bg-gray-50 rounded-md p-3 border border-gray-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Box size={14} style={{ color: accentColor }} />
                    <h4 className="font-bold text-[11px] text-gray-800 uppercase tracking-wide">Developer Tools</h4>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed font-mono">
                    {skills.tools.join(' • ')}
                  </p>
                </div>
              )}
              {skills?.platforms?.length > 0 && (
                <div className="bg-gray-50 rounded-md p-3 border border-gray-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Server size={14} style={{ color: accentColor }} />
                    <h4 className="font-bold text-[11px] text-gray-800 uppercase tracking-wide">Cloud & Infrastructure</h4>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed font-mono">
                    {skills.platforms.join(' • ')}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Projects */}
          {projects?.length > 0 && (
            <section>
              <h3 className="text-[13px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2 mt-2" style={{ color: accentColor }}>
                <Github size={16} /> Key Projects
              </h3>
              <div className="flex flex-col gap-4">
                {projects.map(proj => (
                  <div key={proj.id} className="bg-white p-3 border border-gray-200 rounded-lg shadow-sm">
                    <h4 className="font-bold text-[12px] text-gray-900 mb-1">{proj.name}</h4>
                    <p className="text-gray-600 font-sans text-[10.5px] mb-2 leading-snug">{proj.description}</p>
                    <div className="text-[9px] font-bold" style={{ color: accentColor }}>
                      {proj.technologies?.join(' • ')}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Education */}
          {education?.length > 0 && (
            <section>
              <h3 className="text-[13px] font-bold uppercase tracking-widest mb-3 flex items-center gap-2 mt-2" style={{ color: accentColor }}>
                <MapPin size={16} /> Education
              </h3>
              <div className="flex flex-col gap-3 font-sans">
                {education.map(edu => (
                  <div key={edu.id}>
                    <div className="font-bold text-[11px] text-gray-900">{edu.degree}</div>
                    <div className="text-gray-600 text-[10.5px]">{edu.institution}</div>
                    <div className="text-gray-400 text-[10px] font-mono mt-0.5">{formatMonthYear(edu.graduationDate)}</div>
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
