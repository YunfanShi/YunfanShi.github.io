export interface ReviewState {
  intervalDays: number;
  easeFactor: number;
  streak: number;
}

export interface ReviewSchedule extends ReviewState {
  nextReviewAt: string;
}

const DAY_MS = 86_400_000;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** A small, deterministic SM-2 variant. Quality is an integer from 0 (forgotten) to 5 (easy). */
export function scheduleReview(
  state: ReviewState,
  quality: number,
  reviewedAt: Date,
): ReviewSchedule {
  const normalizedQuality = clamp(Math.round(quality), 0, 5);
  const previousEase = clamp(state.easeFactor || 2.5, 1.3, 3);
  const nextEase = clamp(
    previousEase + (0.1 - (5 - normalizedQuality) * (0.08 + (5 - normalizedQuality) * 0.02)),
    1.3,
    3,
  );

  let streak = state.streak;
  let intervalDays: number;
  if (normalizedQuality < 3) {
    streak = 0;
    intervalDays = 1;
  } else {
    streak += 1;
    intervalDays = streak === 1
      ? 1
      : streak === 2
        ? 3
        : Math.max(4, Math.round(Math.max(1, state.intervalDays) * nextEase));
  }

  return {
    intervalDays,
    easeFactor: Math.round(nextEase * 100) / 100,
    streak,
    nextReviewAt: new Date(reviewedAt.getTime() + intervalDays * DAY_MS).toISOString(),
  };
}
