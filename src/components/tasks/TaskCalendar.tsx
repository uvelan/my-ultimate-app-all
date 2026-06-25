"use client";

import { useMemo, useState } from "react";
import { Task, Project, Tag } from "@prisma/client";
import { 
  format, 
  addMonths, 
  subMonths, 
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isToday 
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

type TaskWithRelations = Task & {
  project: Project | null;
  tags: Tag[];
};

interface TaskCalendarProps {
  tasks: TaskWithRelations[];
  onSelectTask: (taskId: string) => void;
  onAddTask?: (date: Date) => void;
}

export function TaskCalendar({ tasks, onSelectTask, onAddTask }: TaskCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"month" | "week" | "day">("month");

  const handlePrev = () => {
    if (view === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (view === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };
  const handleNext = () => {
    if (view === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (view === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };
  const handleToday = () => setCurrentDate(new Date());

  // Generate the days for the calendar grid based on view
  const days = useMemo(() => {
    if (view === 'month') {
      const start = startOfWeek(startOfMonth(currentDate));
      const end = endOfWeek(endOfMonth(currentDate));
      return eachDayOfInterval({ start, end });
    } else if (view === 'week') {
      const start = startOfWeek(currentDate);
      const end = endOfWeek(currentDate);
      return eachDayOfInterval({ start, end });
    } else {
      return [currentDate];
    }
  }, [currentDate, view]);

  // Pre-process tasks for fast lookup by date
  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskWithRelations[]>();
    
    tasks.forEach(task => {
      const dates = [];
      if (task.startDate) dates.push(new Date(task.startDate));
      if (task.dueDate) dates.push(new Date(task.dueDate));
      
      const uniqueDateStrings = Array.from(new Set(dates.map(d => format(d, 'yyyy-MM-dd'))));
      
      uniqueDateStrings.forEach(dateStr => {
        if (!map.has(dateStr)) {
          map.set(dateStr, []);
        }
        map.get(dateStr)!.push(task);
      });
    });
    
    return map;
  }, [tasks]);

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Helper to get header title
  const getHeaderTitle = () => {
    if (view === 'month') return format(currentDate, 'MMMM yyyy');
    if (view === 'week') {
      const start = startOfWeek(currentDate);
      const end = endOfWeek(currentDate);
      if (isSameMonth(start, end)) return `${format(start, 'MMMM yyyy')}`;
      return `${format(start, 'MMM')} - ${format(end, 'MMM yyyy')}`;
    }
    return format(currentDate, 'EEEE, MMMM do, yyyy');
  };

  const renderMonthView = () => (
    <div className="grid grid-cols-7 flex-1 bg-border gap-[1px]">
      {days.map((day) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayTasks = tasksByDate.get(dateStr) || [];
        const isCurrentMonth = isSameMonth(day, currentDate);
        const isDayToday = isToday(day);

        return (
          <div 
            key={day.toString()}
            onClick={() => {
              setCurrentDate(day);
              setView('day');
            }}
            className={`
              bg-background hover:bg-background-surface transition-colors cursor-pointer p-1 sm:p-2 flex flex-col min-h-0
              ${!isCurrentMonth ? 'opacity-40 bg-background-surface' : ''}
            `}
          >
            <div className="flex justify-between items-start mb-1 sm:mb-2">
              <span className={`
                text-xs sm:text-sm w-5 h-5 sm:w-7 sm:h-7 flex items-center justify-center rounded-full font-medium
                ${isDayToday ? 'bg-accent text-white' : 'text-text-secondary'}
              `}>
                {format(day, 'd')}
              </span>
              {dayTasks.length > 0 && (
                <span className="hidden sm:inline-flex text-[10px] font-medium text-text-muted bg-background-surface border border-border px-1.5 py-0.5 rounded">
                  {dayTasks.length}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {dayTasks.slice(0, 4).map(task => {
                const isDone = task.status === 'DONE';
                return (
                  <div 
                    key={task.id}
                    onClick={(e) => { e.stopPropagation(); onSelectTask(task.id); }}
                    className={`
                      text-[9px] sm:text-xs truncate px-1 sm:px-1.5 py-0.5 sm:py-1 rounded border
                      ${isDone ? 'bg-background-surface border-border text-text-muted line-through opacity-70' : 'bg-background text-text-primary border-border shadow-sm hover:border-accent'}
                    `}
                  >
                    <div className="flex items-center gap-1 sm:gap-1.5">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0" style={{ backgroundColor: task.project?.color || '#3b82f6' }} />
                      <span className="truncate hidden sm:inline">{task.title}</span>
                    </div>
                  </div>
                );
              })}
              {dayTasks.length > 4 && (
                <div className="text-[9px] sm:text-[10px] text-text-muted text-center pt-0.5 sm:pt-1 font-medium">
                  +{dayTasks.length - 4} <span className="hidden sm:inline">more</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderWeekView = () => (
    <div className="grid grid-cols-7 flex-1 bg-border gap-[1px]">
      {days.map((day) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayTasks = tasksByDate.get(dateStr) || [];
        const isDayToday = isToday(day);

        return (
          <div 
            key={day.toString()} 
            className="bg-background flex flex-col p-1 sm:p-2 hover:bg-background-surface/50 transition-colors cursor-pointer group/col min-w-0"
            onClick={() => { setCurrentDate(day); setView('day'); }}
          >
            <div className="flex justify-center mb-2 sm:mb-4">
              <span className={`
                text-sm sm:text-lg w-6 h-6 sm:w-10 sm:h-10 flex items-center justify-center rounded-full font-medium transition-colors
                ${isDayToday ? 'bg-accent text-white shadow-sm' : 'text-text-primary group-hover/col:bg-background-surface'}
              `}>
                {format(day, 'd')}
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-1 sm:space-y-2 pr-0.5 sm:pr-1 custom-scrollbar min-h-[100px]">
              {dayTasks.map(task => {
                const isDone = task.status === 'DONE';
                return (
                  <div 
                    key={task.id}
                    onClick={(e) => { e.stopPropagation(); onSelectTask(task.id); }}
                    className={`
                      text-[9px] sm:text-xs p-1 sm:p-2 rounded border cursor-pointer flex flex-col gap-1 sm:gap-1.5 min-w-0
                      ${isDone ? 'bg-background-surface border-border opacity-70' : 'bg-background text-text-primary border-border shadow-sm hover:border-accent hover:shadow-md transition-all'}
                    `}
                  >
                    <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0" style={{ backgroundColor: task.project?.color || '#3b82f6' }} />
                      <span className={`font-medium truncate ${isDone ? 'line-through text-text-muted' : ''}`}>{task.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <button 
              onClick={(e) => { e.stopPropagation(); onAddTask?.(day); }}
              className="mt-1 sm:mt-2 w-full py-1 sm:py-1.5 border border-dashed border-border rounded text-text-muted hover:text-accent hover:border-accent hover:bg-accent-transparent transition-colors flex items-center justify-center text-[10px] sm:text-xs gap-1 opacity-0 group-hover/col:opacity-100 focus:opacity-100"
            >
              <Plus size={12} className="hidden sm:block" />
              <span className="hidden sm:inline">Add</span>
              <span className="sm:hidden">+</span>
            </button>
          </div>
        );
      })}
    </div>
  );

  const renderDayView = () => {
    const day = days[0];
    const dateStr = format(day, 'yyyy-MM-dd');
    const dayTasks = tasksByDate.get(dateStr) || [];
    
    // Group by project exactly like the modal
    const groups: Record<string, { project: Project | null, tasks: TaskWithRelations[] }> = {};
    groups["no-project"] = { project: null, tasks: [] };

    dayTasks.forEach(task => {
      if (task.project) {
        if (!groups[task.project.id]) groups[task.project.id] = { project: task.project, tasks: [] };
        groups[task.project.id].tasks.push(task);
      } else {
        groups["no-project"].tasks.push(task);
      }
    });

    if (groups["no-project"].tasks.length === 0) delete groups["no-project"];
    const groupedTasks = Object.values(groups);

    return (
      <div className="flex-1 bg-background overflow-y-auto p-6 md:p-10 custom-scrollbar relative">
        {/* Back Button */}
        <div className="absolute top-4 left-4 md:top-6 md:left-6">
          <button 
            onClick={() => setView('month')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary bg-background-surface border border-border rounded-radius-md hover:border-text-muted transition-colors shadow-sm"
          >
            <ChevronLeft size={16} /> Back to Month
          </button>
        </div>

        <div className="max-w-3xl mx-auto space-y-8 mt-12 md:mt-8">
          
          <div className="flex justify-between items-center pb-4 border-b border-border">
            <div>
              <h3 className="text-2xl font-bold text-text-primary">{format(day, 'EEEE')}</h3>
              <p className="text-text-muted">{format(day, 'MMMM do, yyyy')}</p>
            </div>
            <button 
              onClick={() => onAddTask?.(day)}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-radius-md hover:bg-accent-hover transition-colors text-sm font-medium shadow-sm"
            >
              <Plus size={16} /> Add Task
            </button>
          </div>

          {groupedTasks.length === 0 ? (
            <div className="text-center py-20 text-text-muted">
              <p>No tasks scheduled for this day. Enjoy your free time!</p>
            </div>
          ) : (
            <div className="space-y-8">
              {groupedTasks.map(group => (
                <div key={group.project ? group.project.id : 'no-project'} className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-border pb-2">
                    {group.project ? (
                      <>
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: group.project.color || '#888' }} />
                        <h3 className="font-semibold text-lg">{group.project.name}</h3>
                      </>
                    ) : (
                      <h3 className="font-semibold text-lg text-text-muted">No Project</h3>
                    )}
                    <span className="text-xs font-medium bg-background-surface px-2 py-0.5 rounded-full text-text-muted border border-border">
                      {group.tasks.length}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {group.tasks.map(task => (
                      <div 
                        key={task.id} 
                        onClick={() => onSelectTask(task.id)}
                        className="group p-4 bg-background-surface border border-border rounded-radius-lg hover:border-accent hover:shadow-md cursor-pointer transition-all flex items-start justify-between gap-4"
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`mt-1 w-4 h-4 rounded-full border shrink-0 transition-colors ${task.status === 'DONE' ? 'bg-success border-success' : 'border-text-muted group-hover:border-accent'}`} />
                          <div className="flex flex-col min-w-0">
                            <span className={`font-medium truncate block ${task.status === 'DONE' ? 'line-through text-text-muted' : 'text-text-primary'}`}>
                              {task.title}
                            </span>
                            {task.description && (
                              <span className="text-xs text-text-muted truncate block mt-0.5">
                                {task.description}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="shrink-0 text-[10px] font-semibold px-2 py-1 rounded bg-background text-text-secondary border border-border">
                          {task.priority.toLowerCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`bg-background rounded-radius-lg border border-border shadow-sm overflow-hidden flex flex-col ${view === 'month' ? 'h-[750px]' : 'min-h-[500px]'}`}>
      {/* Calendar Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between p-4 sm:p-6 border-b border-border bg-background-surface shrink-0 gap-4">
        
        <div className="flex items-center gap-2">
          <button onClick={handlePrev} className="p-2 hover:bg-background rounded-full border border-transparent hover:border-border transition-all text-text-muted hover:text-text-primary">
            <ChevronLeft size={20} />
          </button>
          <button onClick={handleNext} className="p-2 hover:bg-background rounded-full border border-transparent hover:border-border transition-all text-text-muted hover:text-text-primary">
            <ChevronRight size={20} />
          </button>
          <h2 className="text-lg sm:text-xl font-semibold text-text-primary ml-2 min-w-[200px]">
            {getHeaderTitle()}
          </h2>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={handleToday} className="px-4 py-1.5 text-sm font-medium hover:bg-background rounded border border-border transition-all text-text-muted hover:text-text-primary shadow-sm">
            Today
          </button>
          
          {/* View Toggles */}
          <div className="flex bg-background border border-border rounded p-1 shadow-sm">
            <button 
              className={`px-3 py-1 text-xs font-medium rounded ${view === 'month' ? 'bg-accent text-white shadow' : 'text-text-muted hover:text-text-primary'}`}
              onClick={() => setView('month')}
            >
              Month
            </button>
            <button 
              className={`px-3 py-1 text-xs font-medium rounded ${view === 'week' ? 'bg-accent text-white shadow' : 'text-text-muted hover:text-text-primary'}`}
              onClick={() => setView('week')}
            >
              Week
            </button>
            <button 
              className={`px-3 py-1 text-xs font-medium rounded ${view === 'day' ? 'bg-accent text-white shadow' : 'text-text-muted hover:text-text-primary'}`}
              onClick={() => setView('day')}
            >
              Day
            </button>
          </div>
        </div>
      </div>

      {/* Days of Week Header (Only for Month and Week views) */}
      {view !== 'day' && (
        <div className="grid grid-cols-7 border-b border-border shrink-0">
          {weekDays.map(day => (
            <div key={day} className="py-2 sm:py-3 text-center text-[10px] sm:text-xs font-semibold text-text-muted uppercase tracking-wider">
              <span className="hidden sm:inline">{day}</span>
              <span className="sm:hidden">{day.charAt(0)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Calendar Body */}
      {view === 'month' && renderMonthView()}
      {view === 'week' && renderWeekView()}
      {view === 'day' && renderDayView()}
      
    </div>
  );
}
