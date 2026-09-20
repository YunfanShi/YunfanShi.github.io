import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { completionRate, elapsedSeconds, totalMinutes } from '../src/lib/learning/metrics.ts';
import { rankLearningCandidates } from '../src/lib/learning/prioritization.ts';
import { scheduleReview } from '../src/lib/learning/review-schedule.ts';
import { calendarDayDifference, dateKey } from '../src/lib/learning/timezone.ts';
import {
  completeReview,
  completeCueReviews,
  completeLearningSession,
  createEmptyScheduleState,
  createIeltsWeekTasks,
  deriveLearningStatus,
  LEARNING_TASK_PRESETS,
  mergeLearningCatalog,
  migrateIeltsWeekTaskDates,
  parseCueBatchImport,
  parseLearningCatalogImport,
  parseLearningUnitOutline,
  parseTimetableImport,
  postponeLearningTask,
  rescheduleManualTask,
  rollOverManualTasks,
  sessionsForDate,
  tasksForDate,
  timetableImportTemplate,
  updateSubjectMaterialProgress,
  withReviewCourseSelection,
} from '../src/lib/learning/schedule-control.ts';

test('task presets cover audits, self-study, cue review, and IELTS without fixing weekdays', () => {
  const ids = new Set(LEARNING_TASK_PRESETS.map((preset) => preset.id));
  for (const id of ['self-study', 'friday-audit', 'weekend-retrieval', 'unit-review', 'cumulative-review', 'ielts-listening', 'ielts-weekly-review']) {
    assert.ok(ids.has(id), `missing preset ${id}`);
  }
  assert.ok(LEARNING_TASK_PRESETS.filter((preset) => preset.group === 'IELTS').every((preset) => preset.durationMinutes <= 60));
});

test('IELTS weekly tasks are spread across weekdays and legacy Monday-only weeks are repaired', () => {
  const tasks = createIeltsWeekTasks('2026-09-14');
  assert.deepEqual(tasks.map((task) => task.date), [
    '2026-09-14',
    '2026-09-15',
    '2026-09-16',
    '2026-09-17',
    '2026-09-18',
  ]);

  const legacy = tasks.map((task) => ({ ...task, date: '2026-09-14' }));
  assert.deepEqual(migrateIeltsWeekTaskDates(legacy).map((task) => task.date), tasks.map((task) => task.date));
});

test('cancelled manual tasks stay out of the due task list', () => {
  const state = createEmptyScheduleState();
  state.manualTasks = [{ id: 'manual-1', title: 'IELTS Reading', type: 'practice', date: '2026-09-14', durationMinutes: 60 }];
  state.cancellations['manual-1'] = { cancelledAt: '2026-09-14T08:00:00.000Z' };
  assert.equal(tasksForDate(state, new Date(2026, 8, 14, 12)).length, 0);
});

test('manual tasks can be rescheduled to tomorrow without retaining a stale start time', () => {
  const tasks = [{ id: 'manual-1', title: 'IELTS Reading', type: 'practice' as const, date: '2026-09-14', start: '18:00', durationMinutes: 60 }];
  const postponed = rescheduleManualTask(tasks, 'manual-1', '2026-09-15');
  assert.equal(postponed[0].date, '2026-09-15');
  assert.equal(postponed[0].start, undefined);
  assert.equal(tasks[0].date, '2026-09-14');
});

