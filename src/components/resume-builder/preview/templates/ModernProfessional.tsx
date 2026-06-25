'use client';

import { ResumeData, TemplateCustomization } from '@/types/resume-builder';
import { Mail, Phone, MapPin, Linkedin, Github, Globe } from 'lucide-react';
import { formatMonthYear } from '@/lib/utils';

interface TemplateProps {
  data: ResumeData;
  customization: TemplateCustomization;
}

export function ModernProfessional({ data, customization }: TemplateProps) {
  const { personalInfo, summary = '', experience = [], education = [], skills, projects = [] } = data || ({} as ResumeData);
  const accentColor = customization?.accentColor || '#4F46E5';

  return (
    <div className="flex h-full w-full text-[11px] leading-[1.6] text-text-primary" style={{ fontFamily: 'var(--font-body)' }}>
      {/* Left Sidebar (1/3 width) */}
      <div 
        className="w-[32%] h-full p-8 border-r"
        style={{ backgroundColor: `${accentColor}08`, borderColor: `${accentColor}20` }}
      >
        <div className="mb-8">
          {personalInfo?.photoUrl && (
            <img src={personalInfo.photoUrl} alt="Profile" className="w-24 h-24 rounded-full mx-auto mb-4 object-cover border-2" style={{ borderColor: accentColor }} />
          )}
          
          <h1 className="text-2xl font-bold tracking-tight text-text-primary mb-1" style={{ fontFamily: 'var(--font-display)' }}>
            {personalInfo?.fullName || 'Jane Doe'}
          </h1>
          <h2 className="text-[13px] font-semibold tracking-wide uppercase mb-6" style={{ color: accentColor }}>
            {personalInfo?.professionalTitle || 'Software Engineer'}
          </h2>

          <div className="flex flex-col gap-3 text-text-muted">
            {personalInfo?.email && (
              <div className="flex items-center gap-2">
                <Mail size={14} style={{ color: accentColor }} />
                <span>{personalInfo.email}</span>
              </div>
            )}
            {personalInfo?.phone && (
              <div className="flex items-center gap-2">
                <Phone size={14} style={{ color: accentColor }} />
                <span>{personalInfo.phone}</span>
              </div>
            )}
            {personalInfo?.location && (
              <div className="flex items-center gap-2">
                <MapPin size={14} style={{ color: accentColor }} />
                <span>{personalInfo.location}</span>
              </div>
            )}
            {personalInfo?.linkedIn && (
              <div className="flex items-center gap-2">
                <Linkedin size={14} style={{ color: accentColor }} />
                <span>{personalInfo.linkedIn.replace('https://', '')}</span>
              </div>
            )}
            {personalInfo?.gitHub && (
              <div className="flex items-center gap-2">
                <Github size={14} style={{ color: accentColor }} />
                <span>{personalInfo.gitHub.replace('https://', '')}</span>
              </div>
            )}
            {personalInfo?.portfolio && (
              <div className="flex items-center gap-2">
                <Globe size={14} style={{ color: accentColor }} />
                <span>{personalInfo.portfolio.replace('https://', '')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Skills Section */}
        {((skills?.technical?.length || 0) > 0 || (skills?.frameworks?.length || 0) > 0 || (skills?.tools?.length || 0) > 0 || (skills?.platforms?.length || 0) > 0 || (skills?.soft?.length || 0) > 0 || (skills?.languages?.length || 0) > 0) && (
          <div className="mb-8">
            <h3 className="text-xs font-bold uppercase tracking-wider mb-3 border-b pb-1" style={{ color: accentColor, borderColor: `${accentColor}40` }}>Skills</h3>
            <div className="flex flex-col gap-3">
              {skills?.languages?.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-text-muted uppercase mb-1">Programming Languages</div>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.languages.map(skill => (
                      <span key={skill} className="px-2 py-0.5 bg-surface border border-gray-200 rounded text-text-secondary">{skill}</span>
                    ))}
                  </div>
                </div>
              )}
              {skills?.technical?.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-text-muted uppercase mb-1">Technical</div>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.technical.map(skill => (
                      <span key={skill} className="px-2 py-0.5 bg-surface border border-gray-200 rounded text-text-secondary">{skill}</span>
                    ))}
                  </div>
                </div>
              )}
              {skills?.frameworks?.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-text-muted uppercase mb-1">Frameworks</div>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.frameworks.map(skill => (
                      <span key={skill} className="px-2 py-0.5 bg-surface border border-gray-200 rounded text-text-secondary">{skill}</span>
                    ))}
                  </div>
                </div>
              )}
              {skills?.tools?.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-text-muted uppercase mb-1">Tools</div>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.tools.map(skill => (
                      <span key={skill} className="px-2 py-0.5 bg-surface border border-gray-200 rounded text-text-secondary">{skill}</span>
                    ))}
                  </div>
                </div>
              )}
              {skills?.platforms?.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-text-muted uppercase mb-1">Platforms</div>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.platforms.map(skill => (
                      <span key={skill} className="px-2 py-0.5 bg-surface border border-gray-200 rounded text-text-secondary">{skill}</span>
                    ))}
                  </div>
                </div>
              )}
              {skills?.soft?.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-text-muted uppercase mb-1">Soft Skills</div>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.soft.map(skill => (
                      <span key={skill} className="px-2 py-0.5 bg-surface border border-gray-200 rounded text-text-secondary">{skill}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Education Sidebar variant */}
        {education?.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-3 border-b pb-1" style={{ color: accentColor, borderColor: `${accentColor}40` }}>Education</h3>
            <div className="flex flex-col gap-4">
              {education.map(edu => (
                <div key={edu.id}>
                  <div className="font-bold text-text-primary">{edu.degree}</div>
                  <div className="text-text-muted">{edu.institution}</div>
                  <div className="text-text-muted text-[10px]">{formatMonthYear(edu.graduationDate)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Content (2/3 width) */}
      <div className="w-[68%] h-full p-8 flex flex-col gap-6">
        {summary && (
          <section>
            <h3 className="text-[13px] font-bold uppercase tracking-wider mb-2 border-b pb-1" style={{ color: accentColor, borderColor: `${accentColor}40` }}>Professional Summary</h3>
            <div className="text-text-secondary" dangerouslySetInnerHTML={{ __html: summary }} />
          </section>
        )}

        {experience?.length > 0 && (
          <section>
            <h3 className="text-[13px] font-bold uppercase tracking-wider mb-4 border-b pb-1" style={{ color: accentColor, borderColor: `${accentColor}40` }}>Experience</h3>
            <div className="flex flex-col gap-5">
              {experience.map(exp => (
                <div key={exp.id}>
                  <div className="flex justify-between items-baseline mb-1">
                    <h4 className="font-bold text-[12px] text-text-primary">{exp.position}</h4>
                    <span className="text-[10px] font-semibold text-text-muted uppercase">
                      {formatMonthYear(exp.startDate)} - {exp.isCurrent ? 'Present' : formatMonthYear(exp.endDate)}
                    </span>
                  </div>
                  <div className="text-[11px] font-semibold mb-2" style={{ color: accentColor }}>
                    {exp.company}
                  </div>
                  <ul className="list-disc list-inside flex flex-col gap-1 text-text-secondary pl-1">
                    {exp.achievements?.map((bullet, i) => (
                      bullet ? <li key={i} className="pl-1"><span className="relative -left-1">{bullet}</span></li> : null
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {projects?.length > 0 && (
          <section>
            <h3 className="text-[13px] font-bold uppercase tracking-wider mb-4 border-b pb-1" style={{ color: accentColor, borderColor: `${accentColor}40` }}>Projects</h3>
            <div className="flex flex-col gap-4">
              {projects.map(proj => (
                <div key={proj.id}>
                  <div className="flex justify-between items-baseline mb-1">
                    <h4 className="font-bold text-[12px] text-text-primary">{proj.name}</h4>
                  </div>
                  <p className="text-text-secondary mb-1">{proj.description}</p>
                  <div className="text-[10px] text-text-muted font-mono">
                    {proj.technologies?.join(' • ')}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
