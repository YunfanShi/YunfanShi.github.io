import { scheduleReview } from './review-schedule.ts';
import type { ReviewItem, ReviewSnapshot } from '../../types/review.ts';

export function advanceReviewSnapshot(snapshot: ReviewSnapshot, item: ReviewItem, quality: number | null, queued: boolean, at = new Date()): ReviewSnapshot {
  const plan = quality === null ? null : scheduleReview({ intervalDays: Number(item.interval_days), easeFactor: Number(item.ease_factor), streak: Number(item.streak) }, quality, at);
  const mastered = Boolean(plan && plan.streak >= 5 && plan.intervalDays >= 30);
  return { ...snapshot, dueItems: snapshot.dueItems.filter(x => x.id !== item.id),
    dueCount: typeof snapshot.dueCount === 'number' ? Math.max(0, snapshot.dueCount - 1) : null,
    activeCount: Math.max(0, snapshot.activeCount - (quality === null || mastered ? 1 : 0)),
    masteredCount: snapshot.masteredCount + (mastered ? 1 : 0),
    pendingLocal: snapshot.pendingLocal || queued,
    // Every completed batch needs a fresh server read, even after online writes.
    verifiedAt: undefined,
  };
}

export function reviewCompletion(snapshot: ReviewSnapshot): 'more' | 'verify' | 'complete' {
  if (snapshot.dueItems.length || (snapshot.dueCount ?? 0) > 0) return 'more';
  return snapshot.dueCount === 0 && snapshot.verifiedAt && !snapshot.pendingLocal ? 'complete' : 'verify';
}
