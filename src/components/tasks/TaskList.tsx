"use client";

import { Task, Project, Tag } from "@prisma/client";
import { TaskCard } from "./TaskCard";

type TaskWithRelations = Task & {
  project: Project | null;
  tags: Tag[];
};

interface TaskListProps {
  tasks: TaskWithRelations[];
  onEdit: (task: TaskWithRelations) => void;
  onDelete: (taskId: string) => void;
  onToggleStatus: (taskId: string, currentStatus: string) => void;
  selectedIds: string[];
  onSelect: (taskId: string) => void;
}

export function TaskList({ 
  tasks, 
  onEdit, 
  onDelete, 
  onToggleStatus,
  selectedIds,
  onSelect
}: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="py-12 text-center text-text-muted">
        <p>No tasks found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map(task => (
        <TaskCard 
          key={task.id} 
          task={task} 
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleStatus={onToggleStatus}
          isSelected={selectedIds.includes(task.id)}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
