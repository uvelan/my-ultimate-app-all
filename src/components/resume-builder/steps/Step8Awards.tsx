'use client';

import { useResumeStore } from '@/store/resume-builder/resumeStore';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

export function Step8Awards() {
  const { data, addAward, updateAward, removeAward, reorderAward } = useResumeStore();

  const handleAdd = () => {
    addAward({
      id: uuidv4(),
      name: '',
      date: '',
    });
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    reorderAward(result.source.index, result.destination.index);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#e5e2e1] mb-1">Awards & Honors</h2>
          <p className="text-sm text-text-muted">Highlight your achievements, scholarships, or recognition.</p>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="awards-list">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-6">
              {data.awards.map((award, index) => (
                <Draggable key={award.id} draggableId={award.id} index={index}>
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
                          {award.name || 'New Award'}
                        </span>
                        <button onClick={() => removeAward(award.id)} className="text-text-muted hover:text-red-500 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      
                      <div className="p-6 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input 
                            label="Award Name" 
                            placeholder="e.g. Employee of the Year"
                            value={award.name} 
                            onChange={(e) => updateAward(award.id, { name: e.target.value })} 
                          />
                          <Input 
                            label="Date Received" 
                            type="month"
                            value={award.date} 
                            onChange={(e) => updateAward(award.id, { date: e.target.value })} 
                          />
                        </div>
                        <Input 
                          label="Description (Optional)" 
                          placeholder="Briefly describe the significance of this award..."
                          value={award.description || ''} 
                          onChange={(e) => updateAward(award.id, { description: e.target.value })} 
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
        className="w-full py-6 border-dashed border-2 text-text-muted hover:text-indigo-600 hover:border-indigo-600 hover:bg-indigo-50 transition-colors"
        onClick={handleAdd}
      >
        <Plus className="mr-2" size={18} />
        Add Award
      </Button>
    </div>
  );
}
