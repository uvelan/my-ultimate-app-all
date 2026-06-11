'use client';

import { ResumeData, TemplateCustomization } from '@/types/resume-builder';
import { Mail, Phone, MapPin, Linkedin, Github, Globe } from 'lucide-react';
import { formatMonthYear } from '@/lib/utils';

interface TemplateProps {
  data: ResumeData;
  customization: TemplateCustomization;
}

export function StitchPremium({ data, customization }: TemplateProps) {
  const { personalInfo = {}, summary = '', experience = [], education = [], skills = { technical: [] }, projects = [] } = data || {};
  
  // Enforce Stitch premium colors
  const bg = '#050505';
  const surface = '#121212';
  const primaryText = '#e5e2e1';
  const secondaryText = '#99907c';
  const accent = '#d4af37'; // Gold
  const accentSecondary = '#6366f1'; // Indigo

  return (
    <div 
      className="h-full w-full text-[11px] leading-[1.6] flex flex-col print-exact-colors" 
      style={{ 
        backgroundColor: bg, 
        color: primaryText, 
        fontFamily: 'var(--font-body)',
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact'
      }}
    >
      {/* Header Area */}
      <header 
        className="px-10 pt-10 pb-6 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.1)' }}
      >
        <div className="flex justify-between items-end">
          <div>
            <h1 
              className="text-4xl font-bold tracking-tight mb-2" 
              style={{ fontFamily: 'var(--font-display)', color: primaryText }}
            >
              {personalInfo?.fullName || 'Jane Doe'}
            </h1>
            <h2 
              className="text-[13px] font-semibold tracking-[0.2em] uppercase" 
              style={{ color: accent }}
            >
              {personalInfo?.professionalTitle || 'Software Engineer'}
            </h2>
          </div>
          
          <div className="flex flex-col items-end gap-1.5 text-[10px] text-right font-medium tracking-wide" style={{ color: secondaryText }}>
            {personalInfo?.email && <div className="flex items-center gap-2"><span>{personalInfo.email}</span><Mail size={12} style={{ color: accentSecondary }} /></div>}
            {personalInfo?.phone && <div className="flex items-center gap-2"><span>{personalInfo.phone}</span><Phone size={12} style={{ color: accentSecondary }} /></div>}
            {personalInfo?.location && <div className="flex items-center gap-2"><span>{personalInfo.location}</span><MapPin size={12} style={{ color: accentSecondary }} /></div>}
            {personalInfo?.linkedIn && <div className="flex items-center gap-2"><span>{personalInfo.linkedIn.replace('https://', '')}</span><Linkedin size={12} style={{ color: accentSecondary }} /></div>}
            {personalInfo?.gitHub && <div className="flex items-center gap-2"><span>{personalInfo.gitHub.replace('https://', '')}</span><Github size={12} style={{ color: accentSecondary }} /></div>}
            {personalInfo?.portfolio && <div className="flex items-center gap-2"><span>{personalInfo.portfolio.replace('https://', '')}</span><Globe size={12} style={{ color: accentSecondary }} /></div>}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 p-10 gap-10">
        
        {/* Left Column (Main Content) */}
        <div className="w-[65%] flex flex-col gap-8">
          
          {summary && (
            <section>
              <h3 className="text-[12px] font-bold uppercase tracking-widest mb-3" style={{ color: primaryText }}>
                Executive Summary
              </h3>
              <div className="text-[11px] leading-relaxed" style={{ color: secondaryText }} dangerouslySetInnerHTML={{ __html: summary }} />
            </section>
          )}

          {experience?.length > 0 && (
            <section>
              <h3 className="text-[12px] font-bold uppercase tracking-widest mb-4" style={{ color: primaryText }}>
                Professional Experience
              </h3>
              <div className="flex flex-col gap-6">
                {experience.map(exp => (
                  <div key={exp.id} className="relative">
                    {/* Minimal decorative line */}
                    <div className="absolute left-0 top-1.5 bottom-0 w-[1px]" style={{ backgroundColor: 'rgba(212,175,55,0.2)' }} />
                    
                    <div className="pl-4">
                      <div className="flex justify-between items-baseline mb-1">
                        <h4 className="font-bold text-[13px]" style={{ color: primaryText }}>{exp.position}</h4>
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                          {formatMonthYear(exp.startDate)} — {exp.isCurrent ? 'Present' : formatMonthYear(exp.endDate)}
                        </span>
                      </div>
                      <div className="text-[11px] font-medium mb-3" style={{ color: secondaryText }}>
                        {exp.company}
                      </div>
                      <ul className="list-none flex flex-col gap-2">
                        {exp.achievements?.map((bullet, i) => (
                          bullet ? (
                            <li key={i} className="flex items-start gap-2 leading-relaxed" style={{ color: secondaryText }}>
                              <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: accentSecondary }} />
                              <span dangerouslySetInnerHTML={{ __html: bullet }} />
                            </li>
                          ) : null
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>

        {/* Right Column (Sidebar Content) */}
        <div className="w-[35%] flex flex-col gap-8">
          
          <section>
            <h3 className="text-[12px] font-bold uppercase tracking-widest mb-4" style={{ color: primaryText }}>
              Skills
            </h3>
            <div className="flex flex-col gap-4">
              {skills?.languages?.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Programming Languages</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.languages.map(skill => (
                      <span key={skill} className="px-2 py-0.5 bg-gray-50 border border-gray-200 rounded-sm text-gray-700 font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {skills?.technical?.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Technical Skills</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.technical.map(skill => (
                      <span key={skill} className="px-2 py-0.5 bg-gray-50 border border-gray-200 rounded-sm text-gray-700 font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {skills?.frameworks?.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Frameworks & Libraries</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.frameworks.map(skill => (
                      <span key={skill} className="px-2 py-0.5 bg-gray-50 border border-gray-200 rounded-sm text-gray-700 font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {skills?.tools?.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Tools & Platforms</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.tools.map(skill => (
                      <span key={skill} className="px-2 py-0.5 bg-gray-50 border border-gray-200 rounded-sm text-gray-700 font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {skills?.platforms?.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Cloud & Infrastructure</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.platforms.map(skill => (
                      <span key={skill} className="px-2 py-0.5 bg-gray-50 border border-gray-200 rounded-sm text-gray-700 font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {skills?.soft?.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Soft Skills</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.soft.map(skill => (
                      <span key={skill} className="px-2 py-0.5 bg-gray-50 border border-gray-200 rounded-sm text-gray-700 font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {projects?.length > 0 && (
            <section>
              <h3 className="text-[12px] font-bold uppercase tracking-widest mb-4" style={{ color: primaryText }}>
                Key Projects
              </h3>
              <div className="flex flex-col gap-5">
                {projects.map(proj => (
                  <div key={proj.id} className="p-3 rounded-lg border" style={{ backgroundColor: surface, borderColor: 'rgba(255,255,255,0.05)' }}>
                    <h4 className="font-bold text-[11px] mb-1" style={{ color: primaryText }}>{proj.name}</h4>
                    <p className="text-[10px] leading-relaxed mb-2" style={{ color: secondaryText }}>{proj.description}</p>
                    <div className="text-[9px] font-mono tracking-wider" style={{ color: accentSecondary }}>
                      {proj.technologies?.join(' • ')}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {education?.length > 0 && (
            <section>
              <h3 className="text-[12px] font-bold uppercase tracking-widest mb-4" style={{ color: primaryText }}>
                Education
              </h3>
              <div className="flex flex-col gap-4">
                {education.map(edu => (
                  <div key={edu.id}>
                    <div className="font-bold text-[11px] mb-0.5" style={{ color: primaryText }}>{edu.degree}</div>
                    <div className="text-[10px]" style={{ color: secondaryText }}>{edu.institution}</div>
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
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
