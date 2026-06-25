'use client';

import { ResumeData, TemplateCustomization } from '@/types/resume-builder';
import { formatMonthYear } from '@/lib/utils';

interface TemplateProps {
  data: ResumeData;
  customization: TemplateCustomization;
}

export function ExecutivePremium({ data, customization }: TemplateProps) {
  const { personalInfo, summary = '', experience = [], education = [], skills } = data || ({} as ResumeData);
  const accentColor = customization?.accentColor || '#1E1E1E';

  return (
    <div className="h-full w-full bg-surface text-[11px] leading-[1.6] text-text-primary p-10 flex flex-col gap-6" style={{ fontFamily: 'var(--font-body)' }}>
      {/* Header (Centered) */}
      <header className="text-center border-b-2 pb-6" style={{ borderColor: accentColor }}>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary mb-2 uppercase" style={{ fontFamily: 'var(--font-display)', color: accentColor }}>
          {personalInfo?.fullName || 'Jane Doe'}
        </h1>
        <div className="flex items-center justify-center gap-4 text-text-muted text-[10px] uppercase tracking-widest font-semibold mb-2">
          {personalInfo?.email && <span>{personalInfo.email}</span>}
          {personalInfo?.phone && (
            <>
              <span className="text-gray-300">•</span>
              <span>{personalInfo.phone}</span>
            </>
          )}
          {personalInfo?.location && (
            <>
              <span className="text-gray-300">•</span>
              <span>{personalInfo.location}</span>
            </>
          )}
        </div>
        <div className="flex items-center justify-center gap-4 text-text-muted text-[10px]">
          {personalInfo?.linkedIn && <span>{personalInfo.linkedIn.replace('https://', '')}</span>}
          {personalInfo?.gitHub && (
            <>
              <span className="text-gray-300">|</span>
              <span>{personalInfo.gitHub.replace('https://', '')}</span>
            </>
          )}
        </div>
      </header>

      {/* Summary */}
      {summary && (
        <section>
          <div className="text-[12px] text-text-secondary italic text-center max-w-[85%] mx-auto leading-relaxed" dangerouslySetInnerHTML={{ __html: summary }} />
        </section>
      )}

      {/* Experience */}
      {experience?.length > 0 && (
        <section>
          <h2 className="text-[14px] font-bold uppercase tracking-widest mb-4 pb-1 border-b border-gray-200" style={{ color: accentColor }}>
            Professional Experience
          </h2>
          <div className="flex flex-col gap-5">
            {experience.map(exp => (
              <div key={exp.id}>
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="font-bold text-[13px] text-text-primary">{exp.company}</h3>
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                    {formatMonthYear(exp.startDate)} – {exp.isCurrent ? 'Present' : formatMonthYear(exp.endDate)}
                  </span>
                </div>
                <div className="text-[11px] font-semibold italic text-text-secondary mb-2">
                  {exp.position}
                </div>
                <ul className="list-disc list-inside flex flex-col gap-1.5 text-text-secondary">
                  {exp.achievements?.map((bullet, i) => (
                    bullet ? <li key={i} className="pl-1 leading-relaxed text-[11px]"><span className="relative -left-1">{bullet}</span></li> : null
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Skills */}
      {((skills?.technical?.length || 0) > 0 || (skills?.languages?.length || 0) > 0 || (skills?.frameworks?.length || 0) > 0 || (skills?.tools?.length || 0) > 0 || (skills?.platforms?.length || 0) > 0 || (skills?.soft?.length || 0) > 0) && (
        <section>
          <h2 className="text-[14px] font-bold uppercase tracking-widest mb-3 pb-1 border-b border-gray-200" style={{ color: accentColor }}>
            Core Competencies
          </h2>
          <div className="flex flex-col gap-2 text-[11px] leading-relaxed font-semibold">
            {skills?.languages?.length > 0 && (
              <div className="flex gap-4">
                <span className="font-bold text-text-primary w-36 uppercase text-[10px] tracking-wider">Programming Languages</span>
                <span className="text-text-secondary">{skills.languages.join(' • ')}</span>
              </div>
            )}
            {skills?.technical?.length > 0 && (
              <div className="flex gap-4">
                <span className="font-bold text-text-primary w-36 uppercase text-[10px] tracking-wider">Technical</span>
                <span className="text-text-secondary">{skills.technical.join(' • ')}</span>
              </div>
            )}
            {skills?.frameworks?.length > 0 && (
              <div className="flex gap-4">
                <span className="font-bold text-text-primary w-36 uppercase text-[10px] tracking-wider">Frameworks</span>
                <span className="text-text-secondary">{skills.frameworks.join(' • ')}</span>
              </div>
            )}
            {skills?.tools?.length > 0 && (
              <div className="flex gap-4">
                <span className="font-bold text-text-primary w-36 uppercase text-[10px] tracking-wider">Tools</span>
                <span className="text-text-secondary">{skills.tools.join(' • ')}</span>
              </div>
            )}
            {skills?.platforms?.length > 0 && (
              <div className="flex gap-4">
                <span className="font-bold text-text-primary w-36 uppercase text-[10px] tracking-wider">Platforms</span>
                <span className="text-text-secondary">{skills.platforms.join(' • ')}</span>
              </div>
            )}
            {skills?.soft?.length > 0 && (
              <div className="flex gap-4">
                <span className="font-bold text-text-primary w-36 uppercase text-[10px] tracking-wider">Soft Skills</span>
                <span className="text-text-secondary">{skills.soft.join(' • ')}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Education */}
      {education?.length > 0 && (
        <section>
          <h2 className="text-[14px] font-bold uppercase tracking-widest mb-4 pb-1 border-b border-gray-200" style={{ color: accentColor }}>
            Education
          </h2>
          <div className="flex flex-col gap-3">
            {education.map(edu => (
              <div key={edu.id} className="flex justify-between items-baseline">
                <div>
                  <div className="font-bold text-text-primary">{edu.degree}</div>
                  <div className="text-text-muted">{edu.institution}</div>
                </div>
                <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                  {formatMonthYear(edu.graduationDate)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
