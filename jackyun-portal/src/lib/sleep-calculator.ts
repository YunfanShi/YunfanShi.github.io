export const SLEEP_CYCLE_MINUTES = 90;

export interface SleepPlan {
  cycles: number;
  sleepMinutes: number;
  bedtime: string;
  asleepAt: string;
}

function parseClock(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Time must use the HH:mm format.');

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error('Time is outside the valid clock range.');
  return hours * 60 + minutes;
}

function formatClock(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function calculateSleepPlans(
  wakeTime: string,
  sleepLatencyMinutes: number,
  cycleCounts: readonly number[] = [6, 5, 4],
): SleepPlan[] {
  const wakeMinutes = parseClock(wakeTime);
  const latency = Math.min(120, Math.max(0, Math.round(sleepLatencyMinutes)));

  return cycleCounts.map((cycles) => {
    const sleepMinutes = cycles * SLEEP_CYCLE_MINUTES;
    const asleepAtMinutes = wakeMinutes - sleepMinutes;
    const bedtimeMinutes = asleepAtMinutes - latency;

    return {
      cycles,
      sleepMinutes,
      bedtime: formatClock(bedtimeMinutes),
      asleepAt: formatClock(asleepAtMinutes),
    };
  });
}
