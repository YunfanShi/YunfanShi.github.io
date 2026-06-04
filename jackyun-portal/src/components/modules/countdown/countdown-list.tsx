'use client';

import CountdownCard from './countdown-card';

interface Countdown {
  id: string;
  title: string;
  target_date: string;
  description: string | null;
  color: string;
}

export default function CountdownList({ countdowns }: { countdowns: Countdown[] }) {
  if (countdowns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] py-16 text-center">
        <span className="material-icons-round text-5xl text-[var(--muted-foreground)]">timer_off</span>
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">还没有倒计时，点击上方按钮添加吧</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {countdowns.map((c) => (
        <CountdownCard key={c.id} countdown={c} />
      ))}
    </div>
  );
}
