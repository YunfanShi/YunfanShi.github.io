'use client';

import { useState } from 'react';
import PlanList from './plan-list';
import TaskInbox from './task-inbox';
import { useOfflineSnapshot } from '@/hooks/use-offline-snapshot';
import { runOfflineMutation, saveOfflineSnapshot } from '@/lib/offline/workspace';
import type { StudyPlanWithTasks } from '@/types';

export interface OfflineInboxTask {
  id: string;
  title: string;
  completed: boolean;
  due_date: string | null;
  estimated_minutes: number;
}

export interface OfflineTaskSnapshot {
  plans: StudyPlanWithTasks[];
  inboxTasks: OfflineInboxTask[];
}

export default function OfflineTaskWorkspace({ userId, initial }: { userId: string; initial: OfflineTaskSnapshot }) {
  const [snapshot, setSnapshot] = useOfflineSnapshot(userId, 'tasks', initial);
  const [message, setMessage] = useState<string | null>(null);

  async function commit(next: OfflineTaskSnapshot, kind: string, payload: Record<string, unknown>) {
    setSnapshot(next);
    await saveOfflineSnapshot(userId, 'tasks', next);
    try {
      const result = await runOfflineMutation(userId, kind, payload);
      setMessage(result === 'queued' ? '已记录，联网后同步' : null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    }
  }

  function toggleTask(taskId: string, completed: boolean) {
    const next = {
      inboxTasks: snapshot.inboxTasks.map((task) => task.id === taskId ? { ...task, completed } : task),
      plans: snapshot.plans.map((plan) => ({ ...plan, tasks: plan.tasks.map((task) => task.id === taskId ? { ...task, completed } : task) })),
    };
    void commit(next, 'task.toggle', { taskId, completed });
  }

  function deleteTask(taskId: string) {
    const next = {
      inboxTasks: snapshot.inboxTasks.filter((task) => task.id !== taskId),
      plans: snapshot.plans.map((plan) => ({ ...plan, tasks: plan.tasks.filter((task) => task.id !== taskId) })),
    };
    void commit(next, 'task.delete', { taskId });
  }

  function createTask(planId: string, title: string) {
    const now = new Date().toISOString();
    const task = { id: `offline-${crypto.randomUUID()}`, user_id: userId, plan_id: planId, title, completed: false, due_date: null, subject: null, estimated_minutes: 25, priority: 2, scheduled_at: null, completed_at: null, created_at: now, updated_at: now };
    const next = { ...snapshot, plans: snapshot.plans.map((plan) => plan.id === planId ? { ...plan, tasks: [...plan.tasks, task] } : plan) };
    void commit(next, 'task.create', { planId, title, estimatedMinutes: 25 });
  }

  function deletePlan(planId: string) {
    void commit({ ...snapshot, plans: snapshot.plans.filter((plan) => plan.id !== planId) }, 'plan.delete', { planId });
  }

  return <>
    {message && <p role="status" className="mb-4 rounded-xl bg-[#fff7e0] px-4 py-3 text-sm font-medium text-[#8a4b00] dark:bg-[#5f3b00]/30 dark:text-[#fdd663]">{message}</p>}
    <TaskInbox tasks={snapshot.inboxTasks} onToggle={toggleTask} onDelete={deleteTask} />
    <PlanList plans={snapshot.plans} onToggleTask={toggleTask} onDeleteTask={deleteTask} onCreateTask={createTask} onDeletePlan={deletePlan} />
  </>;
}
