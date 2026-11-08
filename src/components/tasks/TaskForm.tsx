"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Task, Project, Tag, TaskStatus, Priority, Frequency } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { createTaskSchema, CreateTaskInput, updateTaskSchema, UpdateTaskInput } from "@/lib/tasks/task-schema";
import { X } from "lucide-react";
import { parseTaskDay, taskAreas, taskDay } from "@/lib/tasks/task-planning";

type TaskWithRelations = Task & {
  project: Project | null;
  tags: Tag[];
};

interface TaskFormProps {
  initialData?: TaskWithRelations | null;
  initialDate?: Date | null;
  initialArea?: string;
  projects: Project[];
  tags: Tag[];
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  embedded?: boolean;
}

export function TaskForm({ initialData, initialDate, initialArea, projects, tags, onSubmit, onCancel, isLoading, embedded = false }: TaskFormProps) {
  const [removeSharing, setRemoveSharing] = useState(false);
  const isEditing = !!initialData;
  const schema = isEditing ? updateTaskSchema : createTaskSchema;

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm<any>({
    resolver: zodResolver(schema as any),
    defaultValues: initialData ? {
      id: initialData.id,
      title: initialData.title,
      description: initialData.description || "",
      status: initialData.status,
      priority: initialData.priority,
      area: initialData.area || "",
      colleague: initialData.colleague || "",
      jiraKey: initialData.jiraKey || "",
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
      area: initialArea || "",
      colleague: "",
      jiraKey: "",
      startDate: null,
      dueDate: initialDate || null,
      projectId: "",
      tagIds: [],
    }
  });

  const area = watch("area");

  return (
    <div className={embedded ? "" : "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"}>
      <div className={embedded ? "rounded-xl border border-border bg-secondary" : "bg-background rounded-radius-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"}>
        <div className="flex justify-between items-center p-6 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="text-xl font-semibold">
            {isEditing ? "Edit Task" : "Create Task"}
          </h2>
          <button onClick={onCancel} className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit(values => onSubmit({ ...values, shareWith: removeSharing ? null : values.shareWith || undefined }))} className="p-6 space-y-4">
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

          <Controller control={control} name="area" render={({ field }) => (
            <Select label="Area" {...field} value={field.value || ""} onChange={event => field.onChange(event.target.value || null)}>
              {taskAreas.map(area => <option key={area.value} value={area.value}>{area.label}</option>)}
            </Select>
          )} />
          {area === "OFFICE" && <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Colleague" placeholder="Name" {...register("colleague")} error={errors.colleague?.message as string} />
            <Input label="Jira issue key" placeholder="OPS-142" {...register("jiraKey")} error={errors.jiraKey?.message as string} />
            <Input label="Share with colleague (optional)" type="email" placeholder="Existing app account email"
              {...register("shareWith")} error={errors.shareWith?.message as string} />
            {initialData?.assignedUserId && <label className="self-end text-sm text-text-secondary">
              <input type="checkbox" className="mr-2" checked={removeSharing} onChange={event => setRemoveSharing(event.target.checked)} /> Remove sharing
            </label>}
          </div>}
          <div className="grid grid-cols-2 gap-4">
            {(["startDate", "dueDate"] as const).map(name => <Controller key={name} control={control} name={name}
              render={({ field }) => <Input type="date" id={name} label={name === "startDate" ? "Start date" : "Due date"}
                {...field} value={taskDay(field.value)} onChange={event => field.onChange(parseTaskDay(event.target.value))}
                error={errors[name]?.message as string} />} />)}
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
