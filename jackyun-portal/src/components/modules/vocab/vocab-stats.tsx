interface VocabStatsProps {
  total: number;
  mastered: number;
  categories: Record<string, number>;
}

export default function VocabStats({ total, mastered, categories }: VocabStatsProps) {
  const pending = total - mastered;
  const masteryPct = total === 0 ? 0 : Math.round((mastered / total) * 100);

  return (
    <div className="mb-6 space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-4 text-center">
          <p className="text-2xl font-bold text-[#4285F4]">{total}</p>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">总词汇数</p>
        </div>
        <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-4 text-center">
          <p className="text-2xl font-bold text-[#34A853]">{mastered}</p>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">已掌握</p>
        </div>
        <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-4 text-center">
          <p className="text-2xl font-bold text-[#FBBC05]">{pending}</p>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">待复习</p>
        </div>
      </div>

      {/* Mastery progress bar */}
      {total > 0 && (
        <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-[var(--foreground)]">掌握进度</span>
            <span className="font-semibold text-[#34A853]">{masteryPct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--card-border)]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${masteryPct}%`, backgroundColor: '#34A853' }}
            />
          </div>
          {Object.keys(categories).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(categories).map(([cat, count]) => (
                <span
                  key={cat}
                  className="rounded-full border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-0.5 text-xs text-[var(--muted-foreground)]"
                >
                  {cat} · {count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
