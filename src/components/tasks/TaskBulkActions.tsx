"use client";

import { Button } from "@/components/ui/Button";
import { TaskStatus } from "@prisma/client";
import { Trash2, CheckCircle, XCircle } from "lucide-react";

interface TaskBulkActionsProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onBulkUpdateStatus: (status: TaskStatus) => void;
  onBulkDelete: () => void;
  isLoading?: boolean;
}

export function TaskBulkActions({ 
  selectedIds, 
  onClearSelection, 
  onBulkUpdateStatus, 
  onBulkDelete,
  isLoading 
}: TaskBulkActionsProps) {
  if (selectedIds.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-background border border-border shadow-2xl rounded-radius-lg p-3 flex items-center gap-4 z-40 animate-in slide-in-from-bottom-10 fade-in duration-300">
      <div className="flex items-center gap-2 pr-4 border-r border-border">
        <span className="bg-accent text-white w-6 h-6 rounded-full flex items-center justify-center text-caption font-bold">
          {selectedIds.length}
        </span>
        <span className="text-small font-medium text-text-primary">selected</span>
      </div>

      <div className="flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => onBulkUpdateStatus(TaskStatus.DONE)}
          disabled={isLoading}
          leftIcon={<CheckCircle size={16} />}
        >
          Mark Done
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => onBulkUpdateStatus(TaskStatus.TODO)}
          disabled={isLoading}
          leftIcon={<XCircle size={16} />}
        >
          Mark To Do
        </Button>
        <Button 
          variant="danger" 
          size="sm" 
          onClick={() => {
            if (confirm("Are you sure you want to delete selected tasks?")) {
              onBulkDelete();
            }
          }}
          disabled={isLoading}
          leftIcon={<Trash2 size={16} />}
        >
          Delete
        </Button>
      </div>

      <div className="pl-2">
        <button 
          onClick={onClearSelection}
          className="text-small text-text-muted hover:text-text-primary underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
