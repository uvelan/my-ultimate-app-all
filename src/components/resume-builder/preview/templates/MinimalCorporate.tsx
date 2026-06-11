'use client';

import { ResumeData, TemplateCustomization } from '@/types/resume-builder';
import { formatMonthYear } from '@/lib/utils';

interface TemplateProps {
  data: ResumeData;
  customization: TemplateCustomization;
}

export function MinimalCorporate({ data, customization }: TemplateProps) {
  const { personalInfo = {}, summary = '', experience = [], education = [], skills = { technical: [] } } = data || {};
  const accentColor = customization?.accentColor || '#333333';

  return (
    <div className="h-full w-full bg-white text-[10px] leading-[1.5] text-gray-800 p-12 flex flex-col gap-5" style={{ fontFamily: 'var(--font-mono)' }}>
      {/* Header */}
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 uppercase tracking-tight mb-1" style={{ color: accentColor }}>
          {personalInfo?.fullName || 'Jane Doe'}
        </h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-600 text-[10px]">
          {personalInfo?.email && <span>{personalInfo.email}</span>}
          {personalInfo?.phone && <span>{personalInfo.phone}</span>}
          {personalInfo?.location && <span>{personalInfo.location}</span>}
          {personalInfo?.linkedIn && <span>{personalInfo.linkedIn.replace('https://', '')}</span>}
          {personalInfo?.gitHub && <span>{personalInfo.gitHub.replace('https://', '')}</span>}
        </div>
      </header>

      {/* Summary */}
      {summary && (
        <section>
          <div className="border-t border-black mb-2" />
          <h2 className="text-[11px] font-bold uppercase tracking-wider mb-2 text-black">Summary</h2>
          <div className="text-gray-700" dangerouslySetInnerHTML={{ __html: summary }} />
        </section>
      )}

      {/* Experience */}
      {experience?.length > 0 && (
        <section>
          <div className="border-t border-black mb-2" />
          <h2 className="text-[11px] font-bold uppercase tracking-wider mb-3 text-black">Experience</h2>
          <div className="flex flex-col gap-4">
            {experience.map(exp => (
              <div key={exp.id} className="flex gap-4">
                {/* Left Column (Dates) */}
                <div className="w-32 shrink-0 text-gray-500 text-[10px] pr-4">
                  {formatMonthYear(exp.startDate)} - {exp.isCurrent ? 'Present' : formatMonthYear(exp.endDate)}
                </div>
                {/* Right Column (Content) */}
                <div className="flex-1">
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className="font-bold text-[11px] text-gray-900">{exp.position}</h3>
                    <span className="font-semibold text-gray-900">{exp.company}</span>
                  </div>
                  <ul className="list-disc list-outside flex flex-col gap-1 text-gray-700 pl-3">
                    {exp.achievements?.map((bullet, i) => (
                      bullet ? <li key={i}>{bullet}</li> : null
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Education */}
      {education?.length > 0 && (
        <section>
          <div className="border-t border-black mb-2" />
          <h2 className="text-[11px] font-bold uppercase tracking-wider mb-3 text-black">Education</h2>
          <div className="flex flex-col gap-4">
            {education.map(edu => (
              <div key={edu.id} className="flex gap-4">
                <div className="w-32 shrink-0 text-gray-500 text-[10px] pr-4">
                  {formatMonthYear(edu.graduationDate)}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-baseline">
                    <h3 className="font-bold text-[11px] text-gray-900">{edu.degree}</h3>
                    <span className="text-gray-600">{edu.institution}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Skills */}
      {((skills?.technical?.length || 0) > 0 || (skills?.frameworks?.length || 0) > 0 || (skills?.tools?.length || 0) > 0 || (skills?.platforms?.length || 0) > 0 || (skills?.soft?.length || 0) > 0 || (skills?.languages?.length || 0) > 0) && (
        <section>
          <div className="border-t border-black mb-2" />
          <h2 className="text-[11px] font-bold uppercase tracking-wider mb-3 text-black">Skills</h2>
          <div className="flex flex-col gap-2">
            {skills?.languages?.length > 0 && (
              <div className="flex gap-4">
                <div className="w-24 shrink-0 text-gray-900 font-semibold uppercase text-[9px] pt-0.5">Programming Languages</div>
                <div className="flex-1 text-gray-700">{skills.languages.join(', ')}</div>
              </div>
            )}
            {skills?.technical?.length > 0 && (
              <div className="flex gap-4">
                <div className="w-24 shrink-0 text-gray-900 font-semibold uppercase text-[9px] pt-0.5">Technical</div>
                <div className="flex-1 text-gray-700">{skills.technical.join(', ')}</div>
              </div>
            )}
            {skills?.frameworks?.length > 0 && (
              <div className="flex gap-4">
                <div className="w-24 shrink-0 text-gray-900 font-semibold uppercase text-[9px] pt-0.5">Frameworks</div>
                <div className="flex-1 text-gray-700">{skills.frameworks.join(', ')}</div>
              </div>
            )}
            {skills?.tools?.length > 0 && (
              <div className="flex gap-4">
                <div className="w-24 shrink-0 text-gray-900 font-semibold uppercase text-[9px] pt-0.5">Tools</div>
                <div className="flex-1 text-gray-700">{skills.tools.join(', ')}</div>
              </div>
            )}
            {skills?.platforms?.length > 0 && (
              <div className="flex gap-4">
                <div className="w-24 shrink-0 text-gray-900 font-semibold uppercase text-[9px] pt-0.5">Platforms</div>
                <div className="flex-1 text-gray-700">{skills.platforms.join(', ')}</div>
              </div>
            )}
            {skills?.soft?.length > 0 && (
              <div className="flex gap-4">
                <div className="w-24 shrink-0 text-gray-900 font-semibold uppercase text-[9px] pt-0.5">Soft Skills</div>
                <div className="flex-1 text-gray-700">{skills.soft.join(', ')}</div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
