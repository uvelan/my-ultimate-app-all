"use client";

import { useState, useMemo, useEffect } from "react";
import { Task, Project, Tag, TaskStatus } from "@prisma/client";
import { TaskList } from "./TaskList";
import { TaskBoard } from "./TaskBoard";
import { TaskFilters, TaskFiltersState } from "./TaskFilters";
import { TaskForm } from "./TaskForm";
import { TaskBulkActions } from "./TaskBulkActions";
import { ProjectTagManager } from "./ProjectTagManager";
import { TaskCalendar } from "./TaskCalendar";
import { Button } from "@/components/ui/Button";
import { LayoutList, LayoutDashboard, Calendar as CalendarIcon, Plus, Settings, ChevronLeft } from "lucide-react";
import { 
  createTaskAction, 
  updateTaskAction, 
  deleteTaskAction, 
  bulkUpdateTaskStatusAction, 
  bulkDeleteTasksAction 
} from "@/actions/task";
import toast from "react-hot-toast";

type TaskWithRelations = Task & {
  project: Project | null;
  tags: Tag[];
};

interface TaskManagerProps {
  initialTasks: TaskWithRelations[];
  projects: Project[];
  tags: Tag[];
}

export function TaskManager({ initialTasks, projects, tags }: TaskManagerProps) {
  const [tasks, setTasks] = useState<TaskWithRelations[]>(initialTasks);
  const [view, setView] = useState<"list" | "board" | "calendar">("list");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isProjectTagManagerOpen, setIsProjectTagManagerOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState<TaskFiltersState>({
    search: "",
    status: "",
    priority: "",
    projectId: "",
    tagId: ""
  });

  // Keep client state in sync if server props change (e.g. after revalidatePath)
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (filters.search && !task.title.toLowerCase().includes(filters.search.toLowerCase()) && !task.description?.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.status && task.status !== filters.status) return false;
      if (filters.priority && task.priority !== filters.priority) return false;
      if (filters.projectId && task.projectId !== filters.projectId) return false;
      if (filters.tagId && !task.tags.some(t => t.id === filters.tagId)) return false;
      return true;
    });
  }, [tasks, filters]);

  const handleSelect = (taskId: string) => {
    setSelectedIds(prev => 
      prev.includes(taskId) 
        ? prev.filter(id => id !== taskId) 
        : [...prev, taskId]
    );
  };

  const handleToggleStatus = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === TaskStatus.DONE ? TaskStatus.TODO : TaskStatus.DONE;
    // Optimistic update
    setTasks(tasks.map(t => t.id === taskId ? { ...t, status: newStatus as TaskStatus } : t));
    
    const res = await updateTaskAction({ id: taskId, status: newStatus as TaskStatus });
    if (!res.success) {
      toast.error(res.error || "Failed to update status");
      // Revert on failure
      setTasks(initialTasks);
    }
  };

  const handleDragEnd = async (taskId: string, newStatus: string) => {
    // Optimistic update
    setTasks(tasks.map(t => t.id === taskId ? { ...t, status: newStatus as TaskStatus } : t));
    
    const res = await updateTaskAction({ id: taskId, status: newStatus as TaskStatus });
    if (!res.success) {
      toast.error(res.error || "Failed to move task");
      // Revert on failure
      setTasks(initialTasks);
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm("Are you sure you want to delete this task?")) return;
    
    // Optimistic update
    setTasks(tasks.filter(t => t.id !== taskId));
    setSelectedIds(prev => prev.filter(id => id !== taskId));

    const res = await deleteTaskAction(taskId);
    if (!res.success) {
      toast.error(res.error || "Failed to delete task");
      setTasks(initialTasks);
    } else {
      toast.success("Task deleted");
    }
  };

  const handleFormSubmit = async (data: any) => {
    setIsLoading(true);
    let res;
    if (editingTask) {
      res = await updateTaskAction(data);
    } else {
      res = await createTaskAction(data);
    }

    if (res.success) {
      toast.success(editingTask ? "Task updated" : "Task created");
      setIsFormOpen(false);
      setEditingTask(null);
    } else {
      toast.error(res.error || "Something went wrong");
    }
    setIsLoading(false);
  };

  const handleBulkUpdateStatus = async (status: TaskStatus) => {
    setIsLoading(true);
    // Optimistic update
    setTasks(tasks.map(t => selectedIds.includes(t.id) ? { ...t, status } : t));
    
    const res = await bulkUpdateTaskStatusAction({ taskIds: selectedIds, status });
    if (res.success) {
      toast.success("Tasks updated");
      setSelectedIds([]);
    } else {
      toast.error(res.error || "Failed to update tasks");
      setTasks(initialTasks);
    }
    setIsLoading(false);
  };

  const handleBulkDelete = async () => {
    setIsLoading(true);
    // Optimistic update
    setTasks(tasks.filter(t => !selectedIds.includes(t.id)));
    
    const res = await bulkDeleteTasksAction({ taskIds: selectedIds });
    if (res.success) {
      toast.success("Tasks deleted");
      setSelectedIds([]);
    } else {
      toast.error(res.error || "Failed to delete tasks");
      setTasks(initialTasks);
    }
    setIsLoading(false);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button 
            variant="ghost" 
            onClick={() => window.location.href = '/dashboard'} 
            className="p-1.5 sm:p-2 h-auto text-text-muted hover:text-text-primary bg-background-surface border border-border hover:border-text-muted shrink-0"
            title="Back to Dashboard"
          >
            <ChevronLeft size={18} className="sm:w-5 sm:h-5" />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Tasks</h1>
            <p className="text-text-secondary text-xs sm:text-small">Manage your tasks and projects</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex bg-background-surface border border-border rounded-radius-md p-1 shrink-0">
            <button 
              className={`p-1.5 rounded ${view === 'list' ? 'bg-background shadow-sm text-accent' : 'text-text-muted hover:text-text-primary'}`}
              onClick={() => setView('list')}
              title="List View"
            >
              <LayoutList size={18} />
            </button>
            <button 
              className={`p-1.5 rounded ${view === 'board' ? 'bg-background shadow-sm text-accent' : 'text-text-muted hover:text-text-primary'}`}
              onClick={() => setView('board')}
              title="Board View"
            >
              <LayoutDashboard size={18} />
            </button>
            <button 
              className={`p-1.5 rounded ${view === 'calendar' ? 'bg-background shadow-sm text-accent' : 'text-text-muted hover:text-text-primary'}`}
              onClick={() => setView('calendar')}
              title="Calendar View"
            >
              <CalendarIcon size={18} />
            </button>
          </div>
          
          <Button 
            onClick={() => setIsProjectTagManagerOpen(true)}
            variant="secondary"
            className="flex-1 sm:flex-none text-xs sm:text-sm px-2 sm:px-4"
            leftIcon={<Settings size={16} className="sm:w-[18px] sm:h-[18px]" />}
          >
            Manage
          </Button>

          <Button 
            onClick={() => {
              setEditingTask(null);
              setIsFormOpen(true);
            }}
            className="flex-1 sm:flex-none text-xs sm:text-sm px-2 sm:px-4"
            leftIcon={<Plus size={16} className="sm:w-[18px] sm:h-[18px]" />}
          >
            New Task
          </Button>
        </div>
      </div>

      <TaskFilters 
        filters={filters} 
        onChange={setFilters} 
        projects={projects} 
        tags={tags} 
      />

      {view === 'list' && (
        <TaskList 
          tasks={filteredTasks} 
          onEdit={(task) => {
            setEditingTask(task);
            setIsFormOpen(true);
          }}
          onDelete={handleDelete}
          onToggleStatus={handleToggleStatus}
          selectedIds={selectedIds}
          onSelect={handleSelect}
        />
      )}
      
      {view === 'board' && (
        <TaskBoard 
          tasks={filteredTasks} 
          onEdit={(task) => {
            setEditingTask(task);
            setIsFormOpen(true);
          }}
          onDelete={handleDelete}
          onToggleStatus={handleToggleStatus}
          onDragEnd={handleDragEnd}
          selectedIds={selectedIds}
          onSelect={handleSelect}
        />
      )}

      {view === 'calendar' && (
        <TaskCalendar 
          tasks={filteredTasks}
          onSelectTask={(taskId) => {
            const task = tasks.find(t => t.id === taskId);
            if (task) {
              setEditingTask(task);
              setIsFormOpen(true);
            }
          }}
          onAddTask={(date) => {
            setEditingTask({} as any);
            setIsFormOpen(true);
          }}
        />
      )}

      {isFormOpen && (
        <TaskForm 
          initialData={editingTask}
          projects={projects}
          tags={tags}
          onSubmit={handleFormSubmit}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingTask(null);
          }}
          isLoading={isLoading}
        />
      )}

      {isProjectTagManagerOpen && (
        <ProjectTagManager 
          projects={projects}
          tags={tags}
          onClose={() => setIsProjectTagManagerOpen(false)}
        />
      )}

      <TaskBulkActions 
        selectedIds={selectedIds}
        onClearSelection={() => setSelectedIds([])}
        onBulkUpdateStatus={handleBulkUpdateStatus}
        onBulkDelete={handleBulkDelete}
        isLoading={isLoading}
      />
    </div>
  );
}
