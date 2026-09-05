'use client';

import { useState, useTransition } from 'react';
import { createQuickTask } from '@/actions/study';

export default function QuickTaskForm() {
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
        await createQuickTask({ title: nextTitle, dueDate: dueDate || null, estimatedMinutes: minutes });
        setTitle('');
        setDueDate('');
        setMinutes(25);
        setExpanded(false);
        setMessage('任务已加入今日中心');
      } catch (cause) {
        setMessage(cause instanceof Error ? cause.message : '添加失败');
      }
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onFocus={() => setExpanded(true)}
          maxLength={140}
          placeholder="快速添加一个学习任务…"
          className="min-w-0 flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[#1a73e8]"
        />
        <button disabled={isPending || !title.trim()} className="rounded-lg bg-[#1a73e8] px-4 text-sm font-semibold text-white disabled:opacity-50">{isPending ? '添加中' : '添加'}</button>
      </div>
      {expanded && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-xs text-[var(--muted-foreground)]">截止日期 <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="ml-1 rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1.5" /></label>
          <label className="text-xs text-[var(--muted-foreground)]">预计 <input type="number" min={10} max={360} step={5} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} className="ml-1 w-20 rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1.5" /> 分钟</label>
        </div>
      )}
      {message && <p className="mt-2 text-xs text-[var(--muted-foreground)]">{message}</p>}
    </form>
  );
}
