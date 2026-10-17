import { getVerifiedUser } from '@/lib/supabase/verified-user';
import { fetchReviewSnapshot } from '@/lib/review-snapshot-server';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getReaderBootstrap } from '@/actions/reader';
import { scheduleReview } from '@/lib/learning/review-schedule';
import type { ReviewStatus } from '@/types/review';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await getVerifiedUser(supabase);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const now = new Date().toISOString();
  const [plans, inbox, review, reading] = await Promise.all([
    supabase.from('study_plans').select('id, user_id, title, description, start_date, end_date, created_at, updated_at, tasks:study_tasks(id, user_id, plan_id, title, completed, due_date, subject, estimated_minutes, priority, scheduled_at, completed_at, created_at, updated_at)').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('study_tasks').select('id, title, completed, due_date, estimated_minutes').eq('user_id', user.id).is('plan_id', null).order('created_at', { ascending: false }),
    fetchReviewSnapshot(supabase, user.id, now),
    getReaderBootstrap(),
  ]);
  const error = plans.error ?? inbox.error;
  if (error) return NextResponse.json({ error: 'Unable to build offline snapshot' }, { status: 500 });
  return NextResponse.json({
    tasks: { plans: plans.data ?? [], inboxTasks: inbox.data ?? [] },
    review,
    reading,
    cachedAt: new Date().toISOString(),
  });
}

function stringValue(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await getVerifiedUser(supabase);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null) as { kind?: string; payload?: Record<string, unknown> } | null;
  if (!body?.kind || !body.payload) return NextResponse.json({ error: 'Invalid mutation' }, { status: 400 });
  const payload = body.payload;
  const now = new Date().toISOString();

  if (body.kind === 'task.toggle') {
    const taskId = stringValue(payload.taskId, 80);
    const completed = Boolean(payload.completed);
    const { error } = await supabase.from('study_tasks').update({ completed, completed_at: completed ? now : null, updated_at: now }).eq('id', taskId).eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (body.kind === 'task.delete') {
    const { error } = await supabase.from('study_tasks').delete().eq('id', stringValue(payload.taskId, 80)).eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (body.kind === 'task.create') {
    const title = stringValue(payload.title, 140);
    if (!title) return NextResponse.json({ error: 'Task title required' }, { status: 400 });
    const minutes = Math.min(360, Math.max(10, Number(payload.estimatedMinutes) || 25));
    const { error } = await supabase.from('study_tasks').insert({ user_id: user.id, plan_id: stringValue(payload.planId, 80) || null, title, completed: false, due_date: stringValue(payload.dueDate, 10) || null, estimated_minutes: minutes });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (body.kind === 'plan.delete') {
    const planId = stringValue(payload.planId, 80);
    const taskDelete = await supabase.from('study_tasks').delete().eq('plan_id', planId).eq('user_id', user.id);
    if (taskDelete.error) return NextResponse.json({ error: taskDelete.error.message }, { status: 500 });
    const { error } = await supabase.from('study_plans').delete().eq('id', planId).eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (body.kind === 'review.archive') {
    const { error } = await supabase.from('review_items').update({ status: 'archived', updated_at: now }).eq('id', stringValue(payload.reviewItemId, 80)).eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (body.kind === 'review.attempt') {
    const reviewItemId = stringValue(payload.reviewItemId, 80);
    const quality = Math.min(5, Math.max(0, Math.round(Number(payload.quality) || 0)));
    const answer = stringValue(payload.answer, 10_000);
    const durationSeconds = Math.min(21_600, Math.max(0, Math.round(Number(payload.durationSeconds) || 0)));
    const { data: item, error: itemError } = await supabase.from('review_items').select('id, interval_days, ease_factor, streak').eq('id', reviewItemId).eq('user_id', user.id).single();
    if (itemError || !item) return NextResponse.json({ error: 'Review item not found' }, { status: 404 });
    const attemptedAt = new Date();
    const schedule = scheduleReview({ intervalDays: Number(item.interval_days), easeFactor: Number(item.ease_factor), streak: Number(item.streak) }, quality, attemptedAt);
    const attempt = await supabase.from('review_attempts').insert({ user_id: user.id, review_item_id: item.id, answer: answer || null, is_correct: quality >= 3, quality, duration_seconds: durationSeconds, attempted_at: attemptedAt.toISOString() });
    if (attempt.error) return NextResponse.json({ error: attempt.error.message }, { status: 500 });
    const status: ReviewStatus = schedule.streak >= 5 && schedule.intervalDays >= 30 ? 'mastered' : 'active';
    const update = await supabase.from('review_items').update({ interval_days: schedule.intervalDays, ease_factor: schedule.easeFactor, streak: schedule.streak, next_review_at: schedule.nextReviewAt, status, last_user_answer: answer || null, updated_at: attemptedAt.toISOString() }).eq('id', item.id).eq('user_id', user.id);
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: 'Unsupported mutation' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
