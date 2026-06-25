'use client';

import { useResumeStore } from '@/store/resume-builder/resumeStore';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

export function Step9Publications() {
  const { data, addPublication, updatePublication, removePublication, reorderPublication } = useResumeStore();

  const handleAdd = () => {
    addPublication({
      id: uuidv4(),
      title: '',
      publisher: '',
    });
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    reorderPublication(result.source.index, result.destination.index);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#e5e2e1] mb-1">Publications</h2>
          <p className="text-sm text-text-muted">List your published papers, articles, or books.</p>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="publications-list">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-6">
              {data.publications.map((pub, index) => (
                <Draggable key={pub.id} draggableId={pub.id} index={index}>
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
                          {pub.title || 'New Publication'}
                        </span>
                        <button onClick={() => removePublication(pub.id)} className="text-text-muted hover:text-red-500 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      
                      <div className="p-6 grid grid-cols-1 gap-4">
                        <Input 
                          label="Title" 
                          placeholder="e.g. A Novel Approach to Distributed Systems"
                          value={pub.title} 
                          onChange={(e) => updatePublication(pub.id, { title: e.target.value })} 
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input 
                            label="Publisher / Journal / Date" 
                            placeholder="e.g. IEEE Transactions, 2023"
                            value={pub.publisher} 
                            onChange={(e) => updatePublication(pub.id, { publisher: e.target.value })} 
                          />
                          <Input 
                            label="Link to Publication (Optional)" 
                            placeholder="https://..."
                            value={pub.link || ''} 
                            onChange={(e) => updatePublication(pub.id, { link: e.target.value })} 
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
        Add Publication
      </Button>
    </div>
  );
}
