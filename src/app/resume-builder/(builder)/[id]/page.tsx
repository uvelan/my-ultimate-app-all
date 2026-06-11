'use client';

import { useUiStore } from '@/store/resume-builder/uiStore';
import { useResumeStore } from '@/store/resume-builder/resumeStore';
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
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';

export default function EditResumePage() {
  const params = useParams();
  const id = params.id as string;
  const { activeStep } = useUiStore();
  const { setFullData } = useResumeStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchResume() {
      try {
        const res = await fetch(`/api/resumes/${id}`);
        if (!res.ok) {
          throw new Error('Failed to load resume. It might not exist or you do not have permission.');
        }
        const data = await res.json();
        if (data.content) {
          setFullData({ ...data.content, id: data.id });
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchResume();
  }, [id, setFullData]);

  if (loading) {
    return (
      <div className="w-full h-[50vh] flex flex-col items-center justify-center text-[#d0c5af]">
        <Loader2 className="w-8 h-8 animate-spin text-[#d4af37] mb-4" />
        <p className="text-sm font-semibold tracking-wide">Loading your resume...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-[50vh] flex flex-col items-center justify-center text-red-400">
        <p className="text-sm font-bold bg-red-500/10 p-4 rounded-lg border border-red-500/20">{error}</p>
      </div>
    );
  }

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
