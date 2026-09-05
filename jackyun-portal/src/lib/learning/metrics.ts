export function completionRate(items: ReadonlyArray<{ completed: boolean }>): number {
  if (items.length === 0) return 0;
  const completed = items.reduce((count, item) => count + Number(item.completed), 0);
  return Math.round((completed / items.length) * 100);
}

export function totalMinutes(durationsInSeconds: ReadonlyArray<number>): number {
  const seconds = durationsInSeconds.reduce(
    (total, duration) => total + (Number.isFinite(duration) && duration > 0 ? duration : 0),
    0,
  );
  return Math.round(seconds / 60);
}

export function elapsedSeconds(startedAt: string, completedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.floor((end - start) / 1000);
}
