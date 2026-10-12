import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyScheduleState, dateKey, markCueMastered, saveCueStudyDraft, type StudyCue } from '../src/lib/learning/schedule-control.ts';
import { cueDashboard, cueEntryHref, todayCueQueue } from '../src/lib/learning/cue-dashboard.ts';
import { readScheduleState } from '../src/lib/learning/workspace-reader.ts';
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
  assert.equal(dateKey(new Date('2026-10-11T16:00:00Z')), '2026-10-12');
});
