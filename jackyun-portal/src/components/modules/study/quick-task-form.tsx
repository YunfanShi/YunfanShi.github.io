'use client';

import { useState, useTransition } from 'react';
import { createQuickTask } from '@/actions/study';
import { useAuthMode } from '@/components/auth/auth-mode-provider';
import { readOfflineSnapshot, runOfflineMutation } from '@/lib/offline/workspace';
import type { OfflineTaskSnapshot } from './offline-task-workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function QuickTaskForm() {
  const { userId } = useAuthMode();
  const [title, setTitle] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [minutes, setMinutes] = useState(25);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) return;
    setMessage(null);
    startTransition(async () => {
      try {
        if (userId) {
          const cached = await readOfflineSnapshot<OfflineTaskSnapshot>(userId, 'tasks');
          const operationId=crypto.randomUUID();
          const snapshot=cached?{scope:'tasks' as const,value:{...cached,inboxTasks:[{id:operationId,title:nextTitle,completed:false,due_date:dueDate||null,estimated_minutes:minutes},...cached.inboxTasks]}}:undefined;
          const result = await runOfflineMutation(userId, 'task.create', { title: nextTitle, dueDate: dueDate || null, estimatedMinutes: minutes },{operationId,snapshot});
          setMessage(result === 'queued' ? '已记录，联网后同步' : '任务已加入今日中心');
        } else {
          await createQuickTask({ title: nextTitle, dueDate: dueDate || null, estimatedMinutes: minutes });
          setMessage('任务已加入今日中心');
        }
        setTitle('');
        setDueDate('');
        setMinutes(25);
        setExpanded(false);
      } catch (cause) {
        setMessage(cause instanceof Error ? cause.message : '添加失败');
      }
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onFocus={() => setExpanded(true)}
          maxLength={140}
          placeholder="快速添加一个学习任务…"
          className="min-w-0 flex-1 rounded-lg"
        />
        <Button type="submit" busy={isPending} disabled={!title.trim()} className="rounded-lg text-sm">{isPending ? '添加中' : '添加'}</Button>
      </div>
      {expanded && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-xs text-[var(--muted-foreground)]">截止日期 <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="ml-1 inline-flex w-auto rounded-md px-2 py-1.5" /></label>
          <label className="text-xs text-[var(--muted-foreground)]">预计 <Input type="number" min={10} max={360} step={5} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} className="ml-1 inline-flex w-20 rounded-md px-2 py-1.5" /> 分钟</label>
        </div>
      )}
      {message && <p className="mt-2 text-xs text-[var(--muted-foreground)]">{message}</p>}
    </form>
  );
}
