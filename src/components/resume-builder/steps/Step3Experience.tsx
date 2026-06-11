'use client';

import { useResumeStore } from '@/store/resume-builder/resumeStore';
import { WorkExperience } from '@/types/resume-builder';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Plus, Trash2, GripVertical, Sparkles, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { enrichResumeBulletWithAI } from '@/actions/resume-ai';

export function Step3Experience() {
  const { data, addExperience, updateExperience, removeExperience, reorderExperience, activeAiModel } = useResumeStore();
  const [enriching, setEnriching] = useState<Record<string, boolean>>({});

  const handleAdd = () => {
    addExperience({
      id: uuidv4(),
      company: '',
      position: '',
      employmentType: 'Full-time',
      startDate: '',
      isCurrent: true,
      responsibilities: [],
      achievements: [''], // Start with one empty bullet
      technologies: []
    });
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    reorderExperience(result.source.index, result.destination.index);
  };

  const handleEnrich = async (expId: string, bIndex: number, currentText: string, position: string, company: string) => {
    if (!currentText.trim()) return;
    
    const key = `${expId}-${bIndex}`;
    setEnriching(prev => ({ ...prev, [key]: true }));
    
    try {
      const res = await enrichResumeBulletWithAI(currentText, position, company, activeAiModel);
      if (res.success && res.enrichedBullet) {
        const exp = data.experience.find(e => e.id === expId);
        if (exp) {
          const newB = [...exp.achievements];
          newB[bIndex] = res.enrichedBullet;
          updateExperience(expId, { achievements: newB });
        }
      } else {
        alert(res.error || 'Failed to enrich bullet point.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred during AI enrichment.');
    } finally {
      setEnriching(prev => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#e5e2e1] mb-1">Work Experience</h2>
          <p className="text-sm text-slate-500">Add your relevant experience, focusing on your measurable impact and achievements.</p>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="experience-list">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-6">
              {data.experience.map((exp, index) => (
                <Draggable key={exp.id} draggableId={exp.id} index={index}>
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
                          {exp.position || 'Job Title'} at {exp.company || 'Company'}
                        </span>
                        <button onClick={() => removeExperience(exp.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      
                      <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input 
                            label="Job Title" 
                            value={exp.position} 
                            onChange={(e) => updateExperience(exp.id, { position: e.target.value })} 
                          />
                          <Input 
                            label="Company Name" 
                            value={exp.company} 
                            onChange={(e) => updateExperience(exp.id, { company: e.target.value })} 
                          />
                          <div className="flex gap-4">
                            <Input 
                              label="Start Date" 
                              type="month"
                              wrapperClassName="flex-1"
                              value={exp.startDate} 
                              onChange={(e) => updateExperience(exp.id, { startDate: e.target.value })} 
                            />
                            {!exp.isCurrent && (
                              <Input 
                                label="End Date" 
                                type="month"
                                wrapperClassName="flex-1"
                                value={exp.endDate || ''} 
                                onChange={(e) => updateExperience(exp.id, { endDate: e.target.value })} 
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-8">
                            <input 
                              type="checkbox" 
                              id={`current-${exp.id}`}
                              checked={exp.isCurrent}
                              onChange={(e) => updateExperience(exp.id, { isCurrent: e.target.checked, endDate: undefined })}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                            />
                            <label htmlFor={`current-${exp.id}`} className="text-sm font-medium text-slate-700">I currently work here</label>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-slate-700">Achievements & Responsibilities</label>
                          </div>
                          
                          <div className="space-y-3">
                            {exp.achievements.map((bullet, bIndex) => (
                              <div key={bIndex} className="flex gap-2">
                                <div className="mt-2 text-slate-400"><GripVertical size={16} /></div>
                                <div className="flex-1 relative group">
                                  <textarea 
                                    value={bullet}
                                    onChange={(e) => {
                                      const newB = [...exp.achievements];
                                      newB[bIndex] = e.target.value;
                                      updateExperience(exp.id, { achievements: newB });
                                    }}
                                    className="w-full min-h-[60px] p-3 pr-10 border border-slate-200 rounded-md focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm resize-y text-slate-900 bg-white placeholder:text-slate-400"
                                    placeholder="Implemented a new feature that increased conversion by 15%..."
                                  />
                                  <button 
                                    onClick={() => handleEnrich(exp.id, bIndex, bullet, exp.position, exp.company)}
                                    disabled={enriching[`${exp.id}-${bIndex}`]}
                                    title="Enhance with AI"
                                    className="absolute right-2 top-2 text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-indigo-50 rounded disabled:opacity-50"
                                  >
                                    {enriching[`${exp.id}-${bIndex}`] ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                  </button>
                                </div>
                                <button 
                                  onClick={() => {
                                    const newB = exp.achievements.filter((_, i) => i !== bIndex);
                                    updateExperience(exp.id, { achievements: newB });
                                  }}
                                  className="text-slate-400 hover:text-red-500 mt-2 px-2"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ))}
                          </div>
                          
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            leftIcon={<Plus size={16} />} 
                            onClick={() => updateExperience(exp.id, { achievements: [...exp.achievements, ''] })}
                            className="mt-3 text-slate-600"
                          >
                            Add Bullet Point
                          </Button>
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
        className="w-full py-6 border-dashed border-2 text-slate-600 hover:text-indigo-600 hover:border-indigo-600 hover:bg-indigo-50 transition-colors"
        onClick={handleAdd}
      >
        <Plus className="mr-2" size={18} />
        Add Work Experience
      </Button>
    </div>
  );
}