test('overdue manual tasks roll into today and merge with an equivalent task already due today', () => {
  const state = createEmptyScheduleState();
  state.manualTasks = [
    { id: 'old-review', title: '常规复习', type: 'unit-review', date: '2026-09-13', start: '18:00', durationMinutes: 45, presetId: 'unit-review' },
    { id: 'today-review', title: '常规复习', type: 'unit-review', date: '2026-09-14', start: '19:00', durationMinutes: 45, presetId: 'unit-review' },
    { id: 'physics-review', title: '常规复习', type: 'unit-review', date: '2026-09-13', durationMinutes: 45, presetId: 'unit-review', subject: 'Physics' },
    { id: 'old-reading', title: 'IELTS Reading', type: 'practice', date: '2026-09-12', start: '17:00', durationMinutes: 60, presetId: 'ielts-reading' },
  ];

  const rolled = rollOverManualTasks(state, '2026-09-14', '2026-09-14T00:00:00.000Z');
  assert.equal(rolled.manualTasks.find((task) => task.id === 'old-reading')?.date, '2026-09-14');
  assert.equal(rolled.manualTasks.find((task) => task.id === 'old-reading')?.start, undefined);
  assert.equal(rolled.manualTasks.find((task) => task.id === 'old-reading')?.overdueSince, '2026-09-12');
  assert.equal(rolled.manualTasks.find((task) => task.id === 'today-review')?.start, '19:00');
  assert.equal(rolled.manualTasks.find((task) => task.id === 'today-review')?.overdueSince, '2026-09-13');
  assert.equal(rolled.manualTasks.find((task) => task.id === 'physics-review')?.date, '2026-09-14');
  assert.deepEqual(rolled.cancellations['old-review'], {
    cancelledAt: '2026-09-14T00:00:00.000Z',
    reason: 'merged',
    mergedInto: 'today-review',
  });
  assert.deepEqual(tasksForDate(rolled, new Date(2026, 8, 14, 12)).map((task) => task.key).sort(), ['old-reading', 'physics-review', 'today-review']);
  assert.ok(tasksForDate(rolled, new Date(2026, 8, 14, 12)).every((task) => task.overdue));
});

test('generated tasks can be postponed and keep their context', () => {
  const state = createEmptyScheduleState();
  const task = { key: 'course-review:2026-09-14:physics', title: '复习 Physics', detail: '闭卷检索', type: 'course-review' as const, date: '2026-09-14', durationMinutes: 25, subjectId: 'physics', subjectName: 'Physics' };
  const postponed = postponeLearningTask(state, task, '2026-09-15', '2026-09-14T10:00:00.000Z');
  assert.equal(postponed.cancellations[task.key]?.reason, 'postponed');
  assert.equal(postponed.manualTasks[0].date, '2026-09-15');
  assert.equal(postponed.manualTasks[0].subjectId, 'physics');
  assert.equal(tasksForDate(postponed, new Date(2026, 8, 15, 12))[0]?.title, '复习 Physics');
});

test('cues keep independent review states and due dates', () => {
  const createdAt = '2026-09-15T08:00:00.000Z';
  const state = {
    ...createEmptyScheduleState(),
    cues: [
      { id: 'cue-def', subjectId: 'physics', subjectName: 'Physics', unit: 'Mechanics', subsection: 'Motion', prompt: 'Define acceleration.', type: 'definition' as const, markingPoints: ['change in velocity', 'per unit time'], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt, updatedAt: createdAt },
      { id: 'cue-explain', subjectId: 'physics', subjectName: 'Physics', unit: 'Mechanics', subsection: 'Motion', prompt: 'Explain why the object slows down.', type: 'explain' as const, markingPoints: ['force decreases', 'acceleration decreases'], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt, updatedAt: createdAt },
    ],
  };
  const reviewedAt = new Date(2026, 8, 19, 12);
  const reviewed = completeCueReviews(state, [
    { cueId: 'cue-def', status: 'stable' },
    { cueId: 'cue-explain', status: 'partial', note: 'Missing the middle marking point.' },
  ], reviewedAt, 'weekly-review');
  assert.equal(reviewed.cues.find((cue) => cue.id === 'cue-def')?.status, 'stable');
  assert.equal(reviewed.cues.find((cue) => cue.id === 'cue-def')?.nextReviewDate, '2026-09-22');
  assert.equal(reviewed.cues.find((cue) => cue.id === 'cue-explain')?.status, 'partial');
  assert.equal(reviewed.cues.find((cue) => cue.id === 'cue-explain')?.nextReviewDate, '2026-09-20');
  assert.equal(reviewed.cueReviews.length, 2);
  const due = tasksForDate(reviewed, new Date(2026, 8, 20, 12));
  assert.deepEqual(due.find((task) => task.type === 'cue-review')?.cueIds, ['cue-explain']);
});

