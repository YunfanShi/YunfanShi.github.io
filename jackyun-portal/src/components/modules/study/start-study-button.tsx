'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { prepareStudyFocus } from '@/actions/study';

interface StartStudyButtonProps {
  taskId: string;
  durationMinutes: number;
}

export default function StartStudyButton({ taskId, durationMinutes }: StartStudyButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleStart() {
    setError(null);
    startTransition(async () => {
      try {
        const launch = await prepareStudyFocus(taskId, durationMinutes);
        localStorage.setItem('jackyun_pomodoro_launch', JSON.stringify({
          ...launch,
          autoStart: true,
          createdAt: new Date().toISOString(),
        }));
        router.push('/pomodoro');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '无法开始学习');
      }
    });
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleStart}
        disabled={isPending}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1a73e8] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#185abc] disabled:cursor-wait disabled:opacity-60"
      >
        <span className="material-icons-round text-base">play_arrow</span>
        {isPending ? '准备中' : '开始学习'}
      </button>
      {error && <span className="max-w-40 text-right text-[10px] text-[#d93025]">{error}</span>}
    </div>
  );
}
