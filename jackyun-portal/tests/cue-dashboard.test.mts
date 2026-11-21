import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyScheduleState, dateKey, recalculateLegacyCueSchedules, setCueReviewSkipped, markCueMastered, saveCueStudyDraft, type StudyCue } from '../src/lib/learning/schedule-control.ts';
import { cueDashboard, cueEntryHref, todayCueQueue } from '../src/lib/learning/cue-dashboard.ts';
import { readScheduleState } from '../src/lib/learning/workspace-reader.ts';
import { addCueBudgetTask, recommendCueBudget } from '../src/lib/learning/cue-budget.ts';
const at = '2026-10-12T04:00:00Z';
const cue = (id: string, extra: Partial<StudyCue> = {}): StudyCue => ({ id, subjectId: 'math', subjectName: '数学', unit: '函数', subsection: '', type: 'definition', prompt: id, markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: at, updatedAt: at, ...extra });

test('counts de-duplicate IDs and explicitly allow overlapping classifications', () => {
  const weak = cue('weak', { status: 'unclear' });
  const s = { ...createEmptyScheduleState(), cues: [weak, weak, cue('other', { subjectId: 'english', subjectName: '英语' })] };
  const d = cueDashboard(s, '2026-10-12');
  assert.equal(d.total, 2); assert.equal(d.due, 2); assert.equal(d.fresh, 2); assert.equal(d.weak, 1);
  assert.equal(d.subjects.reduce((n, x) => n + x.due, 0), d.due);
});
test('same-day completion closes due work and edits reopen it', () => {
  const s = { ...createEmptyScheduleState(), cues: [cue('a', { lastReviewedAt: at, nextReviewDate: '2026-10-13' })] };
  assert.equal(cueDashboard(s, '2026-10-12').learned, 1); assert.equal(todayCueQueue(s, '2026-10-12').length, 0);
  s.cues[0].updatedAt = '2026-10-12T05:00:00Z';
  assert.equal(cueDashboard(s, '2026-10-12').learned, 0); assert.equal(todayCueQueue(s, '2026-10-12').length, 1);
});
test('mastery cools until its exact due day', () => {
  const s = markCueMastered({ ...createEmptyScheduleState(), cues: [cue('a')] }, 'a', new Date(at), 's');
  assert.equal(cueDashboard(s, '2026-10-21').cooling, 1); assert.equal(cueDashboard(s, '2026-10-22').due, 1);
});
test('read-only reader preserves storage and rejects corruption rather than returning empty', () => {
  const raw = JSON.stringify({ ...createEmptyScheduleState(), cues: [cue('a')] });
  const storage = { getItem: () => raw };
  assert.equal(readScheduleState(storage, new Date(at)).cues.length, 1); assert.equal(storage.getItem(), raw);
  assert.throws(() => readScheduleState({ getItem: () => '{bad' }));
  assert.throws(() => readScheduleState({ getItem: () => '{"schemaVersion":8}' }));
  assert.equal(cueDashboard(readScheduleState({ getItem: () => null }), '2026-10-12').total, 0);
});
test('reader accepts a legacy Schedule snapshot with no cues field without mutating storage',()=>{
  const raw=JSON.stringify({schemaVersion:1,timetable:{version:1,courses:[]},practiceSessions:[]});
  const storage={getItem:()=>raw},loaded=readScheduleState(storage,new Date(at));
  assert.deepEqual(loaded.cues,[]);assert.equal(loaded.timetable?.courses.length,0);assert.equal(storage.getItem(),raw);
  assert.throws(()=>readScheduleState({getItem:()=>JSON.stringify({schemaVersion:1,cues:'broken'})}));
});
test('deleted draft content is excluded and entry params are safely encoded', () => {
  const s = saveCueStudyDraft({ ...createEmptyScheduleState(), cues: [cue('a')] }, { id: 'draft', task: { key: 'draft', title: '复习', detail: '', type: 'special', date: '2026-10-12', durationMinutes: 4, subjectId: 'math' }, cueIds: ['gone', 'a'], index: 1, revealed: false, assessments: { gone: 'stable', a: 'partial' }, updatedAt: at });
  assert.equal(cueDashboard(s, '2026-10-12').drafts[0].count, 1); assert.equal(cueDashboard(s, '2026-10-12').drafts[0].done, 1);
  const p = new URL(cueEntryHref('x&subject=y'), 'https://example.com').searchParams;
  assert.equal(p.get('subject'), 'x&subject=y'); assert.equal(p.has('autoStart'), false);
  assert.equal(dateKey(new Date(2026, 9, 12, 0, 0, 0)), '2026-10-12');
});

