'use client';

import { useResumeStore } from '@/store/resume-builder/resumeStore';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { TagInput } from '@/components/resume-builder/shared/TagInput';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

export function Step6Projects() {
  const { data, addProject, updateProject, removeProject, reorderProject } = useResumeStore();

  const handleAdd = () => {
    addProject({
      id: uuidv4(),
      name: '',
      description: '',
      technologies: [],
      achievements: ['']
    });
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    reorderProject(result.source.index, result.destination.index);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#e5e2e1] mb-1">Projects</h2>
          <p className="text-sm text-slate-500">Showcase your key projects, side-hustles, or open-source contributions.</p>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="projects-list">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-6">
              {data.projects.map((proj, index) => (
                <Draggable key={proj.id} draggableId={proj.id} index={index}>
                  {(provided) => (
                    <div 
                      ref={provided.innerRef} 
                      {...provided.draggableProps}
                      className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
                    >
                      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-3">
                        <div {...provided.dragHandleProps} className="text-slate-400 hover:text-slate-600 cursor-grab">
                          <GripVertical size={18} />
                        </div>
                        <span className="font-semibold text-slate-700 flex-1">
                          {proj.name || 'New Project'}
                        </span>
                        <button onClick={() => removeProject(proj.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      
                      <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input 
                            label="Project Name" 
                            placeholder="e.g. E-Commerce Platform"
                            value={proj.name} 
                            onChange={(e) => updateProject(proj.id, { name: e.target.value })} 
                          />
                          <Input 
                            label="Short Description" 
                            placeholder="e.g. A full-stack marketplace..."
                            value={proj.description} 
                            onChange={(e) => updateProject(proj.id, { description: e.target.value })} 
                          />
                          <Input 
                            label="Live URL (Optional)" 
                            placeholder="https://..."
                            value={proj.liveUrl || ''} 
                            onChange={(e) => updateProject(proj.id, { liveUrl: e.target.value })} 
                          />
                          <Input 
                            label="GitHub URL (Optional)" 
                            placeholder="https://github.com/..."
                            value={proj.gitHubUrl || ''} 
                            onChange={(e) => updateProject(proj.id, { gitHubUrl: e.target.value })} 
                          />
                        </div>

                        <TagInput 
                          label="Technologies Used" 
                          tags={proj.technologies} 
                          onChange={(t) => updateProject(proj.id, { technologies: t })} 
                          placeholder="e.g. React, Node.js..."
                        />
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <Button 
        variant="outline" 
        className="w-full py-6 border-dashed border-2 text-slate-600 hover:text-indigo-600 hover:border-indigo-600 hover:bg-indigo-50 transition-colors"
        onClick={handleAdd}
      >
        <Plus className="mr-2" size={18} />
        Add Project
      </Button>
    </div>
  );
}
