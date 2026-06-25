'use client';

import { useResumeStore } from '@/store/resume-builder/resumeStore';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

export function Step7Certifications() {
  const { data, addCertification, updateCertification, removeCertification, reorderCertification } = useResumeStore();

  const handleAdd = () => {
    addCertification({
      id: uuidv4(),
      name: '',
      issuingOrg: '',
      issueDate: '',
    });
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    reorderCertification(result.source.index, result.destination.index);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#e5e2e1] mb-1">Certifications</h2>
          <p className="text-sm text-text-muted">Add any relevant professional certifications or licenses.</p>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="certifications-list">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-6">
              {data.certifications.map((cert, index) => (
                <Draggable key={cert.id} draggableId={cert.id} index={index}>
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
                          {cert.name || 'New Certification'}
                        </span>
                        <button onClick={() => removeCertification(cert.id)} className="text-text-muted hover:text-red-500 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      
                      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input 
                          label="Certification Name" 
                          placeholder="e.g. AWS Certified Solutions Architect"
                          value={cert.name} 
                          onChange={(e) => updateCertification(cert.id, { name: e.target.value })} 
                        />
                        <Input 
                          label="Issuing Organization" 
                          placeholder="e.g. Amazon Web Services"
                          value={cert.issuingOrg} 
                          onChange={(e) => updateCertification(cert.id, { issuingOrg: e.target.value })} 
                        />
                        <Input 
                          label="Issue Date" 
                          type="month"
                          value={cert.issueDate} 
                          onChange={(e) => updateCertification(cert.id, { issueDate: e.target.value })} 
                        />
                        <Input 
                          label="Credential URL (Optional)" 
                          placeholder="https://..."
                          value={cert.credentialUrl || ''} 
                          onChange={(e) => updateCertification(cert.id, { credentialUrl: e.target.value })} 
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
        Add Certification
      </Button>
    </div>
  );
}