test('15/30/60 minute previews prioritize unstable, fresh and recovering Cues ahead of stable backlog', () => {
  const lastReviewedAt = '2026-10-01T04:00:00Z';
  const old = { status: 'stable' as const, updatedAt: lastReviewedAt, lastReviewedAt, nextReviewDate: '2026-10-04' };
  const stable = Array.from({ length: 200 }, (_, i) => cue(`stable-${i}`, old));
  const cues = [...stable, cue('recovering', old), cue('new'), cue('partial', { ...old, status: 'partial' }),
    cue('unclear', { ...old, status: 'unclear' }), cue('edited', { ...old, updatedAt: at }),
    cue('manual-priority', { ...old, reviewImportant: true }), cue('exam', { examStatus: 'tested' })];
  const reviews = [
    { id: 'weak', cueId: 'recovering', status: 'unclear' as const, reviewedAt: '2026-09-28T04:00:00Z', nextReviewDate: '2026-09-29' },
    { id: 'green', cueId: 'recovering', status: 'stable' as const, reviewedAt: lastReviewedAt, nextReviewDate: old.nextReviewDate },
  ];
  const raw = JSON.stringify(cues);
  for (const [budget, count] of [[15, 3], [30, 7], [60, 15]] as const) {
    const batch = recommendCueBudget(cues, reviews, budget);
    assert.equal(batch.selected.length, count);
    assert.deepEqual(batch.ordered.slice(0, 7).map(({ id }) => id), ['manual-priority', 'unclear', 'exam', 'edited', 'recovering', 'partial', 'new']);
    assert.equal(batch.reasonsById.get('manual-priority'), '已标为重点');
    assert.equal(batch.priorityById.get('exam'), 0);
    assert.equal(batch.priorityById.get('stable-0'), 2);
    assert.equal(batch.selected.length + batch.remaining.length, cues.length);
  }
  assert.equal(JSON.stringify(cues), raw);
});
test('confirmed budget schedules exact eligible IDs once and keeps ineligible content out', () => {
  const empty = { ...createEmptyScheduleState(), cues: [cue('a'), cue('b', { lastReviewedAt: at, nextReviewDate: '2026-10-20' })] };
  const added = addCueBudgetTask(empty, ['a', 'a', 'b', 'deleted'], new Date(at), 'task');
  assert.equal(empty.manualTasks.length, 0); assert.equal(added.state.manualTasks.length, 1);
  assert.deepEqual(added.state.manualTasks[0].scope?.cueIds, ['a']);
  assert.equal(added.state.manualTasks[0].durationMinutes, 4);
  assert.equal(addCueBudgetTask(added.state, ['a'], new Date(at), 'other').created, false);
  assert.equal(addCueBudgetTask(empty, ['deleted'], new Date(at)).state, empty);
});

test('existing stable evidence spreads 300 of 400 expired cards without changing ratings', () => {
  const state = createEmptyScheduleState();
  state.cueScheduleRevision = 5;
  const mostRecent = '2026-10-01T04:00:00Z';
  state.cues = Array.from({ length: 400 }, (_, i) => i < 300
    ? cue(`old-${i}`, { updatedAt: mostRecent, lastReviewedAt: mostRecent, nextReviewDate: '2026-10-08', status: 'stable', intervalDays: 7, streak: 3 })
    : cue(`needs-${i}`, { status: 'partial' }));
  state.cueReviews = state.cues.slice(0, 300).flatMap(item => ['2026-09-11', '2026-09-21', '2026-10-01'].map(day => ({
    id: `${item.id}:${day}`, cueId: item.id, status: 'stable' as const, reviewedAt: `${day}T04:00:00Z`, nextReviewDate: item.nextReviewDate!, intervalDays: 7,
  })));
  const today = '2026-10-12';
  assert.equal(todayCueQueue(state, today).length, 400);
  const updated = recalculateLegacyCueSchedules(state);
  assert.equal(todayCueQueue(updated, today).length, 100);
  assert.ok(new Set(updated.cues.slice(0, 300).map(item => item.nextReviewDate)).size > 1);
  assert.deepEqual(updated.cueReviews.map(item => [item.id, item.status, item.reviewedAt]), state.cueReviews.map(item => [item.id, item.status, item.reviewedAt]));
  assert.equal(recalculateLegacyCueSchedules(updated), updated);
});

test('K snoozes one date and undo restores eligibility without creating a review', () => {
  const state = { ...createEmptyScheduleState(), cues: [cue('a'), cue('b')] };
  const today = '2026-10-12';
  const skipped = setCueReviewSkipped(state, 'a', today, true);
  assert.deepEqual(todayCueQueue(skipped, today).map(item => item.id), ['b']);
  assert.equal(todayCueQueue(skipped, '2026-10-13').length, 2);
  assert.equal(skipped.cueReviews, state.cueReviews);
  const undone = setCueReviewSkipped(skipped, 'a', today, false);
  assert.equal(todayCueQueue(undone, today).length, 2);
  assert.equal(undone.cueReviews, state.cueReviews);
});
