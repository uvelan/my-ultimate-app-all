export const taskAreas = [
  { value: '', label: 'Unassigned' },
  { value: 'OFFICE', label: 'Office' },
  { value: 'PERSONAL', label: 'Personal' },
] as const;

export const taskPlans = [
  { value: 'active', label: 'Open' },
  { value: 'today', label: 'Today' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'upcoming', label: 'Next 7 days' },
  { value: 'undated', label: 'No date' },
  { value: 'all', label: 'All statuses' },
] as const;

export type TaskPlan = typeof taskPlans[number]['value'];
type PlannableTask = { status: string; dueDate?: string | Date | null; priority: string };

export function localTaskDay(date: Date): string {
  return [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function taskDay(value?: string | Date | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const iso = date.toISOString();
  // New date-only tasks and legacy web dates are stored at UTC midnight.
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : localTaskDay(date);
}

export function parseTaskDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && taskDay(date) === value ? date : null;
}

export function matchesTaskPlan(task: PlannableTask, plan: TaskPlan, now: Date): boolean {
  if (plan === 'all') return true;
  if (task.status === 'DONE' || task.status === 'ARCHIVED') return false;
  if (plan === 'active') return true;
  const due = taskDay(task.dueDate), today = localTaskDay(now);
  if (plan === 'undated') return !due;
  if (!due) return false;
  if (plan === 'today') return due === today;
  if (plan === 'overdue') return due < today;
  const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  return due > today && due <= localTaskDay(limit);
}

export function comparePlannedTasks(left: PlannableTask, right: PlannableTask): number {
  const priority = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  return (taskDay(left.dueDate) || '9999').localeCompare(taskDay(right.dueDate) || '9999')
    || priority.indexOf(right.priority) - priority.indexOf(left.priority);
}
