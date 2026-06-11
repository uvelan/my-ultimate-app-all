import { ReactNode } from 'react';
import { BuilderShell } from '@/components/resume-builder/layout/BuilderShell';

export const metadata = {
  title: 'AI Resume Builder | Ekam',
  description: 'Create a recruiter-grade resume with AI assistance.',
};

export default function ResumeBuilderLayout({ children }: { children: ReactNode }) {
  // This layout strictly overrides the root layout by rendering a full-screen application shell.
  // We use BuilderShell to assemble the 3-panel layout.
  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      <BuilderShell>
        {children}
      </BuilderShell>
    </div>
  );
}
