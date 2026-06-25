'use client';

import { useResumeStore } from '@/store/resume-builder/resumeStore';
import { Input } from '@/components/ui/Input';

export function Step1PersonalInfo() {
  const { data, updatePersonalInfo } = useResumeStore();
  
  const info = data.personalInfo;

  const handleChange = (field: keyof typeof info, value: string) => {
    updatePersonalInfo({ [field]: value });
  };

  return (
    <div className="bg-surface rounded-xl shadow-sm border border-border p-8 text-text-primary">
      <h2 className="text-xl font-bold mb-6">Personal Information</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Input 
          label="Full Name" 
          placeholder="e.g. Jane Doe"
          value={info.fullName}
          onChange={(e) => handleChange('fullName', e.target.value)}
        />
        <Input 
          label="Professional Title" 
          placeholder="e.g. Senior Software Engineer"
          value={info.professionalTitle}
          onChange={(e) => handleChange('professionalTitle', e.target.value)}
        />
        <Input 
          label="Email Address" 
          type="email"
          placeholder="e.g. jane@example.com"
          value={info.email}
          onChange={(e) => handleChange('email', e.target.value)}
        />
        <Input 
          label="Phone Number" 
          type="tel"
          placeholder="e.g. +1 (555) 123-4567"
          value={info.phone}
          onChange={(e) => handleChange('phone', e.target.value)}
        />
        <Input 
          label="Location" 
          placeholder="e.g. San Francisco, CA"
          value={info.location}
          onChange={(e) => handleChange('location', e.target.value)}
        />
        <Input 
          label="LinkedIn URL (Optional)" 
          placeholder="https://linkedin.com/in/..."
          value={info.linkedIn || ''}
          onChange={(e) => handleChange('linkedIn', e.target.value)}
        />
        <Input 
          label="GitHub URL (Optional)" 
          placeholder="https://github.com/..."
          value={info.gitHub || ''}
          onChange={(e) => handleChange('gitHub', e.target.value)}
        />
        <Input 
          label="Portfolio URL (Optional)" 
          placeholder="https://yourwebsite.com"
          value={info.portfolio || ''}
          onChange={(e) => handleChange('portfolio', e.target.value)}
        />
      </div>
    </div>
  );
}
