'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { scheduleReview } from '@/lib/learning/review-schedule';
import type { ReviewStatus } from '@/types/review';

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  return { supabase, user };
}

export async function recordReviewAttempt(
  reviewItemId: string,
  quality: number,
  answer: string,
  durationSeconds?: number,
) {
  const { supabase, user } = await currentUser();
  const normalizedQuality = Math.min(5, Math.max(0, Math.round(quality)));
  const normalizedDuration = durationSeconds == null
    ? null
    : Math.min(21_600, Math.max(0, Math.round(durationSeconds)));
  const { data: item, error: itemError } = await supabase
    .from('review_items')
    .select('id, interval_days, ease_factor, streak')
    .eq('id', reviewItemId)
    .eq('user_id', user.id)
    .single();
  if (itemError || !item) throw new Error('Review item not found');

  const attemptedAt = new Date();
  const schedule = scheduleReview({
    intervalDays: Number(item.interval_days),
    easeFactor: Number(item.ease_factor),
    streak: Number(item.streak),
  }, normalizedQuality, attemptedAt);

  const { error: attemptError } = await supabase.from('review_attempts').insert({
    user_id: user.id,
    review_item_id: item.id,
    answer: answer.trim().slice(0, 10_000) || null,
    is_correct: normalizedQuality >= 3,
    quality: normalizedQuality,
    duration_seconds: normalizedDuration,
    attempted_at: attemptedAt.toISOString(),
  });
  if (attemptError) throw new Error(attemptError.message);

  const status: ReviewStatus = schedule.streak >= 5 && schedule.intervalDays >= 30 ? 'mastered' : 'active';
  const { error: updateError } = await supabase
    .from('review_items')
    .update({
      interval_days: schedule.intervalDays,
      ease_factor: schedule.easeFactor,
      streak: schedule.streak,
      next_review_at: schedule.nextReviewAt,
      status,
      last_user_answer: answer.trim().slice(0, 10_000) || null,
      updated_at: attemptedAt.toISOString(),
    })
    .eq('id', item.id)
    .eq('user_id', user.id);
  if (updateError) throw new Error(updateError.message);

  revalidatePath('/review');
  revalidatePath('/dashboard');
  return { nextReviewAt: schedule.nextReviewAt, status };
}

export async function setReviewStatus(reviewItemId: string, status: ReviewStatus) {
  const { supabase, user } = await currentUser();
  if (!['active', 'mastered', 'archived'].includes(status)) throw new Error('Invalid review status');
  const { error } = await supabase
    .from('review_items')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', reviewItemId)
    .eq('user_id', user.id);
  if (error) throw new Error(error.message);
  revalidatePath('/review');
  revalidatePath('/dashboard');
}
