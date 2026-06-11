'use client';

import { useUiStore } from '@/store/resume-builder/uiStore';
import { Step1PersonalInfo } from '@/components/resume-builder/steps/Step1PersonalInfo';
import { Step2Summary } from '@/components/resume-builder/steps/Step2Summary';
import { Step3Experience } from '@/components/resume-builder/steps/Step3Experience';
import { Step4Education } from '@/components/resume-builder/steps/Step4Education';
import { Step5Skills } from '@/components/resume-builder/steps/Step5Skills';
import { Step6Projects } from '@/components/resume-builder/steps/Step6Projects';
import { Step7Certifications } from '@/components/resume-builder/steps/Step7Certifications';
import { Step8Awards } from '@/components/resume-builder/steps/Step8Awards';
import { Step9Publications } from '@/components/resume-builder/steps/Step9Publications';
import { Step10Review } from '@/components/resume-builder/steps/Step10Review';

export default function NewResumePage() {
  const { activeStep } = useUiStore();

  return (
    <div className="w-full max-w-4xl mx-auto h-full pb-32">
      {activeStep === 1 && <Step1PersonalInfo />}
      {activeStep === 2 && <Step2Summary />}
      {activeStep === 3 && <Step3Experience />}
      {activeStep === 4 && <Step4Education />}
      {activeStep === 5 && <Step5Skills />}
      {activeStep === 6 && <Step6Projects />}
      {activeStep === 7 && <Step7Certifications />}
      {activeStep === 8 && <Step8Awards />}
      {activeStep === 9 && <Step9Publications />}
      {activeStep === 10 && <Step10Review />}
    </div>
  );
}
