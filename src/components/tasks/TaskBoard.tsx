"use client";

import { Task, Project, Tag, TaskStatus } from "@prisma/client";
import { TaskCard } from "./TaskCard";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useState, useEffect } from "react";

type TaskWithRelations = Task & {
  project: Project | null;
  tags: Tag[];
};

interface TaskBoardProps {
  tasks: TaskWithRelations[];
  onEdit: (task: TaskWithRelations) => void;
  onDelete: (taskId: string) => void;
  onToggleStatus: (taskId: string, currentStatus: string) => void;
  onDragEnd: (taskId: string, newStatus: string) => void;
  selectedIds: string[];
  onSelect: (taskId: string) => void;
}

const COLUMNS = [
  { id: TaskStatus.TODO, title: "To Do" },
  { id: TaskStatus.IN_PROGRESS, title: "In Progress" },
  { id: TaskStatus.BLOCKED, title: "Blocked" },
  { id: TaskStatus.DONE, title: "Done" }
];

export function TaskBoard({ 
  tasks, 
  onEdit, 
  onDelete, 
  onToggleStatus,
  onDragEnd,
  selectedIds,
  onSelect
}: TaskBoardProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null; // Avoid SSR mismatch with drag and drop

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    onDragEnd(draggableId, destination.droppableId);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 h-full min-h-[500px]">
        {COLUMNS.map(column => {
          const columnTasks = tasks.filter(t => t.status === column.id);

          return (
            <div key={column.id} className="min-w-[300px] w-[300px] flex-shrink-0 bg-background-surface/50 rounded-radius-lg flex flex-col">
              <div className="p-3 font-semibold text-text-primary border-b border-border flex items-center justify-between">
                {column.title}
                <span className="text-caption bg-background px-2 py-0.5 rounded-full text-text-muted border border-border">
                  {columnTasks.length}
                </span>
              </div>
              
              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 p-2 space-y-3 transition-colors ${
                      snapshot.isDraggingOver ? 'bg-accent/5' : ''
                    }`}
                  >
                    {columnTasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            style={provided.draggableProps.style as React.CSSProperties}
                          >
                            <TaskCard 
                              task={task} 
                              onEdit={onEdit}
                              onDelete={onDelete}
                              onToggleStatus={onToggleStatus}
                              isSelected={selectedIds.includes(task.id)}
                              onSelect={onSelect}
                              isDragOverlay={snapshot.isDragging}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
