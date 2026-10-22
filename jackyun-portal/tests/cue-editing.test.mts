import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyCueBulkOperations, parseCueBulkImport, type StudyCue } from '../src/lib/learning/schedule-control.ts';

const original: StudyCue = { id: 'existing', subjectId: 'physics', subjectName: 'Physics', unit: 'Mechanics', subsection: 'Old chapter', prompt: 'Old prompt', subtitle: 'Old description', answer: 'Old answer', type: 'definition', display: 'definition-card', markingPoints: ['Old marking point'], version: 3, status: 'partial', intervalDays: 5, easeFactor: 2.4, streak: 2, lastReviewedAt: '2026-09-25T00:00:00Z', nextReviewDate: '2026-09-30', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' };

test('manual editor updates all content fields without replacing identity or learning history', () => {
  const operations = parseCueBulkImport({ version: 1, operations: [{ action: 'update', id: original.id, subjectName: 'Mathematics', unit: 'Algebra', subsection: 'Powers', prompt: 'a^0 = 1', subtitle: '', answer: '', markingPoints: ['Nonzero a'], type: 'multiple-choice', display: 'multiple-choice', choices: ['0', '1'], correctChoice: 1 }] }).operations;
  const [edited] = applyCueBulkOperations([original], operations, () => { throw new Error('Editing must not create a Cue'); }, '2026-09-26T00:00:00Z');
  assert.equal(edited.id, original.id);
  assert.equal(edited.version, 4);
  assert.equal(edited.subjectName, 'Mathematics');
  assert.equal(edited.unit, 'Algebra');
  assert.equal(edited.subsection, 'Powers');
  assert.equal(edited.prompt, 'a^0 = 1');
  assert.equal(edited.subtitle, '');
  assert.equal(edited.answer, '');
  assert.deepEqual(edited.markingPoints, ['Nonzero a']);
  assert.deepEqual(edited.choices, ['0', '1']);
  assert.equal(edited.correctChoice, 1);
  for (const key of ['status', 'intervalDays', 'easeFactor', 'streak', 'lastReviewedAt', 'nextReviewDate', 'createdAt'] as const) assert.equal(edited[key], original[key]);
});

test('invalid choice edits fail before changing an existing Cue', () => {
  assert.throws(() => parseCueBulkImport({ version: 1, operations: [{ action: 'update', id: original.id, type: 'multiple-choice', choices: ['only choice'], correctChoice: 0 }] }), /2–6/);
  assert.equal(original.version, 3);
});

test('editing without content changes retains version and review history', () => {
  const operations = parseCueBulkImport({ version: 1, operations: [{ action: 'update', id: original.id, prompt: original.prompt }] }).operations;
  assert.equal(applyCueBulkOperations([original], operations, () => original, '2026-09-26T00:00:00Z')[0], original);
});

test('list edit action reuses the form, preserves subject identity and supports cancel', () => {
  const source = readFileSync(new URL('../src/components/modules/schedule/schedule-control.tsx', import.meta.url), 'utf8');
  assert.match(source, /onEdit=\{editCue\}/);
  assert.match(source, /编辑 Cue/);
  assert.match(source, /editingId \? '保存修改' : '添加 Cue'/);
  assert.match(source, /取消编辑/);
  assert.match(source, /subjectId: selectedSubjectConfig\?\.id \?\? subjectIdFromName\(subjectName\)/);
  assert.match(source, /name="cuePrompt"/);
});
