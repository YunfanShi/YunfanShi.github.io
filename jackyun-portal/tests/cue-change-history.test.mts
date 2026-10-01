import assert from 'node:assert/strict';
import test from 'node:test';
import { createCueChangeRecord } from '../src/lib/learning/cue-change-history.ts';
import { completeLearningSession, createEmptyScheduleState, type StudyCue } from '../src/lib/learning/schedule-control.ts';
import { threeWayMerge } from '../src/lib/sync/merge.ts';
import { scheduleHasContent } from '../src/lib/sync/schedule-safety.ts';
const at = '2026-10-01T01:00:00Z';
const original: StudyCue = { id: 'c1', subjectId: 'physics', subjectName: 'Physics', unit: 'Unit 1', subsection: '', prompt: 'Force?', answer: 'A vector', markingPoints: ['direction'], type: 'definition', version: 1, intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: at, updatedAt: at };

test('one import records actual creates, updates, deletions and immutable field differences', () => {
  const edited = { ...original, answer: 'Push or pull', version: 2, markingPoints: ['interaction'] };
  const record = createCueChangeRecord([original, { ...original, id: 'gone' }], [edited, { ...original, id: 'new' }], 'import', at, 'event-1')!;
  assert.deepEqual([record.createdCount, record.modifiedCount, record.deletedCount], [1, 1, 1]);
  assert.deepEqual(record.changes[0].fields.map((field) => field.field), ['answer', 'markingPoints']);
  assert.equal(record.changes[0].beforeVersion, 1);
  assert.equal(record.changes[0].afterVersion, 2);
  edited.markingPoints.push('mutated');
  assert.deepEqual(record.changes[0].fields.find((field) => field.field === 'markingPoints')?.after, ['interaction']);
});

test('no-op imports are recorded, no-op manual saves and review-only changes are ignored', () => {
  assert.equal(createCueChangeRecord([original], [{ ...original }], 'manual', at, 'noop'), null);
  assert.equal(createCueChangeRecord([original], [{ ...original, status: 'stable', streak: 3, nextReviewDate: '2026-10-10' }], 'manual', at, 'review'), null);
  assert.deepEqual(createCueChangeRecord([original], [original], 'import', at, 'noop')?.changes, []);
  assert.equal(createCueChangeRecord([original], [original], 'memory', at, 'memory')?.source, 'memory');
});

test('deletion history survives serialization and concurrent records merge by ID', () => {
  const deletion = createCueChangeRecord([original], [], 'manual', at, 'delete')!;
  const addition = createCueChangeRecord([], [original], 'memory', at, 'add')!;
  const base = createEmptyScheduleState();
  const local = { ...base, cueChangeHistory: [deletion] };
  const remote = { ...base, cueChangeHistory: [addition] };
  const merged = threeWayMerge(base, local, remote);
  assert.deepEqual(merged.conflicts, []);
  const saved = JSON.parse(JSON.stringify(merged.merged));
  assert.deepEqual(saved.cueChangeHistory.map((record: { id: string }) => record.id), ['delete', 'add']);
  assert.equal(saved.cueChangeHistory[0].changes[0].prompt, original.prompt);
  assert.equal(scheduleHasContent(local), true);
});

test('new CUEs submitted with a learning record produce one content history event', () => {
  const state = createEmptyScheduleState();
  const task = { key: 'lesson', title: 'Lesson', detail: '', type: 'special' as const, date: '2026-10-01', durationMinutes: 4 };
  const evidence = { cueIds: ['c1'], assessments: [{ cueId: 'c1', status: 'stable' as const }], materials: [], newCues: [original], sessionId: 'lesson' };
  const result = completeLearningSession(state, task, { studiedContent: '', issue: '', note: '' }, evidence, new Date(at));
  assert.equal(result.cueChangeHistory[0].source, 'lesson');
  assert.equal(result.cueChangeHistory[0].createdCount, 1);
  const retried = completeLearningSession(result, task, { studiedContent: '', issue: '', note: '' }, evidence, new Date(at));
  assert.equal(retried.cueChangeHistory.length, 1);
});
