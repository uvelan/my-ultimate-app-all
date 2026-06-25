'use client';

import { useResumeStore } from '@/store/resume-builder/resumeStore';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

export function Step4Education() {
  const { data, addEducation, updateEducation, removeEducation, reorderEducation } = useResumeStore();

  const handleAdd = () => {
    addEducation({
      id: uuidv4(),
      degree: '',
      institution: '',
      graduationDate: '',
      gpa: ''
    });
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    reorderEducation(result.source.index, result.destination.index);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#e5e2e1] mb-1">Education</h2>
          <p className="text-sm text-text-muted">List your academic background and degrees.</p>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="education-list">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-6">
              {data.education.map((edu, index) => (
                <Draggable key={edu.id} draggableId={edu.id} index={index}>
                  {(provided) => (
                    <div 
                      ref={provided.innerRef} 
                      {...provided.draggableProps}
                        style={provided.draggableProps.style as React.CSSProperties}
                      className="bg-surface rounded-xl shadow-sm border border-border overflow-hidden"
                    >
                      <div className="bg-surface-2 px-4 py-3 border-b border-border flex items-center gap-3">
                        <div {...provided.dragHandleProps} className="text-text-muted hover:text-text-muted cursor-grab">
                          <GripVertical size={18} />
                        </div>
                        <span className="font-semibold text-text-secondary flex-1">
                          {edu.degree || 'Degree'} at {edu.institution || 'Institution'}
                        </span>
                        <button onClick={() => removeEducation(edu.id)} className="text-text-muted hover:text-red-500 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      
                      <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input 
                            label="Degree / Major" 
                            placeholder="e.g. B.S. in Computer Science"
                            value={edu.degree} 
                            onChange={(e) => updateEducation(edu.id, { degree: e.target.value })} 
                          />
                          <Input 
                            label="Institution" 
                            placeholder="e.g. Stanford University"
                            value={edu.institution} 
                            onChange={(e) => updateEducation(edu.id, { institution: e.target.value })} 
                          />
                          <Input 
                            label="Graduation Date" 
                            type="month"
                            value={edu.graduationDate} 
                            onChange={(e) => updateEducation(edu.id, { graduationDate: e.target.value })} 
                          />
                          <Input 
                            label="GPA (Optional)" 
                            placeholder="e.g. 3.8 / 4.0"
                            value={edu.gpa || ''} 
                            onChange={(e) => updateEducation(edu.id, { gpa: e.target.value })} 
                          />
                        </div>
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
        className="w-full py-6 border-dashed border-2 text-text-muted hover:text-indigo-600 hover:border-indigo-600 hover:bg-indigo-50 transition-colors"
        onClick={handleAdd}
      >
        <Plus className="mr-2" size={18} />
        Add Education
      </Button>
    </div>
  );
}
