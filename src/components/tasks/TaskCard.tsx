"use client";

import { Task, Project, Tag } from "@prisma/client";
import { format } from "date-fns";
import { CalendarIcon, ClockIcon, CheckCircle2, Circle, MoreVertical, Edit2, Trash2, Repeat } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

type TaskWithRelations = Task & {
  project: Project | null;
  tags: Tag[];
};

interface TaskCardProps {
  task: TaskWithRelations;
  onEdit: (task: TaskWithRelations) => void;
  onDelete: (taskId: string) => void;
  onToggleStatus: (taskId: string, currentStatus: string) => void;
  isSelected?: boolean;
  onSelect?: (taskId: string) => void;
  isDragOverlay?: boolean;
}

export function TaskCard({
  task,
  onEdit,
  onDelete,
  onToggleStatus,
  isSelected,
  onSelect,
  isDragOverlay
}: TaskCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  const isDone = task.status === "DONE";

  const priorityColors: Record<string, string> = {
    LOW: "bg-background-alt text-text-secondary",
    MEDIUM: "bg-blue-500/10 text-blue-500",
    HIGH: "bg-orange-500/10 text-orange-500",
    URGENT: "bg-red-500/10 text-red-500",
  };

  return (
    <Card 
      className={`p-4 transition-all duration-200 group ${isDragOverlay ? 'shadow-xl scale-105 cursor-grabbing' : 'hover:shadow-md cursor-grab'} ${isSelected ? 'ring-2 ring-accent' : ''}`}
      onClick={(e) => {
        if (onSelect) {
          onSelect(task.id);
        }
      }}
    >
      <div className="flex items-start gap-3">
        {onSelect && (
          <input 
            type="checkbox" 
            checked={isSelected} 
            onChange={() => onSelect(task.id)}
            className="mt-1 rounded border-border text-accent focus:ring-accent"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <button 
          className="mt-0.5 flex-shrink-0 text-text-muted hover:text-accent transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onToggleStatus(task.id, task.status);
          }}
        >
          {isDone ? <CheckCircle2 className="text-success" size={20} /> : <Circle size={20} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <h4 className={`text-base font-medium truncate ${isDone ? 'line-through text-text-muted' : 'text-text-primary'}`}>
              {task.title}
            </h4>
            
            <div className="relative">
              <button 
                className="p-1 text-text-muted hover:text-text-primary rounded opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
              >
                <MoreVertical size={16} />
              </button>
              
              {showMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                    }} 
                  />
                  <div className="absolute right-0 mt-1 w-32 bg-background border border-border rounded-radius-md shadow-lg z-20 py-1">
                    <button 
                      className="w-full text-left px-4 py-2 text-small hover:bg-background-surface flex items-center gap-2 text-text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onEdit(task);
                      }}
                    >
                      <Edit2 size={14} /> Edit
                    </button>
                    <button 
                      className="w-full text-left px-4 py-2 text-small hover:bg-background-surface flex items-center gap-2 text-error"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onDelete(task.id);
                      }}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {task.description && (
            <p className="text-small text-text-secondary mt-1 line-clamp-2">
              {task.description}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2 items-center">
            {task.dueDate && (
              <span className={`flex items-center gap-1 text-caption ${task.dueDate < new Date() && !isDone ? 'text-error' : 'text-text-muted'}`}>
                <CalendarIcon size={12} />
                {format(new Date(task.dueDate), "MMM d")}
              </span>
            )}

            {(task as any).frequency && (
              <span className="flex items-center gap-1 text-caption text-text-muted" title={`Repeats ${(task as any).frequency.toLowerCase()}`}>
                <Repeat size={12} />
              </span>
            )}
            
            <span className={`text-caption px-2 py-0.5 rounded-full font-medium ${priorityColors[task.priority]}`}>
              {task.priority.toLowerCase()}
            </span>

            {task.project && (
              <span className="text-caption text-text-secondary flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: task.project.color || '#888' }} />
                {task.project.name}
              </span>
            )}
          </div>
          
          {task.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {task.tags.map(tag => (
                <span key={tag.id} className="text-[10px] px-1.5 py-0.5 bg-background-surface border border-border rounded text-text-secondary">
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
