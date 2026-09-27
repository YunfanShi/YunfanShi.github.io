import test from 'node:test';
import assert from 'node:assert/strict';
import { cueAnalysisKey, cueRatingCandidates, ratingCategory } from '../src/lib/learning/cue-rating.ts';
import { cueContentSignature } from '../src/lib/learning/learning-assistance.ts';
import type { StudyCue } from '../src/lib/learning/schedule-control.ts';
const at = '2026-09-27T08:00:00.000Z';
const cue: StudyCue = { id: 'c1', subjectId: 'math', subjectName: 'Math', unit: 'Indices', subsection: '', type: 'formula', prompt: '写出乘方运算规则', markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: at, updatedAt: at };
const rated = { ...cue, aiAdvice: { signature: cueContentSignature(cue), difficulty: 'easy' as const, reason: '明确基本规则', generatedAt: at } };
test('manual rerating includes already-rated Cues and ignores stale or repeated queue IDs', () => {
  assert.deepEqual(cueRatingCandidates([rated], [], new Set(), new Set()), []);
  const forced = new Set([cue.id, 'deleted']);
  assert.equal(cueRatingCandidates([rated], [], forced, new Set([cueAnalysisKey(rated, [])])).length, 1);
  assert.equal(cueRatingCandidates([rated, ...Array.from({ length: 15 }, (_, index) => ({ ...cue, id: `pending${index}` }))], [], forced, new Set()).length, 10);
  assert.equal(cueRatingCandidates([rated, cue], [], new Set(), new Set([cueAnalysisKey(cue, [])])).length, 0);
});
test('status distinguishes stale content, in-flight phases and failed rerating with a preserved result', () => {
  assert.equal(ratingCategory(cue, []), 'pending');
  assert.equal(ratingCategory(rated, []), 'rated');
  assert.equal(ratingCategory({ ...rated, prompt: 'changed' }, []), 'pending');
  for (const phase of ['queued', 'sending', 'waiting', 'reading', 'validating'] as const) assert.equal(ratingCategory(rated, [], { phase, updatedAt: at }), 'active');
  assert.equal(ratingCategory(rated, [], { phase: 'failed', updatedAt: at, error: 'offline' }), 'failed');
  assert.equal(rated.aiAdvice.difficulty, 'easy');
});
