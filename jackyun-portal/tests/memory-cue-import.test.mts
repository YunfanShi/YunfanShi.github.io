import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefinitionCard } from '../src/lib/definition-cards.ts';
import { memoryCueCandidates, newMemoryCueOperations } from '../src/lib/learning/memory-cue-import.ts';
import { reorderCueStudy, saveCueStudyDraft, createEmptyScheduleState, type StudyCue, type CueStudyDraft } from '../src/lib/learning/schedule-control.ts';

test('memory import makes independent definitions and complete comparisons without transferring review state', () => {
  const card = createDefinitionCard({ term: 'Force', definition: 'Rate of change of momentum.', note: '' });
  const deck = { id: 'deck', title: 'Waves', items: ['Transverse', 'Longitudinal'], properties: [
    { id: 'a', label: 'Direction', values: ['Perpendicular', 'Parallel'] },
    { id: 'b', label: 'Examples', values: ['', 'Sound'] },
  ] };
  const before = JSON.stringify([card, deck]);
  const candidates = memoryCueCandidates([card], [deck], 'Physics', 'Waves');
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].operation.type, 'definition');
  assert.equal(candidates[1].operation.type, 'compare');
  assert.match(candidates[1].operation.answer!, /Longitudinal: Parallel/);
  assert.equal('status' in candidates[0].operation, false);
  assert.equal(JSON.stringify([card, deck]), before);
  assert.equal(newMemoryCueOperations(candidates, candidates.map(({ operation }) => ({ ...operation, subjectName: 'Physics' } as unknown as StudyCue))).length, 0);
  assert.equal(newMemoryCueOperations([...candidates, ...candidates], []).length, 2);
  assert.deepEqual(memoryCueCandidates(null, [{}], 'Physics', 'Waves'), []);
});

test('shuffle changes only remaining Cues, preserves all evidence and current unfinished Cue', () => {
  const order = reorderCueStudy(['a', 'b', 'c', 'd'], { a: 'stable', c: 'partial' }, true, 'b', () => 0);
  assert.deepEqual(order.hiddenCueIds, ['a', 'c']);
  assert.deepEqual(new Set(order.cueIds), new Set(['a', 'b', 'c', 'd']));
  assert.equal(order.cueIds[order.index], 'b');
  assert.equal(order.retainedCurrent, true);
  const restored = reorderCueStudy(['a', 'b', 'c', 'd'], { a: 'stable', c: 'partial' }, false, 'b');
  assert.deepEqual(restored.cueIds, ['b', 'd', 'a', 'c']);
  assert.equal(reorderCueStudy(['a'], { a: 'stable' }, true, 'a').retainedCurrent, false);
  const draft = { id: 'draft', task: { key: 'task' }, ...order, revealed: true, selectedChoice: 1, assessments: { a: 'stable', c: 'partial' }, updatedAt: '2026-09-27T10:00:00Z' } as unknown as CueStudyDraft;
  const state = saveCueStudyDraft(createEmptyScheduleState(), draft);
  const saved = Object.values(state.cueStudyDrafts!)[0];
  assert.deepEqual(saved.hiddenCueIds, ['a', 'c']);
  assert.equal(saved.selectedChoice, 1);
  assert.equal(saved.assessments.a, 'stable');
});

test('default navigation puts Schedule immediately before the study plan', async () => {
  const { NAVIGATION_ITEMS } = await import('../src/lib/navigation.ts');
  const learning = NAVIGATION_ITEMS.filter((item) => item.group === 'learning');
  assert.equal(learning[0].id, 'schedule');
  assert.equal(learning[1].id, 'study-plan');
});
