'use client';

import { useState, useEffect } from 'react';
import { saveRelaxState } from '@/actions/relax';

interface Props {
  initialCount: number;
  initialDate: string | null;
  theme: 'default' | 'dragon' | 'eri';
}

const GOAL = 8;

export default function HydrationTracker({ initialCount, initialDate, theme }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [count, setCount] = useState(initialDate === today ? initialCount : 0);

  useEffect(() => {
    if (initialDate !== today) {
      setCount(0);
    }
  }, [initialDate, today]);

  const handleDrop = (idx: number) => {
    const newCount = idx < count ? idx : idx + 1;
    setCount(newCount);
    saveRelaxState({ water_count: newCount, water_date: today });
  };

  const isDragon = theme === 'dragon';
  const isEri = theme === 'eri';

  const filledColor = isDragon ? '#38bdf8' : isEri ? '#ec4899' : 'var(--primary)';
  const emptyColor = isDragon ? '#334155' : isEri ? '#fbcfe8' : 'var(--muted)';
  const textColor = isDragon ? '#94a3b8' : isEri ? '#9d174d' : 'var(--muted-foreground)';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: textColor }}>
          今日饮水 {count}/{GOAL} 杯
        </span>
        {count >= GOAL && (
          <span className="text-xs" style={{ color: filledColor }}>
            ✓ 完成！
          </span>
        )}
      </div>
      <div className="flex gap-1">
        {Array.from({ length: GOAL }).map((_, i) => (
          <button
            key={i}
            onClick={() => handleDrop(i)}
            title={`${i + 1} 杯`}
            className="text-xl transition-transform hover:scale-110"
            style={{ filter: i < count ? 'none' : 'grayscale(1) opacity(0.3)' }}
          >
            💧
          </button>
        ))}
      </div>
      {/* Progress bar */}
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: emptyColor }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${(count / GOAL) * 100}%`, background: filledColor }}
        />
      </div>
    </div>
  );
}