test('due Cue reviews are generated as detailed tasks per subsection', () => {
  const createdAt = '2026-09-19T08:00:00.000Z';
  const state = createEmptyScheduleState();
  state.cues = [
    { id: 'motion', subjectId: 'physics', subjectName: 'Physics', unit: 'Mechanics', subsection: 'Motion', prompt: 'Define acceleration.', type: 'definition', markingPoints: ['change in velocity', 'per unit time'], intervalDays: 1, easeFactor: 2.5, streak: 1, nextReviewDate: '2026-09-20', createdAt, updatedAt: createdAt },
    { id: 'forces', subjectId: 'physics', subjectName: 'Physics', unit: 'Mechanics', subsection: 'Forces', prompt: 'Explain terminal velocity.', type: 'explain', markingPoints: ['drag increases', 'resultant force becomes zero'], intervalDays: 1, easeFactor: 2.5, streak: 1, nextReviewDate: '2026-09-20', createdAt, updatedAt: createdAt },
  ];
  const reviews = tasksForDate(state, new Date(2026, 8, 20, 12)).filter((task) => task.type === 'cue-review');
  assert.equal(reviews.length, 2);
  assert.deepEqual(reviews.map((task) => task.scope?.subsection).sort(), ['Forces', 'Motion']);
  assert.match(reviews.find((task) => task.scope?.subsection === 'Forces')?.detail ?? '', /Explain terminal velocity/);
});

test('every learning task can record actual materials, scope, linked cues, and reviewed cues', () => {
  const createdAt = '2026-09-19T08:00:00.000Z';
  const existingCue = { id: 'cue-existing', subjectId: 'biology', subjectName: 'Biology', unit: 'Cells', subsection: 'Transport', prompt: 'Define osmosis.', type: 'definition' as const, markingPoints: ['net movement', 'water molecules', 'partially permeable membrane'], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt, updatedAt: createdAt };
  const newCue = { id: 'cue-new', subjectId: 'biology', subjectName: 'Biology', unit: 'Cells', subsection: 'Transport', prompt: 'State two factors affecting diffusion rate.', type: 'state' as const, markingPoints: ['temperature', 'concentration gradient'], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt, updatedAt: createdAt };
  const state = { ...createEmptyScheduleState(), cues: [existingCue] };
  const task = { key: 'study-1', title: 'Study cell transport', detail: '', type: 'study' as const, date: '2026-09-20', durationMinutes: 45, manual: true };
  const completed = completeLearningSession(state, task, { studiedContent: '', issue: '', note: '' }, {
    subjectName: 'Biology',
    scope: { unit: 'Cells', subsection: 'Transport', cueIds: ['cue-existing', 'cue-new'] },
    materials: [{ code: 'B', progress: '1.1–1.2' }, { code: 'N', progress: 'P8–10' }],
    cueIds: ['cue-existing', 'cue-new'],
    newCues: [newCue],
    assessments: [{ cueId: 'cue-existing', status: 'partial' }],
  }, new Date(2026, 8, 20, 12));

  assert.deepEqual(completed.completions['study-1'].cueIds, ['cue-existing', 'cue-new']);
  assert.deepEqual(completed.completions['study-1'].materials, [{ code: 'B', progress: '1.1–1.2' }, { code: 'N', progress: 'P8–10' }]);
  assert.equal(completed.cues.find((cue) => cue.id === 'cue-existing')?.nextReviewDate, '2026-09-21');
  assert.equal(completed.cues.find((cue) => cue.id === 'cue-new')?.nextReviewDate, '2026-09-21');
  assert.equal(completed.cueReviews.length, 1);
  assert.equal(completed.learningRecords[0].status, 'partial');
  assert.match(completed.learningRecords[0].studiedContent, /Biology → Cells → Transport/);
  assert.match(completed.learningRecords[0].studiedContent, /B 到 1.1–1.2/);
  assert.match(completed.learningRecords[0].studiedContent, /Define osmosis/);
  assert.equal(completed.learningRecords[0].systemReport.passRate, 0);
  assert.match(completed.learningRecords[0].systemReport.summary, /2 条 Cue/);
});

