"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Task, Project, Tag, TaskStatus, Priority, Frequency } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { createTaskSchema, CreateTaskInput, updateTaskSchema, UpdateTaskInput } from "@/lib/tasks/task-schema";
import { X } from "lucide-react";

type TaskWithRelations = Task & {
  project: Project | null;
  tags: Tag[];
};

interface TaskFormProps {
  initialData?: TaskWithRelations | null;
  projects: Project[];
  tags: Tag[];
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}

export function TaskForm({ initialData, projects, tags, onSubmit, onCancel, isLoading }: TaskFormProps) {
  const isEditing = !!initialData;
  const schema = isEditing ? updateTaskSchema : createTaskSchema;

  const { register, handleSubmit, control, formState: { errors } } = useForm<any>({
    resolver: zodResolver(schema as any),
    defaultValues: initialData ? {
      id: initialData.id,
      title: initialData.title,
      description: initialData.description || "",
      status: initialData.status,
      priority: initialData.priority,
      startDate: initialData.startDate ? new Date(initialData.startDate) : null,
      dueDate: initialData.dueDate ? new Date(initialData.dueDate) : null,
      projectId: initialData.projectId || "",
      tagIds: initialData.tags.map(t => t.id),
      frequency: (initialData as any).frequency || null,
    } : {
      title: "",
      description: "",
      status: TaskStatus.TODO,
      priority: Priority.MEDIUM,
      frequency: null,
      projectId: "",
      tagIds: [],
    }
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-radius-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="text-xl font-semibold">
            {isEditing ? "Edit Task" : "Create Task"}
          </h2>
          <button onClick={onCancel} className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <Input 
            label="Title" 
            {...register("title")} 
            error={errors.title?.message as string} 
            placeholder="What needs to be done?"
            autoFocus
          />

          <Textarea 
            label="Description" 
            {...register("description")} 
            error={errors.description?.message as string}
            placeholder="Add details..."
            rows={3}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select label="Status" {...register("status")} error={errors.status?.message as string}>
              {Object.values(TaskStatus).map(status => (
                <option key={status} value={status}>{status.replace("_", " ")}</option>
              ))}
            </Select>

            <Select label="Priority" {...register("priority")} error={errors.priority?.message as string}>
              {Object.values(Priority).map(priority => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input 
              type="date" 
              label="Start Date" 
              {...register("startDate", { valueAsDate: true })} 
              error={errors.startDate?.message as string} 
            />
            
            <Input 
              type="date" 
              label="Due Date" 
              {...register("dueDate", { valueAsDate: true })} 
              error={errors.dueDate?.message as string} 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select label="Project" {...register("projectId")}>
              <option value="">No Project</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>

            <Select label="Recurrence" {...register("frequency")} error={errors.frequency?.message as string}>
              <option value="">None (One-time)</option>
              {Object.values(Frequency).map(f => (
                <option key={f} value={f}>{f.charAt(0) + f.slice(1).toLowerCase()}</option>
              ))}
            </Select>
          </div>

          {/* Simple Tag selection (multi-select alternative) */}
          <div className="space-y-1">
            <label className="text-small font-medium text-text-secondary">Tags</label>
            <div className="flex flex-wrap gap-2">
              <Controller
                name="tagIds"
                control={control}
                render={({ field }) => (
                  <>
                    {tags.map(tag => {
                      const isSelected = field.value?.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          className={`px-3 py-1 text-small rounded-full border transition-colors ${
                            isSelected 
                              ? 'bg-accent text-white border-accent' 
                              : 'bg-background-surface text-text-secondary border-border hover:border-accent'
                          }`}
                          onClick={() => {
                            const newValue = isSelected 
                              ? field.value.filter((id: string) => id !== tag.id)
                              : [...(field.value || []), tag.id];
                            field.onChange(newValue);
                          }}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </>
                )}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button type="submit" isLoading={isLoading}>
              {isEditing ? "Save Changes" : "Create Task"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
