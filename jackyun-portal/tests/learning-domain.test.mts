import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { completionRate, elapsedSeconds, totalMinutes } from '../src/lib/learning/metrics.ts';
import { rankLearningCandidates } from '../src/lib/learning/prioritization.ts';
import { scheduleReview } from '../src/lib/learning/review-schedule.ts';
import { calendarDayDifference, dateKey } from '../src/lib/learning/timezone.ts';
import { normalizeLatexRelations } from '../src/lib/latex-text.ts';
import { cuePromptSimilarity, cueSimilarityTerms, findSimilarCuePairs } from '../src/lib/learning/cue-similarity.ts';
import {
  allCueStudyDrafts,
  applyTemporaryTimetableUpdate,
  applyTimetableUpdate,
  applyCueBulkOperations,
  applyCueUnitMappings,
  buildCueReviewBatches,
  cancelLearningTask,
  completeReview,
  completeCueReviews,
  completeLearningSession,
  createEmptyScheduleState,
  createIeltsWeekTasks,
  cueActivityTag,
  cueMatchesStatusFilter,
  cuesForLearningTask,
  deriveLearningStatus,
  LEARNING_TASK_PRESETS,
  mergeLearningCatalog,
  mergeLearningCatalogUnits,
  matchLearningCatalogSubject,
  migrateIeltsWeekTaskDates,
  normalizeCueMetadata,
  parseCueBulkImport,
  parseLearningCatalogImport,
  parseLearningUnitOutline,
  parseTimetableImport,
  planCueReview,
  postponeLearningTask,
  recordCueStudyAssessment,
  removeCueStudyDraft,
  saveCueStudyDraft,
  preservedReviewCourseIds,
  reconcileScheduleSubjects,
  rescheduleManualTask,
  rollOverManualTasks,
  sessionsForDate,
  shuffleCueIds,
  tasksForDate,
  toggleCueIds,
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

test('selecting and clearing a Cue subgroup preserves selections outside that subgroup', () => {
  assert.deepEqual(toggleCueIds(['outside', 'cue-1'], ['cue-1', 'cue-2'], true), ['outside', 'cue-1', 'cue-2']);
  assert.deepEqual(toggleCueIds(['outside', 'cue-1', 'cue-2'], ['cue-1', 'cue-2'], false), ['outside']);
});

test('Cue similarity ignores common words and detects reordered duplicate prompts', () => {
  const similar = cuePromptSimilarity(
    'Explain how increased temperature affects the rate of a chemical reaction.',
    'How does an increase in temperature affect chemical reaction rate? Explain.',
  );
  assert.ok(similar.similarity >= 72, `expected a likely duplicate, got ${similar.similarity}%`);
  assert.ok(similar.sharedTerms.includes('temperature'));
  assert.ok(similar.sharedTerms.includes('reaction'));
  assert.deepEqual(cueSimilarityTerms('The force and a force in the system.'), ['force', 'system']);

  const differentIntent = cuePromptSimilarity('Define velocity.', 'Calculate velocity from distance and time.');
  assert.ok(differentIntent.similarity < 72);

  const createdAt = '2026-09-24T08:00:00.000Z';
  const cue = (id: string, subjectId: string, prompt: string) => ({ id, subjectId, subjectName: subjectId, unit: 'Unit', subsection: '', prompt, type: 'general' as const, markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt, updatedAt: createdAt });
  const pairs = findSimilarCuePairs([
    cue('left', 'chemistry', 'Explain how increased temperature affects chemical reaction rate.'),
    cue('right', 'chemistry', 'Explain how chemical reaction rate is affected by an increase in temperature.'),
    cue('other-subject', 'physics', 'Explain how chemical reaction rate is affected by an increase in temperature.'),
  ]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].left.id, 'left');
  assert.equal(pairs[0].right.id, 'right');
  const answerMismatch = findSimilarCuePairs([
    { ...cue('answer-left', 'chemistry', 'Define terminal velocity.'), answer: 'Drag balances weight and acceleration is zero.' },
    { ...cue('answer-right', 'chemistry', 'What is terminal velocity?'), answer: 'The maximum speed reached by a falling object.' },
  ]);
  assert.equal(answerMismatch.length, 0);
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
  assert.equal(reviewed.cues.find((cue) => cue.id === 'cue-def')?.nextReviewDate, '2026-09-20');
  assert.equal(reviewed.cues.find((cue) => cue.id === 'cue-explain')?.status, 'partial');
  assert.equal(reviewed.cues.find((cue) => cue.id === 'cue-explain')?.nextReviewDate, '2026-09-20');
  assert.equal(reviewed.cueReviews.length, 2);
  const due = tasksForDate(reviewed, new Date(2026, 8, 20, 12));
  assert.deepEqual(due.find((task) => task.type === 'cue-review')?.cueIds, ['cue-explain', 'cue-def']);
});

test('Cue review intervals expand with repeated green results and contract after unstable results', () => {
  const createdAt = '2026-09-01T08:00:00.000Z';
  let state = createEmptyScheduleState();
  state.cues = [{ id: 'adaptive-cue', subjectId: 'physics', subjectName: 'Physics', unit: 'Mechanics', subsection: 'Forces', prompt: 'Explain terminal velocity.', type: 'explain', markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt, updatedAt: createdAt }];
  const reviewDates = [
    '2026-09-01T08:00:00.000Z',
    '2026-09-04T08:00:00.000Z',
    '2026-09-11T08:00:00.000Z',
    '2026-09-29T08:00:00.000Z',
    '2026-11-13T08:00:00.000Z',
    '2027-03-06T08:00:00.000Z',
    '2027-09-02T08:00:00.000Z',
    '2027-09-15T08:00:00.000Z',
  ];
  const intervals: number[] = [];
  for (const [index, reviewedAt] of reviewDates.entries()) {
    state = completeCueReviews(state, [{ cueId: 'adaptive-cue', status: 'stable' }], new Date(reviewedAt), `adaptive-${index}`);
    intervals.push(state.cues[0].intervalDays);
  }

  assert.deepEqual(intervals, [1, 3, 5, 7, 9, 11, 13, 15]);
  assert.equal(state.cues[0].streak, 8);
  assert.match(state.cueReviews[2].scheduleReason ?? '', /连续通过 3 次/);
  assert.equal(state.cueReviews[7].intervalDays, 15);

  const yellowPlan = planCueReview(state.cues[0], state.cueReviews, 'partial', new Date('2027-10-01T08:00:00.000Z'));
  assert.equal(yellowPlan.intervalDays, 1);
  assert.equal(yellowPlan.streak, 0);
  assert.equal(yellowPlan.nextReviewDate, '2027-10-02');

  const redPlan = planCueReview(state.cues[0], state.cueReviews, 'unclear', new Date('2027-10-01T08:00:00.000Z'));
  assert.equal(redPlan.intervalDays, 0);
  assert.equal(redPlan.streak, 0);
  assert.equal(redPlan.nextReviewDate, '2027-10-01');
});

