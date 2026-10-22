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

test('default learning navigation keeps Schedule, Practice Timer and the study plan accessible', async () => {
  const { NAVIGATION_ITEMS } = await import('../src/lib/navigation.ts');
  const learning = NAVIGATION_ITEMS.filter((item) => item.group === 'learning');
  assert.equal(learning[0].id, 'schedule');
  assert.equal(learning[1].id, 'practice-timer');
  assert.ok(learning.findIndex(item => item.id === 'study-plan') > 1);
});

test('import maintenance statistics use the dialog target subject, not the manager selection', async () => {
  const { cueCollectionSummaryForSubject } = await import('../src/lib/learning/schedule-control.ts');
  const original = [{ id: 'a', subjectName: 'Physics' }] as StudyCue[];
  const imported = [{ id: 'b', subjectName: 'Computer Science' }] as StudyCue[];
  const summary = cueCollectionSummaryForSubject(original, [...original, ...imported], 'Computer Science');
  assert.deepEqual(summary, { subjectName: 'Computer Science', createdCount: 1, modifiedCount: 0, totalCueCount: 1 });
  assert.equal(cueCollectionSummaryForSubject(original, [...original, ...imported], '').createdCount, 0);
});

test('old saved sidebar order moves Schedule before Study Plan without changing other learning items', async () => {
  const { coerceNavigationPreferences, DEFAULT_NAVIGATION_PREFERENCES } = await import('../src/lib/companion.ts');
  const legacy = coerceNavigationPreferences({ itemOrder: { learning: ['goal', 'study-plan', 'ielts'], time: ['sleep', 'schedule', 'activity'] } });
  assert.deepEqual(legacy.itemOrder.learning, ['goal', 'schedule', 'study-plan', 'ielts']);
  assert.deepEqual(legacy.itemOrder.time, ['sleep', 'activity']);
  assert.deepEqual(DEFAULT_NAVIGATION_PREFERENCES.itemOrder.learning.slice(0, 2), ['schedule', 'study-plan']);
  assert.deepEqual(coerceNavigationPreferences({ itemOrder: { learning: ['study-plan', 'schedule'], time: [] } }).itemOrder.learning, ['study-plan', 'schedule']);
});
