"use client";

import { Project, Tag, TaskStatus, Priority } from "@prisma/client";
import { Search } from "lucide-react";

export interface TaskFiltersState {
  search: string;
  status: string;
  priority: string;
  projectId: string;
  tagId: string;
}

interface TaskFiltersProps {
  filters: TaskFiltersState;
  onChange: (filters: TaskFiltersState) => void;
  projects: Project[];
  tags: Tag[];
}

export function TaskFilters({ filters, onChange, projects, tags }: TaskFiltersProps) {
  const handleChange = (key: keyof TaskFiltersState, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-center mb-6 p-4 bg-background-surface rounded-radius-lg border border-border">
      <div className="relative flex-1 w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
        <input 
          type="text" 
          placeholder="Search tasks..." 
          value={filters.search}
          onChange={(e) => handleChange('search', e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-radius-md text-small focus:outline-none focus:border-accent"
        />
      </div>

      <div className="flex flex-wrap gap-2 w-full sm:w-auto">
        <select 
          value={filters.status}
          onChange={(e) => handleChange('status', e.target.value)}
          className="px-3 py-2 bg-background border border-border rounded-radius-md text-small focus:outline-none focus:border-accent"
        >
          <option value="">All Statuses</option>
          {Object.values(TaskStatus).map(s => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>

        <select 
          value={filters.priority}
          onChange={(e) => handleChange('priority', e.target.value)}
          className="px-3 py-2 bg-background border border-border rounded-radius-md text-small focus:outline-none focus:border-accent"
        >
          <option value="">All Priorities</option>
          {Object.values(Priority).map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select 
          value={filters.projectId}
          onChange={(e) => handleChange('projectId', e.target.value)}
          className="px-3 py-2 bg-background border border-border rounded-radius-md text-small focus:outline-none focus:border-accent"
        >
          <option value="">All Projects</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