test('Cue review history distinguishes yellow recovery, red recovery, and early repeat reviews', () => {
  const createdAt = '2026-09-01T08:00:00.000Z';
  const makeState = () => {
    const state = createEmptyScheduleState();
    state.cues = [{ id: 'history-cue', subjectId: 'physics', subjectName: 'Physics', unit: 'Forces', subsection: '', prompt: 'Explain friction.', type: 'explain', markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt, updatedAt: createdAt }];
    return state;
  };
  const run = (statuses: Array<'stable' | 'partial' | 'unclear'>, dates: string[]) => {
    let state = makeState();
    statuses.forEach((status, index) => {
      state = completeCueReviews(state, [{ cueId: 'history-cue', status }], new Date(`${dates[index]}T08:00:00.000Z`), `review-${index}`);
    });
    return state;
  };
  const yellow = run(['partial', 'partial', 'stable', 'stable', 'stable'], ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']);
  const red = run(['unclear', 'unclear', 'stable', 'stable', 'stable'], ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']);
  assert.deepEqual(yellow.cueReviews.map((review) => review.intervalDays), [1, 1, 1, 1, 3]);
  assert.deepEqual(red.cueReviews.map((review) => review.intervalDays), [0, 0, 0, 1, 1]);
  assert.match(red.cueReviews[2].scheduleReason ?? '', /今天再检索/);
  const early = run(['stable', 'stable'], ['2026-09-01', '2026-09-01']);
  assert.equal(early.cues[0].intervalDays, 1);
  const mastered = run(['stable', 'stable', 'stable'], ['2026-09-01', '2026-09-04', '2026-09-11']);
  const revised = { ...mastered.cues[0], updatedAt: '2026-09-12T08:00:00.000Z' };
  assert.equal(planCueReview(revised, mastered.cueReviews, 'stable', new Date('2026-09-13T08:00:00.000Z')).intervalDays, 1);
});

test('Cue status filters share study semantics for manager views', () => {
  const base = { id: 'cue', subjectId: 'physics', subjectName: 'Physics', unit: 'Forces', subsection: '', prompt: 'Friction', type: 'general' as const, markingPoints: [], intervalDays: 1, easeFactor: 2.5, streak: 0, createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z' };
  assert.equal(cueMatchesStatusFilter(base, 'unreviewed', '2026-09-05'), true);
  assert.equal(cueMatchesStatusFilter({ ...base, status: 'stable', lastReviewedAt: '2026-09-04T08:00:00.000Z', nextReviewDate: '2026-09-07' }, 'stable', '2026-09-05'), true);
  assert.equal(cueMatchesStatusFilter({ ...base, status: 'partial', lastReviewedAt: '2026-09-04T08:00:00.000Z' }, 'weak', '2026-09-05'), true);
  assert.equal(cueMatchesStatusFilter({ ...base, nextReviewDate: '2026-09-07' }, 'due', '2026-09-05'), false);
});

test('Cue study resolves explicit task Cues first and otherwise uses subject plus unit scope', () => {
  const createdAt = '2026-09-19T08:00:00.000Z';
  const cues = [
    { id: 'chapter-4-a', subjectId: 'physics', subjectName: 'Physics', unit: 'Chapter 4', subsection: '', prompt: 'A', type: 'general' as const, markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt, updatedAt: createdAt },
    { id: 'chapter-4-b', subjectId: 'physics', subjectName: 'Physics', unit: 'Chapter 4', subsection: '', prompt: 'B', type: 'general' as const, markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt, updatedAt: createdAt },
    { id: 'chapter-5', subjectId: 'physics', subjectName: 'Physics', unit: 'Chapter 5', subsection: '', prompt: 'C', type: 'general' as const, markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt, updatedAt: createdAt },
  ];
  const scopedTask = { key: 'physics-ch4', title: 'Review Chapter 4', detail: '', type: 'unit-review' as const, date: '2026-09-20', durationMinutes: 30, subjectId: 'physics', subjectName: 'Physics', scope: { unit: 'Chapter 4' } };
  assert.deepEqual(cuesForLearningTask(cues, scopedTask).map((cue) => cue.id), ['chapter-4-a', 'chapter-4-b']);
  assert.deepEqual(cuesForLearningTask(cues, { ...scopedTask, cueIds: ['chapter-5', 'chapter-4-a'] }).map((cue) => cue.id), ['chapter-5', 'chapter-4-a']);
  const stableFuture = { ...cues[0], id: 'stable-future', status: 'stable' as const, lastReviewedAt: '2026-09-19T08:00:00.000Z', nextReviewDate: '2026-09-30' };
  assert.deepEqual(cuesForLearningTask([stableFuture, ...cues], { ...scopedTask, cueIds: ['stable-future', 'chapter-4-a'] }).map((cue) => cue.id), ['chapter-4-a']);
});

test('a class keeps one three-step review sheet and folds its Cue queue into it', () => {
  const createdAt = '2026-09-19T08:00:00.000Z';
  const state = createEmptyScheduleState();
  state.timetable = parseTimetableImport({ version: 1, name: 'Term', courses: [{ id: 'physics', name: 'Physics', review: true, sessions: [{ day: 7, start: '09:00', end: '10:00' }] }] });
  state.reviewProgress.physics = { subjectId: 'physics', subjectName: 'Physics', intervalDays: 1, easeFactor: 2.5, streak: 1, nextReviewDate: '2026-09-20', lastStatus: 'partial', lastStudiedContent: 'Mechanics', lastNote: '', updatedAt: createdAt };
  state.cues = [
    { id: 'motion', subjectId: 'physics', subjectName: 'Physics', unit: 'Mechanics', subsection: 'Motion', prompt: 'Define acceleration.', type: 'definition', markingPoints: ['change in velocity', 'per unit time'], intervalDays: 1, easeFactor: 2.5, streak: 1, nextReviewDate: '2026-09-20', createdAt, updatedAt: createdAt },
    { id: 'forces', subjectId: 'physics', subjectName: 'Physics', unit: 'Mechanics', subsection: 'Forces', prompt: 'Explain terminal velocity.', type: 'explain', markingPoints: ['drag increases', 'resultant force becomes zero'], intervalDays: 1, easeFactor: 2.5, streak: 1, nextReviewDate: '2026-09-20', createdAt, updatedAt: createdAt },
  ];
  const reviews = tasksForDate(state, new Date(2026, 8, 20, 12));
  const jointReview = reviews.find((task) => task.subjectId === 'physics');
  assert.equal(reviews.filter((task) => task.subjectId === 'physics').length, 1);
  assert.equal(jointReview?.title, '联合复习 · Physics · 2 条 Cue');
  assert.equal(jointReview?.start, '10:00');
  assert.deepEqual(jointReview?.cueIds, ['motion', 'forces']);
  assert.equal(jointReview?.scope?.subsection, undefined);
  assert.deepEqual(jointReview?.mergedTasks?.map((item) => item.type), ['completeness-audit', 'study', 'cue-review']);
  assert.match(jointReview?.mergedTasks?.[2].detail ?? '', /常规到期.*黄色 \/ 红色.*今天新增/);

  const completed = completeLearningSession(state, jointReview!, { studiedContent: 'Mechanics', issue: '', note: '' }, { subjectName: 'Physics', scope: { cueIds: ['motion', 'forces'] }, materials: [], cueIds: ['motion', 'forces'], newCues: [], assessments: [{ cueId: 'motion', status: 'stable' }, { cueId: 'forces', status: 'stable' }] }, new Date(2026, 8, 20, 12));
  assert.deepEqual(completed.cues.map((cue) => cue.nextReviewDate), ['2026-09-23', '2026-09-23']);
  assert.ok(completed.completions[jointReview!.key]);
});

test('subject-level interval review yields to Cue-level scheduling', () => {
  const createdAt = '2026-09-19T08:00:00.000Z';
  const state = createEmptyScheduleState();
  state.reviewProgress.physics = { subjectId: 'physics', subjectName: 'Physics', intervalDays: 1, easeFactor: 2.5, streak: 1, nextReviewDate: '2026-09-21', lastStatus: 'partial', lastStudiedContent: 'Mechanics', lastNote: '', updatedAt: createdAt };
  state.cues = [{ id: 'motion', subjectId: 'physics', subjectName: 'Physics', unit: 'Mechanics', subsection: 'Motion', prompt: 'Define acceleration.', type: 'definition', markingPoints: ['change in velocity', 'per unit time'], intervalDays: 1, easeFactor: 2.5, streak: 1, nextReviewDate: '2026-09-21', createdAt, updatedAt: createdAt }];

  const reviews = tasksForDate(state, new Date(2026, 8, 21, 12));

  const jointReview = reviews.find((task) => task.subjectId === 'physics');
  assert.equal(reviews.filter((task) => task.subjectId === 'physics').length, 1);
  assert.equal(jointReview?.key, 'cue-review:2026-09-21:physics');
  assert.equal(jointReview?.type, 'cue-review');
});

test('same-subject review tasks merge across carried and newly generated Cue reviews', () => {
  const createdAt = '2026-09-19T08:00:00.000Z';
  const state = createEmptyScheduleState();
  state.cues = ['a', 'b', 'c'].map((id, index) => ({ id, subjectId: 'computer', subjectName: 'Computer Science', unit: index < 2 ? 'Information Representation' : 'Networks', subsection: '', prompt: `Cue ${id}`, type: 'general' as const, markingPoints: [], intervalDays: 1, easeFactor: 2.5, streak: 1, ...(index < 2 ? { nextReviewDate: '2026-09-21' } : {}), createdAt, updatedAt: createdAt }));
  state.manualTasks = [{ id: 'carried-computer-review', title: 'Computer Science · 3 条 Cue', type: 'cue-review', date: '2026-09-20', durationMinutes: 25, subjectId: 'computer', subject: 'Computer Science', scope: { cueIds: ['a', 'b', 'c'] }, overdueSince: '2026-09-20' }];
  const tasks = tasksForDate(state, new Date(2026, 8, 21, 12));
  const reviews = tasks.filter((task) => task.subjectId === 'computer' && task.type === 'cue-review');
  assert.equal(reviews.length, 1);
  assert.deepEqual(reviews[0].cueIds, ['a', 'b', 'c']);
  assert.deepEqual(new Set(reviews[0].mergedTaskKeys), new Set(['carried-computer-review', 'cue-review:2026-09-21:computer']));
  const completed = completeLearningSession(state, reviews[0], { studiedContent: '', issue: '', note: '' }, { subjectName: 'Computer Science', scope: { cueIds: ['a', 'b', 'c'] }, materials: [], cueIds: ['a', 'b', 'c'], newCues: [], assessments: ['a', 'b', 'c'].map((cueId) => ({ cueId, status: 'stable' as const })) }, new Date('2026-09-21T08:00:00.000Z'));
  assert.ok(completed.completions['carried-computer-review']);
  assert.ok(completed.completions['cue-review:2026-09-21:computer']);
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

test('learning catalog imports accept units without subsections', () => {
  const catalog = parseLearningCatalogImport({ version: 1, subjects: [{ name: 'Physics', units: [{ name: 'Mechanics' }, { name: 'Waves' }], materialProgress: { B: '1.2' } }] });
  assert.deepEqual(catalog.subjects[0].units, [{ name: 'Mechanics', subsections: [] }, { name: 'Waves', subsections: [] }]);
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

test('a partial unit rename preserves the rest of the catalog and updates existing Cue references', () => {
  const createdAt = '2026-09-20T08:00:00.000Z';
  const state = createEmptyScheduleState();
  state.learningCatalog = parseLearningCatalogImport({ subjects: [{ id: 'physics', name: 'Physics', units: [{ name: 'Wave Moton' }, { name: 'Mechanics' }], materialProgress: { B: '2.1' } }] }).subjects;
  state.cues = [{ id: 'wave-cue', subjectId: 'physics', subjectName: 'Physics', unit: 'Wave Moton', subsection: '', prompt: 'Define diffraction.', type: 'definition', markingPoints: ['spreading'], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt, updatedAt: createdAt }];
  const partial = parseLearningCatalogImport({ subjects: [{ id: 'physics', name: 'Physics', units: [{ name: 'Wave Motion', renameFrom: 'Wave Moton' }] }] }).subjects;

  state.learningCatalog = mergeLearningCatalog(state.learningCatalog, partial);
  const reconciled = reconcileScheduleSubjects(state);

  assert.deepEqual(reconciled.learningCatalog[0].units.map((unit) => unit.name), ['Wave Motion', 'Mechanics']);
  assert.equal(reconciled.learningCatalog[0].materialProgress.B, '2.1');
  assert.equal(reconciled.cues[0].unit, 'Wave Motion');
  assert.equal('renameFrom' in reconciled.learningCatalog[0].units[0], false);
  assert.deepEqual(parseLearningUnitOutline('Wave Moton -> Wave Motion'), [{ name: 'Wave Motion', subsections: [], renameFrom: 'Wave Moton' }]);
});

test('merging duplicate units keeps the chosen target and migrates every Cue alias', () => {
  const createdAt = '2026-09-20T08:00:00.000Z';
  const state = createEmptyScheduleState();
  state.learningCatalog = parseLearningCatalogImport({ subjects: [{ id: 'pure-math', name: 'Pure Math', units: [{ name: 'Unit2 Quadratics', subsections: ['Legacy'] }, { name: 'Quadratics', subsections: ['Current'] }, { name: 'Quadratic Equations', subsections: [] }] }] }).subjects;
  state.cues = ['Unit2 Quadratics', 'Quadratics', 'Quadratic Equations'].map((unit, index) => ({ id: `cue-${index}`, subjectId: 'pure-math', subjectName: 'Pure Math', unit, subsection: '', prompt: unit, type: 'general' as const, markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt, updatedAt: createdAt }));

  state.learningCatalog = mergeLearningCatalogUnits(state.learningCatalog, 'pure-math', 0, 1);
  state.learningCatalog = mergeLearningCatalogUnits(state.learningCatalog, 'pure-math', 1, 0);
  state.learningCatalog = parseLearningCatalogImport({ version: 1, subjects: state.learningCatalog }).subjects;
  const reconciled = reconcileScheduleSubjects(state);

  assert.deepEqual(reconciled.learningCatalog[0].units, [{ name: 'Quadratics', subsections: ['Current', 'Legacy'] }]);
  assert.deepEqual(reconciled.cues.map((cue) => cue.unit), ['Quadratics', 'Quadratics', 'Quadratics']);
});

test('rename import coalesces an existing source and target unit instead of creating duplicates', () => {
  const existing = parseLearningCatalogImport({ subjects: [{ id: 'physics', name: 'Physics', units: [{ name: 'Wave Moton', subsections: ['Typo data'] }, { name: 'Wave Motion', subsections: ['Correct data'] }] }] }).subjects;
  const incoming = parseLearningCatalogImport({ subjects: [{ id: 'physics', name: 'Physics', units: [{ name: 'Wave Motion', renameFrom: 'Wave Moton' }] }] }).subjects;
  const merged = mergeLearningCatalog(existing, incoming);

  assert.equal(merged[0].units.length, 1);
  assert.equal(merged[0].units[0].name, 'Wave Motion');
  assert.deepEqual(merged[0].units[0].subsections, ['Correct data', 'Typo data']);
  assert.deepEqual(merged[0].units[0].mergeFrom, ['Wave Moton']);
});

test('timetable course names reconcile with learning subjects by meaningful keywords', () => {
  const catalog = parseLearningCatalogImport({ subjects: [
    { id: 'statistics', name: 'Statistics', units: [], materialProgress: {} },
    { id: 'mechanics', name: 'Mechanics', units: [], materialProgress: {} },
    { id: 'pure-math', name: 'Pure Math', units: [], materialProgress: {} },
  ] }).subjects;
  assert.equal(matchLearningCatalogSubject(catalog, 'AL统计 1 AL Statistics 1')?.id, 'statistics');
  assert.equal(matchLearningCatalogSubject(catalog, 'AL力学 1 AL Mechanics 1')?.id, 'mechanics');
  assert.equal(matchLearningCatalogSubject(catalog, 'AL纯数 1 AL Pure Mathematics 1')?.id, 'pure-math');

  const state = createEmptyScheduleState();
  state.learningCatalog = catalog;
  state.timetable = { version: 1, name: 'AL', courses: [{ id: 'course-statistics', name: 'AL统计 1 AL Statistics 1', color: '#123456', review: true, sessions: [{ day: 7, start: '09:00', end: '10:00' }] }] };
  state.reviewProgress['course-statistics'] = { subjectId: 'course-statistics', subjectName: 'AL统计 1 AL Statistics 1', intervalDays: 1, easeFactor: 2.5, streak: 1, nextReviewDate: '2026-09-20', lastStatus: 'partial', lastNote: '', updatedAt: '2026-09-19T08:00:00.000Z' };
  state.cueCollectionUpdates = [{ id: 'batch-statistics', subjectId: 'course-statistics', subjectName: 'AL统计 1 AL Statistics 1', updatedAt: '2026-09-19T08:00:00.000Z', nextReminderDate: '2026-10-19', createdCount: 2, modifiedCount: 1, totalCueCount: 20 }];
  const reconciled = reconcileScheduleSubjects(state);
  assert.equal(reconciled.reviewProgress.statistics?.subjectName, 'Statistics');
  assert.equal(reconciled.reviewProgress['course-statistics'], undefined);
  assert.equal(reconciled.cueCollectionUpdates[0].subjectId, 'statistics');
  const daily = tasksForDate(reconciled, new Date(2026, 8, 20, 12)).find((task) => task.type === 'course-review');
  assert.equal(daily?.subjectId, 'statistics');
  assert.equal(daily?.subjectName, 'Statistics');
});

test('Cue bulk import accepts mixed create and update operations with explicit actions', () => {
  const parsed = parseCueBulkImport({ operations: [
    { action: 'create', unit: 'Kinematics', prompt: 'Define acceleration.', subtitle: 'Include the time relationship.', type: 'definition', display: 'headline', markingPoints: ['change in velocity', 'per unit time'] },
    { action: 'update', id: 'cue-1', answer: 'Change in velocity per unit time.' },
  ] });
  assert.equal(parsed.operations.length, 2);
  const created = parsed.operations[0];
  assert.equal(created.action, 'create');
  if (created.action !== 'create') throw new Error('Expected create operation.');
  assert.equal(created.subtitle, 'Include the time relationship.');
  assert.equal(created.display, 'headline');
  assert.equal(created.type, 'definition');
  assert.throws(() => parseCueBulkImport({ operations: [] }), /至少需要一条/);
  assert.throws(() => parseCueBulkImport({ operations: [{ unit: 'Forces', prompt: 'Missing action.' }] }), /action/);
  assert.throws(() => parseCueBulkImport({ operations: [{ action: 'update', answer: 'Missing id.' }] }), /id/);
});

test('Cue unit reconciliation applies one user choice to create and update operations', () => {
  const operations = parseCueBulkImport({ operations: [
    { action: 'create', unit: 'Unit 4', prompt: 'First Cue' },
    { action: 'update', id: 'cue-1', unit: 'Unit 4' },
    { action: 'create', unit: 'Forces', prompt: 'Third Cue' },
  ] }).operations;
  const reconciled = applyCueUnitMappings(operations, { 'Unit 4': 'Chapter 4 Motion' });
  assert.deepEqual(reconciled.map((operation) => operation.unit), ['Chapter 4 Motion', 'Chapter 4 Motion', 'Forces']);
  assert.deepEqual(operations.map((operation) => operation.unit), ['Unit 4', 'Unit 4', 'Forces']);
});

test('Cue bulk operations can update an existing Cue and create a new Cue together', () => {
  const createdAt = '2026-09-20T08:00:00.000Z';
  const cues = [{ id: 'cue-1', version: 3, subjectId: 'physics', subjectName: 'Physics', unit: 'Forces', subsection: '', prompt: 'Choose the vector.', type: 'general' as const, markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt, updatedAt: createdAt }];
  const operations = parseCueBulkImport({ operations: [
    { action: 'update', id: 'cue-1', type: 'multiple-choice', display: 'multiple-choice', choices: ['speed', 'velocity'], correctChoice: 1, markingPoints: ['has direction'] },
    { action: 'create', unit: 'Waves', prompt: 'Define diffraction.', type: 'definition', display: 'definition-card', markingPoints: ['spreading'] },
  ] }).operations;
  const merged = applyCueBulkOperations(cues, operations, (operation) => ({ id: 'cue-2', subjectId: 'physics', subjectName: 'Physics', unit: operation.unit, subsection: '', prompt: operation.prompt, type: operation.type, display: operation.display, markingPoints: operation.markingPoints, intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt, updatedAt: createdAt }), '2026-09-20T09:00:00.000Z');
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'cue-1');
  assert.equal(merged[0].prompt, 'Choose the vector.');
  assert.equal(merged[0].type, 'multiple-choice');
  assert.deepEqual(merged[0].choices, ['speed', 'velocity']);
  assert.equal(merged[0].version, 4);
  assert.equal(merged[0].updatedAt, '2026-09-20T09:00:00.000Z');
  assert.equal(merged[1].id, 'cue-2');
  assert.equal(merged[1].prompt, 'Define diffraction.');
  const unchanged = applyCueBulkOperations([merged[0]], [operations[0]], () => { throw new Error('No create expected.'); }, '2026-09-20T10:00:00.000Z');
  assert.equal(unchanged[0].version, 4);
  assert.equal(unchanged[0].updatedAt, '2026-09-20T09:00:00.000Z');
  assert.throws(() => parseCueBulkImport({ operations: [{ action: 'update', id: 'cue-1', type: 'multiple-choice', choices: ['only one'], correctChoice: 0 }] }), /2–6/);
  assert.throws(() => parseCueBulkImport({ operations: [{ action: 'update', id: 'cue-1', answer: 'A' }, { action: 'update', id: 'cue-1', answer: 'B' }] }), /重复修改/);
});

test('legacy Cue metadata defaults to version 1 and the supplied current time', () => {
  const fallback = '2026-09-21T04:00:00.000Z';
  const legacy = { id: 'legacy', subjectId: 'physics', subjectName: 'Physics', unit: 'Waves', subsection: '', prompt: 'Define diffraction.', type: 'definition' as const, markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '' };
  const normalized = normalizeCueMetadata(legacy, fallback);
  assert.equal(normalized.version, 1);
  assert.equal(normalized.updatedAt, fallback);
});

test('Cue activity tags prioritize unseen and changed content before review state', () => {
  const base = { id: 'cue-1', version: 1, subjectId: 'physics', subjectName: 'Physics', unit: 'Waves', subsection: '', prompt: 'Define diffraction.', type: 'definition' as const, markingPoints: [], intervalDays: 1, easeFactor: 2.5, streak: 0, createdAt: '2026-09-18T08:00:00.000Z', updatedAt: '2026-09-18T08:00:00.000Z' };
  assert.equal(cueActivityTag(base, '2026-09-21'), 'new');
  assert.equal(cueActivityTag({ ...base, version: 2, lastReviewedAt: '2026-09-19T08:00:00.000Z', updatedAt: '2026-09-20T08:00:00.000Z' }, '2026-09-21'), 'updated');
  assert.equal(cueActivityTag({ ...base, lastReviewedAt: '2026-09-19T08:00:00.000Z', nextReviewDate: '2026-09-21' }, '2026-09-21'), 'due');
  assert.equal(cueActivityTag({ ...base, lastReviewedAt: '2026-09-19T08:00:00.000Z', status: 'unclear' }, '2026-09-21'), 'focus');
  assert.equal(cueActivityTag({ ...base, lastReviewedAt: '2026-09-19T08:00:00.000Z', status: 'partial' }, '2026-09-21'), 'building');
  assert.equal(cueActivityTag({ ...base, lastReviewedAt: '2026-09-19T08:00:00.000Z', status: 'stable', streak: 3 }, '2026-09-21'), 'streak');
});

test('Cue review batching combines small units and splits large units into manageable sessions', () => {
  const createdAt = '2026-09-20T08:00:00.000Z';
  const makeCues = (unit: string, count: number, offset = 0) => Array.from({ length: count }, (_, index) => ({ id: `${unit}-${index}`, subjectId: 'physics', subjectName: 'Physics', unit, subsection: '', prompt: `Cue ${offset + index}`, type: 'general' as const, markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt, updatedAt: createdAt }));

  const combined = buildCueReviewBatches([...makeCues('Waves', 10), ...makeCues('Forces', 8, 10)]);
  assert.equal(combined.length, 1);
  assert.equal(combined[0].length, 18);
  assert.deepEqual(new Set(combined[0].map((cue) => cue.unit)), new Set(['Waves', 'Forces']));

  const split = buildCueReviewBatches(makeCues('Mechanics', 25));
  assert.deepEqual(split.map((batch) => batch.length), [13, 12]);
  assert.ok(split.every((batch) => new Set(batch.map((cue) => cue.unit)).size === 1));
});

test('daily Cue review creates separate numbered tasks for a large due unit', () => {
  const createdAt = '2026-09-20T08:00:00.000Z';
  const state = createEmptyScheduleState();
  state.cues = Array.from({ length: 25 }, (_, index) => ({ id: `mechanics-${index}`, subjectId: 'physics', subjectName: 'Physics', unit: 'Mechanics', subsection: '', prompt: `Cue ${index}`, type: 'general' as const, markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt, updatedAt: createdAt }));
  state.reviewProgress.physics = { subjectId: 'physics', subjectName: 'Physics', intervalDays: 1, easeFactor: 2.5, streak: 1, nextReviewDate: '2026-09-21', lastStatus: 'partial', lastNote: '', updatedAt: createdAt };

  const reviews = tasksForDate(state, new Date(2026, 8, 21, 12)).filter((task) => task.type === 'cue-review');
  assert.equal(reviews.length, 2);
  assert.deepEqual(reviews.map((task) => task.cueIds?.length), [13, 12]);
  assert.deepEqual(reviews.map((task) => task.key), ['cue-review:2026-09-21:physics', 'cue-review:2026-09-21:physics:batch-2']);
  assert.ok(reviews.every((task) => task.scope?.unit === 'Mechanics'));
});

test('a heavy class day schedules only the highest-priority Cue batch and keeps the backlog queued', () => {
  const state = createEmptyScheduleState();
  state.timetable = parseTimetableImport({
    version: 1,
    name: 'Heavy Monday',
    courses: [{
      id: 'school-day',
      name: 'School day',
      review: false,
      sessions: [
        { day: 1, start: '08:00', end: '09:00' },
        { day: 1, start: '09:00', end: '10:00' },
        { day: 1, start: '10:00', end: '11:00' },
        { day: 1, start: '11:00', end: '12:00' },
      ],
    }],
  });
  const makeCues = (subjectId: string, status: 'unclear' | 'partial' | undefined, count: number) => Array.from({ length: count }, (_, index) => ({
    id: `${subjectId}-${index}`,
    subjectId,
    subjectName: subjectId,
    unit: 'Unit 1',
    subsection: '',
    prompt: `${subjectId} Cue ${index}`,
    type: 'general' as const,
    markingPoints: [],
    ...(status ? { status } : {}),
    intervalDays: 0,
    easeFactor: 2.5,
    streak: 0,
    nextReviewDate: '2026-09-20',
    lastReviewedAt: '2026-09-19T08:00:00.000Z',
    createdAt: '2026-09-18T08:00:00.000Z',
    updatedAt: '2026-09-19T08:00:00.000Z',
  }));
  state.cues = [
    ...makeCues('stable-backlog', undefined, 15),
    ...makeCues('partial-backlog', 'partial', 15),
    ...makeCues('unclear-backlog', 'unclear', 15),
  ];

  const reviews = tasksForDate(state, new Date(2026, 8, 21, 12)).filter((task) => task.type === 'cue-review');

  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].subjectId, 'unclear-backlog');
  assert.equal(reviews[0].cueIds?.length, 15);
  assert.match(reviews[0].detail, /只安排 1 个 Cue 复习批次.*其余 Cue 自动留在队列/);
});

test('daily Cue review is the deduplicated union of regular, weak, and today-created Cues', () => {
  const state = createEmptyScheduleState();
  const common = { subjectId: 'physics', subjectName: 'Physics', unit: 'Mechanics', subsection: '', type: 'general' as const, markingPoints: [], intervalDays: 3, easeFactor: 2.5, streak: 1, lastReviewedAt: '2026-09-20T08:00:00.000Z', updatedAt: '2026-09-20T08:00:00.000Z' };
  state.cues = [
    { ...common, id: 'regular', prompt: 'Regular', status: 'stable', nextReviewDate: '2026-09-21', createdAt: '2026-09-18T08:00:00.000Z' },
    { ...common, id: 'weak', prompt: 'Weak', status: 'partial', nextReviewDate: '2026-09-30', createdAt: '2026-09-18T08:00:00.000Z' },
    { ...common, id: 'today', prompt: 'Today', status: 'stable', nextReviewDate: '2026-09-30', createdAt: '2026-09-21T03:00:00.000Z' },
    { ...common, id: 'future', prompt: 'Future', status: 'stable', nextReviewDate: '2026-09-30', createdAt: '2026-09-18T08:00:00.000Z' },
  ];

  const review = tasksForDate(state, new Date(2026, 8, 21, 12)).find((task) => task.type === 'cue-review');

  assert.deepEqual(new Set(review?.cueIds), new Set(['regular', 'weak', 'today']));
  assert.match(review?.detail ?? '', /常规到期 1 · 黄色 \/ 红色 1 · 今日新增 1/);
});

test('a changed Cue is reviewed again even when its old interval date is still in the future', () => {
  const state = createEmptyScheduleState();
  state.cues = [{ id: 'updated-cue', version: 2, subjectId: 'physics', subjectName: 'Physics', unit: 'Waves', subsection: '', prompt: 'Updated explanation', type: 'explain', markingPoints: [], status: 'stable', intervalDays: 7, easeFactor: 2.5, streak: 3, nextReviewDate: '2026-09-28', lastReviewedAt: '2026-09-20T08:00:00.000Z', createdAt: '2026-09-18T08:00:00.000Z', updatedAt: '2026-09-21T08:00:00.000Z' }];

  const review = tasksForDate(state, new Date(2026, 8, 21, 12)).find((task) => task.type === 'cue-review');
  assert.deepEqual(review?.cueIds, ['updated-cue']);
});

test('full Cue update can change subject, unit, prompt, answer, formula, and display properties', () => {
  const createdAt = '2026-09-20T08:00:00.000Z';
  const cues = [{ id: 'cue-1', subjectId: 'pure-math', subjectName: 'Pure Math', unit: 'Algebra', subsection: '', prompt: 'Old prompt', type: 'general' as const, markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt, updatedAt: createdAt }];
  const operations = parseCueBulkImport({ operations: [{ action: 'update', id: 'cue-1', subjectName: 'Pure Mathematics', unit: 'Quadratics', subsection: 'Completing the square', prompt: 'Solve \\(ax^2+bx+c=0\\).', subtitle: '', answer: '\\[x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}\\]', type: 'formula', display: 'formula', markingPoints: ['\\(b^2-4ac\\ge0\\) for real roots'] }] }).operations;
  const enriched = applyCueBulkOperations(cues, operations, () => { throw new Error('No create expected.'); }, '2026-09-20T09:00:00.000Z');

  assert.equal(enriched[0].subjectName, 'Pure Mathematics');
  assert.equal(enriched[0].unit, 'Quadratics');
  assert.equal(enriched[0].subsection, 'Completing the square');
  assert.equal(enriched[0].subtitle, '');
  assert.match(enriched[0].prompt, /ax\^2/);
  assert.equal(enriched[0].type, 'formula');
  assert.equal(enriched[0].display, 'formula');
  assert.match(enriched[0].answer ?? '', /\\frac/);
});

test('Cue study ratings save immediately, can be corrected, and are not duplicated at completion', () => {
  const createdAt = '2026-09-20T08:00:00.000Z';
  const task = { key: 'cue-special-session', title: 'Cue 专项学习', detail: '', type: 'special' as const, date: '2026-09-21', durationMinutes: 30, subjectId: 'physics', subjectName: 'Physics', scope: { cueIds: ['cue-1'] } };
  const state = createEmptyScheduleState();
  state.cues = [{ id: 'cue-1', version: 2, subjectId: 'physics', subjectName: 'Physics', unit: 'Waves', subsection: '', prompt: 'Define diffraction.', type: 'definition', markingPoints: ['spreading'], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt, updatedAt: createdAt }];
  const reviewedAt = new Date('2026-09-21T08:00:00.000Z');

  const first = recordCueStudyAssessment(state, { cueId: 'cue-1', status: 'stable' }, reviewedAt, task.key);
  assert.equal(first.cues[0].status, 'stable');
  assert.equal(first.cues[0].intervalDays, 1);
  assert.equal(first.cues[0].streak, 1);
  assert.equal(first.cues[0].version, 2);
  assert.equal(first.cues[0].updatedAt, createdAt);
  assert.equal(first.cueReviews.length, 1);

  const corrected = recordCueStudyAssessment(first, { cueId: 'cue-1', status: 'partial' }, new Date('2026-09-21T08:01:00.000Z'), task.key);
  assert.equal(corrected.cues[0].status, 'partial');
  assert.equal(corrected.cueReviews.length, 1);
  assert.equal(corrected.cueReviews[0].status, 'partial');
  assert.equal(corrected.cues[0].intervalDays, 1);
  assert.equal(corrected.cues[0].streak, 0);
  assert.equal(corrected.cueReviews[0].intervalDays, 1);
  assert.equal(corrected.cues[0].version, 2);
  assert.equal(corrected.cues[0].updatedAt, createdAt);

  const completed = completeLearningSession(corrected, task, { studiedContent: '', issue: '', note: '' }, { subjectName: 'Physics', scope: { cueIds: ['cue-1'] }, materials: [], cueIds: ['cue-1'], newCues: [], assessments: [{ cueId: 'cue-1', status: 'partial' }], cueReviewsAlreadyRecorded: true }, new Date('2026-09-21T08:02:00.000Z'));
  assert.equal(completed.cueReviews.length, 1);
  assert.equal(completed.learningRecords[0].cues[0].status, 'partial');
});

test('Cue LaTeX accepts commonly escaped comparison symbols', () => {
  assert.equal(normalizeLatexRelations(String.raw`f(x)\<g(x)`), 'f(x)<g(x)');
  assert.equal(normalizeLatexRelations(String.raw`f(x)\>g(x)`), 'f(x)>g(x)');
  assert.equal(normalizeLatexRelations(String.raw`ax^2+bx+c`), 'ax^2+bx+c');
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

test('timetable import preserves manual choices without auto-selecting matching learning subjects', () => {
  const current = parseTimetableImport({
    version: 1,
    name: 'Current',
    courses: [
      { id: 'physics-old', name: 'Physics', review: true, sessions: [{ day: 1, start: '08:00', end: '08:45' }] },
    ],
  });
  const imported = parseTimetableImport({
    version: 1,
    name: 'New',
    courses: [
      { id: 'physics-old', name: 'Physics', review: false, sessions: [{ day: 2, start: '08:00', end: '08:45' }] },
      { id: 'statistics', name: 'AL Statistics 1', review: false, sessions: [{ day: 2, start: '09:00', end: '09:45' }] },
      { id: 'basketball', name: 'Basketball', review: false, sessions: [{ day: 2, start: '10:00', end: '10:45' }] },
    ],
  });
  assert.deepEqual(preservedReviewCourseIds(imported, current), ['physics-old']);
});

test('partial timetable update preserves choices and handles a moved class and weekend makeup day', () => {
  const current = parseTimetableImport({
    version: 1, name: 'Term', termStart: '2026-09-01',
    courses: [
      { id: 'physics', name: 'Physics', review: true, color: '#123456', sessions: [{ day: 1, start: '08:00', end: '08:45' }] },
      { id: 'math', name: 'Math', review: false, sessions: [{ day: 2, start: '09:00', end: '09:45' }] },
    ],
  });
  const updated = applyTimetableUpdate({
    version: 1,
    courses: [{ id: 'physics', sessions: [{ day: 3, start: '10:00', end: '10:45' }] }],
    dateOverrides: [{ date: '2026-09-26', sessions: [{ courseId: 'physics', start: '08:00', end: '08:45' }] }],
  }, current);
  assert.equal(updated.courses.length, 2);
  assert.equal(updated.courses[0].review, true);
  assert.equal(updated.courses[0].color, '#123456');
  assert.equal(updated.termStart, '2026-09-01');
  assert.equal(sessionsForDate(updated, new Date(2026, 8, 23, 12))[0].course.id, 'physics');
  assert.equal(sessionsForDate(updated, new Date(2026, 8, 26, 12))[0].course.id, 'physics');
  assert.equal(sessionsForDate(updated, new Date(2026, 8, 19, 12)).length, 0);
  const dayOff = applyTimetableUpdate({ dateOverrides: [{ date: '2026-09-26', sessions: [] }] }, updated);
  assert.equal(sessionsForDate(dayOff, new Date(2026, 8, 26, 12)).length, 0);
  const deleted = applyTimetableUpdate({ deleteCourseIds: ['physics'] }, updated);
  assert.equal(deleted.courses.length, 1);
  assert.equal(sessionsForDate(deleted, new Date(2026, 8, 26, 12)).length, 0);
  assert.throws(() => applyTimetableUpdate({ dateOverrides: [{ date: '2026-09-26', sessions: [{ courseId: 'unknown', start: '08:00', end: '09:00' }] }] }, current), /courseId/);
});

test('temporary timetable updates keep the primary timetable and replace only a dated override', () => {
  const current = parseTimetableImport({ version: 1, name: 'Primary', courses: [{ id: 'physics', name: 'Physics', review: true, sessions: [{ day: 1, start: '08:00', end: '08:45' }] }] });
  const updated = applyTemporaryTimetableUpdate({ version: 1, scheduleRole: 'temporary', temporaryDate: '2026-09-26', dateOverrides: [{ date: '2026-09-26', sessions: [{ courseId: 'physics', start: '10:00', end: '10:45' }] }] }, current);
  assert.equal(updated.courses[0].sessions[0].start, '08:00');
  assert.equal(sessionsForDate(updated, new Date(2026, 8, 26, 12))[0].start, '10:00');
  assert.equal(updated.scheduleRole, 'primary');
});

test('Cue study drafts survive across subjects and replace only the same subject', () => {
  const task = (subjectId: string, key: string) => ({ key, title: key, detail: '', type: 'special' as const, date: '2026-09-24', durationMinutes: 30, subjectId, subjectName: subjectId });
  const draft = (subjectId: string, key: string) => ({ id: key, task: task(subjectId, key), cueIds: [key], index: 0, revealed: false, assessments: {}, updatedAt: '2026-09-24T00:00:00Z' });
  const physics = draft('physics', 'physics-1');
  const math = draft('math', 'math-1');
  let state = saveCueStudyDraft(createEmptyScheduleState(), physics);
  state = saveCueStudyDraft(state, math);
  state = saveCueStudyDraft(state, draft('physics', 'physics-2'));
  assert.deepEqual(Object.keys(allCueStudyDrafts(state)).sort(), ['math', 'physics']);
  assert.equal(allCueStudyDrafts(state).physics.id, 'physics-2');
  state = removeCueStudyDraft(state, allCueStudyDrafts(state).physics);
  assert.equal(allCueStudyDrafts(state).math.id, math.id);
});

test('shuffle mode changes Cue order without losing or duplicating a Cue', () => {
  const source = ['a', 'b', 'c', 'd'];
  const shuffled = shuffleCueIds(source, () => 0);
  assert.notDeepEqual(shuffled, source);
  assert.deepEqual([...shuffled].sort(), [...source].sort());
  assert.deepEqual(source, ['a', 'b', 'c', 'd']);
  assert.deepEqual(shuffleCueIds(['only'], () => 0), ['only']);
});

test('per-subject Cue draft keeps shuffled order and prior statuses when another subject saves', () => {
  const physics = {
    id: 'physics-1',
    task: { key: 'physics-1', title: 'Physics', detail: '', type: 'special' as const, date: '2026-09-24', durationMinutes: 30, subjectId: 'physics', subjectName: 'Physics' },
    cueIds: ['cue-b', 'cue-a'], index: 1, revealed: true, assessments: { 'cue-b': 'partial' as const },
    priorStatuses: { 'cue-b': 'stable' as const, 'cue-a': null }, shuffled: true, updatedAt: '2026-09-24T00:00:00Z',
  };
  const math = { ...physics, id: 'math-1', task: { ...physics.task, key: 'math-1', subjectId: 'math', subjectName: 'Math' }, cueIds: ['cue-m'] };
  const state = saveCueStudyDraft(saveCueStudyDraft(createEmptyScheduleState(), physics), math);
  assert.deepEqual(allCueStudyDrafts(state).physics.cueIds, ['cue-b', 'cue-a']);
  assert.deepEqual(allCueStudyDrafts(state).physics.priorStatuses, physics.priorStatuses);
  assert.equal(allCueStudyDrafts(state).physics.shuffled, true);
});

test('collective Cue maintenance creates one durable reminder and resets after a recorded batch check', () => {
  const state = createEmptyScheduleState();
  state.cues = [{
    id: 'cue-1',
    subjectId: 'physics',
    subjectName: 'Physics',
    unit: 'Kinematics',
    subsection: '',
    prompt: 'Define acceleration',
    type: 'definition',
    markingPoints: [],
    intervalDays: 3,
    easeFactor: 2.5,
    streak: 0,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
  }];

  const due = tasksForDate(state, new Date(2026, 8, 23, 12));
  const reminder = due.find((task) => task.key.startsWith('cue-maintenance:'));
  assert.ok(reminder);
  assert.equal(reminder.title, '整批检查 Cue 更新 · 1 科');
  assert.match(reminder.detail, /尚未记录整批更新/);

  state.cueCollectionUpdates = [{
    id: 'batch-1',
    subjectId: 'physics',
    subjectName: 'Physics',
    updatedAt: '2026-09-20T08:00:00.000Z',
    nextReminderDate: '2026-10-20',
    createdCount: 3,
    modifiedCount: 2,
    totalCueCount: 44,
  }];
  assert.equal(tasksForDate(state, new Date(2026, 8, 23, 12)).some((task) => task.key.startsWith('cue-maintenance:')), false);
  assert.equal(tasksForDate(state, new Date(2026, 9, 20, 12)).some((task) => task.key.startsWith('cue-maintenance:')), true);
  state.settings.cueCollectionReminderDays = 7;
  assert.equal(tasksForDate(state, new Date(2026, 8, 26, 12)).some((task) => task.key.startsWith('cue-maintenance:')), false);
  assert.equal(tasksForDate(state, new Date(2026, 8, 27, 12)).some((task) => task.key.startsWith('cue-maintenance:')), true);
  assert.equal(tasksForDate({ ...state, settings: { ...state.settings, cueCollectionReminderEnabled: false } }, new Date(2026, 9, 20, 12)).some((task) => task.key.startsWith('cue-maintenance:')), false);
});

test('cancelling a generated checklist task removes the visible parent and every folded child', () => {
  const timetable = parseTimetableImport({
    version: 1,
    name: 'Cancel test',
    courses: [{ id: 'physics', name: 'Physics', review: true, sessions: [{ day: 2, start: '08:00', end: '08:45' }] }],
  });
  const state = { ...createEmptyScheduleState(), timetable };
  const date = new Date(2026, 8, 15, 12);
  const task = tasksForDate(state, date).find((item) => item.key === 'course-review:2026-09-15:physics')!;
  assert.ok(task.mergedTaskKeys?.length);

  const cancelled = cancelLearningTask(state, task, '2026-09-15T12:00:00.000Z');
  assert.ok(cancelled.cancellations[task.key]);
  assert.ok(task.mergedTaskKeys?.every((key) => cancelled.cancellations[key]));
  assert.equal(tasksForDate(cancelled, date).some((item) => item.key === task.key), false);
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
  const postClass = tasks.find((task) => task.key === 'course-review:2026-09-15:math')!;
  assert.equal(postClass.title, '课后复习单 · Mathematics');
  assert.equal(postClass.start, '08:45');
  assert.deepEqual(postClass.mergedTasks?.map((item) => item.type), ['completeness-audit', 'study', 'cue-review']);
  assert.match(postClass.detail, /课堂笔记.*Cue/);
  assert.equal(tasksForDate({ ...state, settings: { ...state.settings, postClassTasksEnabled: false } }, tuesday).some((task) => task.type === 'course-review'), false);

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
  assert.equal(followUp.lastStatus, undefined);
  assert.equal(followUp.studiedContent, undefined);
  assert.equal(followUp.issue, undefined);
  assert.equal(followUp.note, undefined);
  assert.equal(followUp.title, 'Mathematics · 间隔复习');
  assert.equal(followUp.detail, '复习：三角函数恒等变换第 2–4 题');

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