test('learning status is derived only from selected Cue evidence', () => {
  assert.equal(deriveLearningStatus(['a', 'b'], [{ cueId: 'a', status: 'stable' }, { cueId: 'b', status: 'stable' }]), 'stable');
  assert.equal(deriveLearningStatus(['a', 'b'], [{ cueId: 'a', status: 'stable' }, { cueId: 'b', status: 'partial' }]), 'partial');
  assert.equal(deriveLearningStatus(['a', 'b'], [{ cueId: 'a', status: 'stable' }, { cueId: 'b', status: 'unclear' }]), 'unclear');
  assert.equal(deriveLearningStatus(['a'], []), 'partial');
  assert.equal(deriveLearningStatus([], []), 'partial');
});

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

test('learning catalog imports preserve free-text material positions and validate hierarchy', () => {
  const catalog = parseLearningCatalogImport({ version: 1, subjects: [{ id: 'physics', name: 'Physics', units: [{ name: 'Mechanics', subsections: ['Motion', 'Forces'] }], materialProgress: { B: '1.2', N: 'P18', BAD: 'ignored' } }] });
  assert.deepEqual(catalog.subjects[0].units[0].subsections, ['Motion', 'Forces']);
  assert.deepEqual(catalog.subjects[0].materialProgress, { B: '1.2', N: 'P18' });
  const updated = updateSubjectMaterialProgress(catalog.subjects, 'Physics', [{ code: 'B', progress: '1.3' }, { code: 'HW', progress: 'Q1–8' }]);
  assert.deepEqual(updated[0].materialProgress, { B: '1.3', N: 'P18', HW: 'Q1–8' });
  assert.throws(() => parseLearningCatalogImport({ subjects: [{ name: 'Physics', units: [{ name: '', subsections: [] }] }] }), /大单元名称/);
});

test('partial catalog imports merge existing data without deleting untouched content', () => {
  const existing = parseLearningCatalogImport({ subjects: [{ id: 'physics', name: 'Physics', units: [{ name: 'Mechanics', subsections: ['Motion'] }], materialProgress: { B: '1.2', N: 'P18' } }] }).subjects;
  const partial = parseLearningCatalogImport({ subjects: [{ id: 'other-id', name: 'physics', units: [{ name: 'mechanics', subsections: ['Motion', 'Forces'] }, { name: 'Waves', subsections: ['Refraction'] }], materialProgress: { B: '1.3' } }, { id: 'chemistry', name: 'Chemistry', units: [], materialProgress: {} }] }).subjects;
  const merged = mergeLearningCatalog(existing, partial);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'physics');
  assert.deepEqual(merged[0].units, [{ name: 'Mechanics', subsections: ['Motion', 'Forces'] }, { name: 'Waves', subsections: ['Refraction'] }]);
  assert.deepEqual(merged[0].materialProgress, { B: '1.3', N: 'P18' });
  assert.deepEqual(parseLearningUnitOutline('Mechanics | Motion, Forces\nWaves：Refraction；Diffraction'), [{ name: 'Mechanics', subsections: ['Motion', 'Forces'] }, { name: 'Waves', subsections: ['Refraction', 'Diffraction'] }]);
});

test('Cue batch imports validate reusable unit-level Cue data', () => {
  const parsed = parseCueBatchImport({ cues: [{ prompt: 'Define acceleration.', type: 'definition', markingPoints: ['change in velocity', 'per unit time'] }, { prompt: 'Recall the example.' }] });
  assert.equal(parsed.cues.length, 2);
  assert.equal(parsed.cues[1].type, 'general');
  assert.throws(() => parseCueBatchImport({ cues: [] }), /至少需要一条/);
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
