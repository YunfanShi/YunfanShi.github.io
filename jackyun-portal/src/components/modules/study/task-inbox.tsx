'use client';

import StartStudyButton from './start-study-button';
import { Button } from '@/components/ui/button';

interface InboxTask {
  id: string;
  title: string;
  completed: boolean;
  due_date: string | null;
  estimated_minutes: number;
}

export default function TaskInbox({ tasks, onToggle, onDelete }: { tasks: InboxTask[]; onToggle: (taskId: string, completed: boolean) => void; onDelete: (taskId: string) => void }) {
  if (!tasks.length) return null;

  return (
    <section className="mb-7 overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)]">
      <div className="border-b border-[var(--card-border)] px-5 py-4">
        <h2 className="font-semibold">快速任务收集箱</h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">从首页快速添加、尚未归入具体计划的任务。</p>
      </div>
      <ul className="divide-y divide-[var(--card-border)]">
        {tasks.map((task) => (
          <li key={task.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <Button type="button" variant="ghost" size="icon" onClick={() => onToggle(task.id, !task.completed)} aria-label={task.completed ? `标记 ${task.title} 未完成` : `完成 ${task.title}`} className="text-[var(--muted-foreground)] hover:text-[#1a73e8]">
              <span className="material-icons-round text-xl">{task.completed ? 'check_circle' : 'radio_button_unchecked'}</span>
            </Button>
            <div className="min-w-48 flex-1">
              <p className={task.completed ? 'text-sm text-[var(--muted-foreground)] line-through' : 'text-sm font-medium'}>{task.title}</p>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{task.due_date ? `${task.due_date} · ` : ''}预计 {task.estimated_minutes} 分钟</p>
            </div>
            {!task.completed && <StartStudyButton taskId={task.id} durationMinutes={task.estimated_minutes} />}
            <Button type="button" variant="ghost" size="icon" onClick={() => onDelete(task.id)} className="text-[var(--muted-foreground)] hover:text-[#d93025]" aria-label={`删除 ${task.title}`}>
              <span className="material-icons-round text-lg">delete_outline</span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
