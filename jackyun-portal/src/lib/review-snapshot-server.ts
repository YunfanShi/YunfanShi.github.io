import type { createClient } from '@/lib/supabase/server';
import type { ReviewItem, ReviewSnapshot } from '@/types/review';

/** Callers must authenticate first. Counts and each batch use the same cutoff. */
export async function fetchReviewSnapshot(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, now = new Date().toISOString()): Promise<ReviewSnapshot> {
  const [batch, due, active, mastered] = await Promise.all([
    supabase.from('review_items').select('*').eq('user_id', userId).eq('status', 'active').lte('next_review_at', now).order('next_review_at').order('id').limit(50),
    supabase.from('review_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'active').lte('next_review_at', now),
    supabase.from('review_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'active'),
    supabase.from('review_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'mastered'),
  ]);
  const error = batch.error ?? due.error ?? active.error ?? mastered.error;
  if (error || due.count == null || active.count == null || mastered.count == null) throw new Error('复习队列读取失败，请重试。');
  return { dueItems: (batch.data ?? []) as ReviewItem[], dueCount: due.count, activeCount: active.count, masteredCount: mastered.count, pendingLocal: false, verifiedAt: now };
}
