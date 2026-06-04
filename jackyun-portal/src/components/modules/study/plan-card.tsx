'use client';

import { useState, useTransition, useRef } from 'react';
import { toggleTask, deleteTask, createTask, deletePlan } from '@/actions/study';

interface Task {
  id: string;
  title: string;
  completed: boolean;
  due_date: string | null;
}

interface StudyPlanWithTasks {
  id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  tasks: Task[];
}

interface PlanCardProps {
  plan: StudyPlanWithTasks;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function PlanCard({ plan }: PlanCardProps) {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isPending, startTransition] = useTransition();
  const [addingTask, setAddingTask] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const completedCount = plan.tasks.filter((t) => t.completed).length;
  const totalCount = plan.tasks.length;
  const progressPct = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  const progressColor =
    progressPct === 100 ? '#34A853' : progressPct >= 50 ? '#FBBC05' : '#4285F4';

  function handleToggle(taskId: string) {
    startTransition(() => toggleTask(taskId));
  }

  function handleDeleteTask(taskId: string) {
    startTransition(() => deleteTask(taskId));
  }

  function handleDeletePlan() {
    if (!confirm(`确定删除计划「${plan.title}」及其所有任务吗？`)) return;
    startTransition(() => deletePlan(plan.id));
  }

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    const title = newTaskTitle.trim();
    if (!title) return;
    startTransition(async () => {
      await createTask(plan.id, title);
      setNewTaskTitle('');
      setAddingTask(false);
    });
  }

  return (
    <div className="flex flex-col rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
      {/* Top accent bar */}
      <div className="h-1 w-full" style={{ backgroundColor: progressColor }} />

      <div className="flex flex-col gap-4 p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-[var(--foreground)] truncate">
                {plan.title}
              </h3>
              {/* Task count badge */}
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: progressColor }}
              >
                {completedCount}/{totalCount}
              </span>
            </div>
            {plan.description && (
              <p className="mt-1 text-sm text-[var(--muted-foreground)] line-clamp-2">
                {plan.description}
              </p>
            )}
          </div>
          {/* Delete plan */}
          <button
            onClick={handleDeletePlan}
            disabled={isPending}
            className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[#EA433520] hover:text-[#EA4335] transition-colors disabled:opacity-40"
            title="删除计划"
          >
            <span className="material-icons-round text-base">delete_outline</span>
          </button>
        </div>

        {/* Dates */}
        {(plan.start_date || plan.end_date) && (
          <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
            <span className="material-icons-round text-sm">calendar_today</span>
            {formatDate(plan.start_date)}
            {plan.start_date && plan.end_date && (
              <span className="material-icons-round text-sm">arrow_forward</span>
            )}
            {formatDate(plan.end_date)}
          </div>
        )}

        {/* Progress bar */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
            <span>进度</span>
            <span style={{ color: progressColor }} className="font-medium">
              {progressPct}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--card-border)]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, backgroundColor: progressColor }}
            />
          </div>
        </div>

        {/* Task list */}
        {plan.tasks.length > 0 && (
          <ul className="space-y-1.5">
            {plan.tasks.map((task) => (
              <li
                key={task.id}
                className="group flex items-center gap-2 rounded-[8px] px-2 py-1.5 hover:bg-[var(--background)] transition-colors"
              >
                <button
                  onClick={() => handleToggle(task.id)}
                  disabled={isPending}
                  className="shrink-0 text-[var(--muted-foreground)] hover:text-[#4285F4] transition-colors disabled:opacity-40"
                >
                  <span className="material-icons-round text-[18px]">
                    {task.completed ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                </button>
                <span
                  className={`flex-1 text-sm ${
                    task.completed
                      ? 'line-through text-[var(--muted-foreground)]'
                      : 'text-[var(--foreground)]'
                  }`}
                >
                  {task.title}
                </span>
                <button
                  onClick={() => handleDeleteTask(task.id)}
                  disabled={isPending}
                  className="shrink-0 opacity-0 group-hover:opacity-100 flex h-5 w-5 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:text-[#EA4335] transition-all disabled:opacity-40"
                  title="删除任务"
                >
                  <span className="material-icons-round text-sm">close</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Add task */}
        {addingTask ? (
          <form onSubmit={handleAddTask} className="flex items-center gap-2">
            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="输入任务名称…"
              className="flex-1 rounded-[8px] border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
            />
            <button
              type="submit"
              disabled={isPending || !newTaskTitle.trim()}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4285F4] text-white hover:bg-[#3574e0] disabled:opacity-50 transition-colors"
            >
              <span className="material-icons-round text-base">check</span>
            </button>
            <button
              type="button"
              onClick={() => { setAddingTask(false); setNewTaskTitle(''); }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--card-border)] transition-colors"
            >
              <span className="material-icons-round text-base">close</span>
            </button>
          </form>
        ) : (
          <button
            onClick={() => setAddingTask(true)}
            className="flex w-full items-center gap-2 rounded-[8px] border border-dashed border-[var(--card-border)] px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:border-[#4285F4] hover:text-[#4285F4] transition-colors"
          >
            <span className="material-icons-round text-base">add</span>
            添加任务
          </button>
        )}
      </div>
    </div>
  );
}
