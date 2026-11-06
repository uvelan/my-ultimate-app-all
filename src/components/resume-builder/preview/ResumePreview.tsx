'use client';

import { useResumeStore } from '@/store/resume-builder/resumeStore';
import { useUiStore } from '@/store/resume-builder/uiStore';
import { ModernProfessional } from './templates/ModernProfessional';
import { ExecutivePremium } from './templates/ExecutivePremium';
import { MinimalCorporate } from './templates/MinimalCorporate';
import { SoftwareEngineerElite } from './templates/SoftwareEngineerElite';
import { EnterpriseArchitect } from './templates/EnterpriseArchitect';
import { StitchPremium } from './templates/StitchPremium';
import { resumeDocument } from '../../../../mobile-app/src/lib/resume';

export function ResumePreview() {
  const { data } = useResumeStore();
  const { isMaskingEnabled } = useUiStore();
  const templateId = data.meta.templateId;

  // Render the appropriate template based on the store's selection
  let TemplateComponent;
  switch (templateId) {
    case 'stitch-premium':
      TemplateComponent = StitchPremium;
      break;
    case 'modern-professional':
      TemplateComponent = ModernProfessional;
      break;
    case 'executive-premium':
      TemplateComponent = ExecutivePremium;
      break;
    case 'minimal-corporate':
      TemplateComponent = MinimalCorporate;
      break;
    case 'software-engineer-elite':
      TemplateComponent = SoftwareEngineerElite;
      break;
    case 'enterprise-architect':
      TemplateComponent = EnterpriseArchitect;
      break;
    default:
      TemplateComponent = null;
  }

  let previewData = data;
  if (isMaskingEnabled && previewData?.personalInfo) {
    previewData = {
      ...previewData,
      personalInfo: {
        ...previewData.personalInfo,
        fullName: previewData.personalInfo.fullName ? 'Confidential Candidate' : '',
        email: previewData.personalInfo.email ? 'hidden@confidential.com' : '',
        phone: previewData.personalInfo.phone ? '[Phone Masked]' : '',
        location: previewData.personalInfo.location ? '[Location Masked]' : '',
        linkedIn: previewData.personalInfo.linkedIn ? 'linkedin.com/in/hidden' : '',
        gitHub: previewData.personalInfo.gitHub ? 'github.com/hidden' : '',
        portfolio: previewData.personalInfo.portfolio ? 'portfolio.hidden.com' : '',
        photoUrl: '' // Hide photo
      }
    };
  }

  if (!TemplateComponent) {
    const { styles, markup } = resumeDocument(previewData, isMaskingEnabled);
    return <div className="min-h-full w-full bg-white p-10"><style>{styles}</style><div dangerouslySetInnerHTML={{ __html: markup }} /></div>;
  }
  return (
    <div className="w-full h-full bg-surface relative">
      <TemplateComponent data={previewData} customization={previewData.meta.customization} />
    </div>
  );
}
