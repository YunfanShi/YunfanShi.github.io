import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { completionRate, elapsedSeconds, totalMinutes } from '../src/lib/learning/metrics.ts';
import { rankLearningCandidates } from '../src/lib/learning/prioritization.ts';
import { scheduleReview } from '../src/lib/learning/review-schedule.ts';
import { calendarDayDifference, dateKey } from '../src/lib/learning/timezone.ts';

test('date keys respect the user time zone around UTC midnight', () => {
  const instant = new Date('2026-09-05T17:30:00.000Z');
  assert.equal(dateKey(instant, 'Asia/Shanghai'), '2026-09-06');
  assert.equal(dateKey(instant, 'America/New_York'), '2026-09-05');
  assert.equal(calendarDayDifference('2026-09-05', '2026-09-08'), 3);
});

test('learning metrics ignore invalid durations and calculate real elapsed time', () => {
  assert.equal(completionRate([{ completed: true }, { completed: false }, { completed: true }]), 67);
  assert.equal(totalMinutes([60, 120, -20, Number.NaN]), 3);
  assert.equal(elapsedSeconds('2026-09-05T10:00:00Z', '2026-09-05T10:03:09Z'), 189);
});

test('overdue and due review work is ranked above an ordinary high-priority task', () => {
  const ranked = rankLearningCandidates([
    { id: 'ordinary', priority: 5 },
    { id: 'review', priority: 3, reviewDue: true },
    { id: 'overdue', priority: 2, dueDate: '2026-09-03' },
  ], '2026-09-05');
  assert.deepEqual(ranked.map((entry) => entry.item.id), ['overdue', 'review', 'ordinary']);
  assert.match(ranked[0].reasons.join(' '), /逾期 2 天/);
});

test('review scheduling grows after success and resets after failure', () => {
  const reviewedAt = new Date('2026-09-05T00:00:00Z');
  const successful = scheduleReview({ intervalDays: 3, easeFactor: 2.5, streak: 2 }, 5, reviewedAt);
  assert.equal(successful.streak, 3);
  assert.equal(successful.intervalDays, 8);
  assert.equal(successful.nextReviewAt, '2026-09-13T00:00:00.000Z');

  const failed = scheduleReview(successful, 1, reviewedAt);
  assert.equal(failed.streak, 0);
  assert.equal(failed.intervalDays, 1);
});

test('learning-session migration enforces ownership and idempotency', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20260905115837_learning_session_links.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /focus_sessions_user_operation_key unique \(user_id, client_operation_id\)/);
  assert.match(sql, /study_tasks\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /focus_tasks\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /grant select, insert, update, delete on table public\.focus_sessions to authenticated/);
  assert.doesNotMatch(sql, /to anon/);
});

test('legacy Pomodoro bridge records linked sessions through the authenticated adapter', () => {
  const html = readFileSync(new URL('../public/Pomodoro.html', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../src/app/api/focus-sessions/route.ts', import.meta.url), 'utf8');
  assert.match(html, /jackyun_pomodoro_launch/);
  assert.match(html, /fetch\('\/api\/focus-sessions'/);
  assert.match(route, /\.eq\('user_id', user\.id\)/);
  assert.match(route, /onConflict: 'user_id,client_operation_id'/);
});

test('review queue migration is private, durable, and Data API-ready', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20260905121010_quiz_review_queue.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /create table public\.review_items/);
  assert.match(sql, /quiz_question_id uuid references public\.quiz_questions\(id\) on delete set null/);
  assert.match(sql, /alter table public\.review_items enable row level security/);
  assert.match(sql, /review_items\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /grant select, insert, update, delete on table public\.review_items to authenticated/);
  assert.doesNotMatch(sql, /review_items to anon/);
});

test('completed quizzes enqueue incorrect questions without duplicating existing items', () => {
  const action = readFileSync(new URL('../src/actions/quiz.ts', import.meta.url), 'utf8');
  assert.match(action, /\.eq\('is_correct', false\)/);
  assert.match(action, /existingIds = new Set/);
  assert.match(action, /supabase\.from\('review_items'\)\.insert\(newItems\)/);
});
