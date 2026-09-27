import test from 'node:test';
import assert from 'node:assert/strict';
import { CUE_RATING_BATCH_SIZE, cueAnalysisKey, cueRatingCandidates, parseCueRatingBatch, planCueRatingRetries, ratingProgressRows, ratingCategory } from '../src/lib/learning/cue-rating.ts';
import { cueContentSignature } from '../src/lib/learning/learning-assistance.ts';
import type { StudyCue } from '../src/lib/learning/schedule-control.ts';
const at = '2026-09-27T08:00:00.000Z';
const cue: StudyCue = { id: 'c1', subjectId: 'math', subjectName: 'Math', unit: 'Indices', subsection: '', type: 'formula', prompt: '写出乘方运算规则', markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: at, updatedAt: at };
const rated = { ...cue, aiAdvice: { signature: cueContentSignature(cue), difficulty: 'easy' as const, reason: '明确基本规则', generatedAt: at } };
test('manual rerating includes already-rated Cues and ignores stale or repeated queue IDs', () => {
  assert.deepEqual(cueRatingCandidates([rated], [], new Set(), new Set()), []);
  const forced = new Set([cue.id, 'deleted']);
  assert.equal(cueRatingCandidates([rated], [], forced, new Set([cueAnalysisKey(rated, [])])).length, 1);
  assert.equal(cueRatingCandidates([rated, ...Array.from({ length: 15 }, (_, index) => ({ ...cue, id: `pending${index}` }))], [], forced, new Set()).length, CUE_RATING_BATCH_SIZE);
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

test('progress list prioritizes current requests and failures and excludes unrelated rated history', () => {
  const cues = [rated, { ...cue, id: 'pending' }, { ...rated, id: 'completed' }, { ...cue, id: 'failed' }, { ...cue, id: 'queued' }, { ...cue, id: 'running' }];
  const jobs = { completed: { phase: 'rated' as const, updatedAt: at }, failed: { phase: 'failed' as const, updatedAt: at }, queued: { phase: 'queued' as const, updatedAt: at }, running: { phase: 'waiting' as const, updatedAt: at } };
  // Use valid signatures for both previously rated entries.
  cues[2].aiAdvice = { ...rated.aiAdvice, signature: cueContentSignature(cues[2]) };
  assert.deepEqual(ratingProgressRows(cues, [], jobs).map((item) => item.id), ['running', 'failed', 'queued', 'pending', 'completed']);
  assert.deepEqual(ratingProgressRows([], [], jobs), []);
});

test('partial batch preserves valid rows, rejects invented/duplicate IDs and isolates invalid difficulty', () => {
  const batch = Array.from({ length: 10 }, (_, index) => ({ ...cue, id: `c${index}` }));
  const rows = batch.slice(0, 5).map((item) => ({ id: item.id, difficulty: 'medium', reason: 'Evidence', skill: 'compare' }));
  const parsed = parseCueRatingBatch({ cues: rows, daily: { batchLimit: 2, reason: 'Unrequested' } }, batch, at, false);
  assert.equal(Object.keys(parsed.cues).length, 5);
  assert.deepEqual(Object.keys(parsed.failed), ['c5', 'c6', 'c7', 'c8', 'c9']);
  assert.equal(parsed.daily, undefined);
  assert.throws(() => parseCueRatingBatch({ cues: [...rows, rows[0]] }, batch, at, false), /重复/);
  assert.throws(() => parseCueRatingBatch({ cues: [...rows, { id: 'invented' }] }, batch, at, false), /无效/);
  const invalid = parseCueRatingBatch({ cues: [{ ...rows[0], difficulty: 'imaginary' }, rows[1]] }, batch.slice(0, 2), at, true);
  assert.ok(invalid.cues.c1);
  assert.ok(invalid.failed.c0);
  assert.ok(invalid.dailyError);
});

test('automatic retries only include failed items, stop after two follow-ups and ignore deletions', () => {
  const batch = Array.from({ length: 3 }, (_, index) => ({ ...cue, id: `c${index}` }));
  const attempts = new Map<string, number>();
  for (let index = 0; index < 2; index += 1) assert.deepEqual(planCueRatingRetries(['c1', 'deleted'], batch, [], attempts), { retry: ['c1'], exhausted: [] });
  assert.deepEqual(planCueRatingRetries(['c1'], batch, [], attempts), { retry: [], exhausted: ['c1'] });
  assert.deepEqual(planCueRatingRetries(['c1'], [{ ...batch[1], prompt: 'Edited' }], [], attempts), { retry: ['c1'], exhausted: [] });
  assert.equal(CUE_RATING_BATCH_SIZE, 3);
  assert.equal(cueRatingCandidates(batch, [], new Set(), new Set()).length, 3);
});
