import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { completionRate, elapsedSeconds, totalMinutes } from '../src/lib/learning/metrics.ts';
import { rankLearningCandidates } from '../src/lib/learning/prioritization.ts';
import { scheduleReview } from '../src/lib/learning/review-schedule.ts';
import { calendarDayDifference, dateKey } from '../src/lib/learning/timezone.ts';
import {
  completeReview,
  createEmptyScheduleState,
  parseTimetableImport,
  sessionsForDate,
  tasksForDate,
  timetableImportTemplate,
  withReviewCourseSelection,
} from '../src/lib/learning/schedule-control.ts';

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

test('timetable imports are validated without relying on private sample data', () => {
  const timetable = parseTimetableImport({
    version: 1,
    name: 'Test term',
    termStart: '2026-09-07',
    termEnd: '2026-12-20',
    courses: [{
      name: 'Example subject',
      color: '#3367d6',
      review: true,
      sessions: [{ day: 2, start: '08:00', end: '08:45', weeks: [1, 3] }],
    }],
  });
  assert.equal(timetable.courses[0].id, 'example-subject-1');
  assert.equal(sessionsForDate(timetable, new Date(2026, 8, 8, 12)).length, 1);
  assert.equal(sessionsForDate(timetable, new Date(2026, 8, 15, 12)).length, 0);
  assert.throws(() => parseTimetableImport({ name: 'Bad', courses: [{ name: 'X', sessions: [{ day: 8, start: '08:00', end: '08:45' }] }] }), /day/);
});

test('review subjects are saved only from the user selection', () => {
  const timetable = parseTimetableImport({
    version: 1,
    name: 'Selection test',
    courses: [
      { id: 'first', name: 'First', review: true, sessions: [{ day: 1, start: '08:00', end: '08:45' }] },
      { id: 'second', name: 'Second', review: false, sessions: [{ day: 2, start: '09:00', end: '09:45' }] },
    ],
  });
  const selected = withReviewCourseSelection(timetable, ['second']);
  assert.deepEqual(selected.courses.map((course) => [course.id, course.review]), [['first', false], ['second', true]]);
  assert.equal(timetableImportTemplate().courses[0].review, false);
});

test('course reviews, previews, holiday mode, and review follow-ups are deterministic', () => {
  const timetable = parseTimetableImport({
    version: 1,
    name: 'Test term',
    courses: [
      { id: 'math', name: 'Mathematics', review: true, sessions: [{ day: 2, start: '08:00', end: '08:45' }] },
      { id: 'art', name: 'Art', review: false, sessions: [{ day: 3, start: '10:00', end: '10:45' }] },
    ],
  });
  const state = { ...createEmptyScheduleState(), timetable };
  const tuesday = new Date(2026, 8, 15, 12);
  const tasks = tasksForDate(state, tuesday);
  assert.ok(tasks.some((task) => task.key === 'course-review:2026-09-15:math'));
  assert.ok(!tasks.some((task) => task.type === 'preview'));

  const previewEnabled = {
    ...state,
    settings: { ...state.settings, previewEnabled: true, previewPreferenceSet: true },
  };
  assert.ok(tasksForDate(previewEnabled, tuesday).some((task) => task.type === 'preview' && task.subjectId === 'art'));

  const review = tasks.find((task) => task.type === 'course-review')!;
  assert.throws(() => completeReview(state, review, 'partial', { studiedContent: '', issue: '', note: '' }, tuesday), /复习了什么/);
  assert.throws(() => completeReview(state, review, 'partial', { studiedContent: '三角函数', issue: '', note: '' }, tuesday), /发现的问题/);
  const completedAt = new Date('2026-09-15T11:23:00.000Z');
  const completed = completeReview(state, review, 'partial', {
    studiedContent: '三角函数恒等变换第 2–4 题',
    issue: '会计算，但还说不清公式原理。',
    note: '次日换一道题闭卷重测。',
  }, completedAt);
  assert.equal(completed.reviewProgress.math.nextReviewDate, '2026-09-16');
  assert.equal(completed.reviewProgress.math.intervalDays, 1);
  const wednesdayTasks = tasksForDate(completed, new Date(2026, 8, 16, 12));
  const followUp = wednesdayTasks.find((task) => task.type === 'interval-review' && task.subjectId === 'math');
  assert.ok(followUp);
  assert.equal(followUp.lastStatus, 'partial');
  assert.equal(followUp.lastReviewedAt, completedAt.toISOString());
  assert.equal(followUp.studiedContent, '三角函数恒等变换第 2–4 题');
  assert.equal(followUp.issue, '会计算，但还说不清公式原理。');
  assert.equal(followUp.note, '次日换一道题闭卷重测。');
  assert.match(followUp.title, /Mathematics · △/);
  assert.match(followUp.detail, /原因：Mathematics 上次记录为 △/);

  const holiday = { ...completed, settings: { ...completed.settings, mode: 'holiday' as const } };
  const holidayTasks = tasksForDate(holiday, new Date(2026, 8, 16, 12));
  assert.ok(holidayTasks.some((task) => task.type === 'interval-review'));
  assert.ok(!holidayTasks.some((task) => task.type === 'course-review' || task.type === 'preview' || task.type === 'weekly-review'));
});

test('green reviews wait several days while red reviews cannot complete the task', () => {
  const timetable = parseTimetableImport({
    version: 1,
    name: 'Review rules',
    courses: [{ id: 'physics', name: 'Physics', review: true, sessions: [{ day: 2, start: '08:00', end: '08:45' }] }],
  });
  const state = { ...createEmptyScheduleState(), timetable };
  const reviewedAt = new Date(2026, 8, 15, 12);
  const task = tasksForDate(state, reviewedAt).find((item) => item.type === 'course-review')!;

  const green = completeReview(state, task, 'stable', { studiedContent: 'Forces and moments', issue: 'Old resolved issue', note: '' }, reviewedAt);
  assert.equal(green.reviewProgress.physics.intervalDays, 3);
  assert.equal(green.reviewProgress.physics.nextReviewDate, '2026-09-18');
  assert.equal(green.reviewProgress.physics.lastIssue, '');
  assert.ok(green.completions[task.key]);

  const red = completeReview(state, task, 'unclear', { studiedContent: 'Forces and moments', issue: 'Cannot draw the force diagram.', note: 'Review the worked example.' }, reviewedAt);
  assert.equal(red.reviewProgress.physics.intervalDays, 0);
  assert.equal(red.reviewProgress.physics.nextReviewDate, '2026-09-15');
  assert.equal(red.completions[task.key], undefined);
  const stillDue = tasksForDate(red, reviewedAt).find((item) => item.key === task.key);
  assert.equal(stillDue?.lastStatus, 'unclear');
  assert.equal(stillDue?.issue, 'Cannot draw the force diagram.');
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
