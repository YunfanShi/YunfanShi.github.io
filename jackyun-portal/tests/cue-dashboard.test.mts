import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyScheduleState, dateKey, markCueMastered, saveCueStudyDraft, type StudyCue } from '../src/lib/learning/schedule-control.ts';
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
test('deleted draft content is excluded and entry params are safely encoded', () => {
  const s = saveCueStudyDraft({ ...createEmptyScheduleState(), cues: [cue('a')] }, { id: 'draft', task: { key: 'draft', title: '复习', detail: '', type: 'special', date: '2026-10-12', durationMinutes: 4, subjectId: 'math' }, cueIds: ['gone', 'a'], index: 1, revealed: false, assessments: { gone: 'stable', a: 'partial' }, updatedAt: at });
  assert.equal(cueDashboard(s, '2026-10-12').drafts[0].count, 1); assert.equal(cueDashboard(s, '2026-10-12').drafts[0].done, 1);
  const p = new URL(cueEntryHref('x&subject=y'), 'https://example.com').searchParams;
  assert.equal(p.get('subject'), 'x&subject=y'); assert.equal(p.has('autoStart'), false);
  assert.equal(dateKey(new Date(2026, 9, 12, 0, 0, 0)), '2026-10-12');
});

test('15/30/60 minute previews are deterministic, read-only and prioritize overdue then fresh', () => {
  const cues = Array.from({ length: 20 }, (_, i) => cue(String(i).padStart(2, '0'), { status: 'unclear' }));
  cues.push(cue('due-stable', { status: 'stable', updatedAt: '2026-10-01T04:00:00Z', lastReviewedAt: '2026-10-01T04:00:00Z', nextReviewDate: '2026-10-12' }));
  const raw = JSON.stringify(cues);
  for (const [budget, count] of [[15, 3], [30, 7], [60, 15]] as const) {
    const batch = recommendCueBudget(cues, '2026-10-12', budget);
    assert.equal(batch.selected.length, count); assert.equal(batch.selected[0].id, 'due-stable');
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
