'use client';

import { useEffect, useState, useTransition } from 'react';
import { deleteCountdown } from '@/actions/countdown';

interface Countdown {
  id: string;
  title: string;
  target_date: string;
  description: string | null;
  color: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

function calcTimeLeft(target_date: string): TimeLeft {
  const diff = new Date(target_date).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, expired: false };
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export default function CountdownCard({ countdown }: { countdown: Countdown }) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calcTimeLeft(countdown.target_date));
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft(calcTimeLeft(countdown.target_date));
    }, 1000);
    return () => clearInterval(id);
  }, [countdown.target_date]);

  function handleDelete() {
    startTransition(async () => {
      await deleteCountdown(countdown.id);
    });
  }

  const { color } = countdown;
  const bgAlpha = `${color}22`;

  const unitBox = (value: number, label: string) => (
    <div
      key={label}
      className="flex flex-col items-center rounded-[10px] px-3 py-2 min-w-[56px]"
      style={{ backgroundColor: bgAlpha, border: `1px solid ${color}44` }}
    >
      <span className="text-2xl font-bold leading-none tabular-nums" style={{ color }}>
        {pad(value)}
      </span>
      <span className="mt-1 text-[10px] font-medium" style={{ color }}>
        {label}
      </span>
    </div>
  );

  return (
    <div
      className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-4 flex flex-col gap-3"
      style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-[var(--foreground)]">{countdown.title}</h3>
          {countdown.description && (
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)] line-clamp-2">{countdown.description}</p>
          )}
        </div>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="shrink-0 rounded-[6px] p-1 text-[var(--muted-foreground)] hover:bg-[#EA433515] hover:text-[#EA4335] transition-colors disabled:opacity-40"
          title="删除"
        >
          <span className="material-icons-round text-base">delete_outline</span>
        </button>
      </div>

      {/* Timer */}
      {timeLeft.expired ? (
        <div
          className="flex items-center justify-center gap-1.5 rounded-[10px] py-3 text-sm font-medium"
          style={{ backgroundColor: bgAlpha, color }}
        >
          <span className="material-icons-round text-base">event_busy</span>
          已过期
        </div>
      ) : (
        <div className="flex items-stretch gap-1.5">
          {unitBox(timeLeft.days, '天')}
          {unitBox(timeLeft.hours, '时')}
          {unitBox(timeLeft.minutes, '分')}
          {unitBox(timeLeft.seconds, '秒')}
        </div>
      )}

      {/* Target date */}
      <p className="text-[11px] text-[var(--muted-foreground)]">
        目标：{new Date(countdown.target_date).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </p>
    </div>
  );
}
