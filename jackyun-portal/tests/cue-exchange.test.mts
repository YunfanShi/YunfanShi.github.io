import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCueExchangeOperations, createCueExchangeBundle, cueExchangeChangedFields, matchCueExchange, parseCueExchangeBundle } from '../src/lib/learning/cue-exchange.ts';
import { applyCueBulkOperations, type StudyCue } from '../src/lib/learning/schedule-control.ts';

const cue = (id: string, prompt = 'Printer setup'): StudyCue => ({ id, subjectId: 'ict', subjectName: 'ICT', unit: 'Devices', subsection: '', prompt, subtitle: '', answer: 'Steps', type: 'process', display: 'stepwise', markingPoints: ['Load paper', 'Print'], status: 'partial', intervalDays: 2, easeFactor: 2.3, streak: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' });

test('exchange bundle includes export date and cue revision metadata', () => {
  const bundle = createCueExchangeBundle([cue('a')], '2026-11-02T00:00:00.000Z');
  const parsed = parseCueExchangeBundle(JSON.stringify(bundle));
  assert.equal(parsed.exportedAt, '2026-11-02T00:00:00.000Z');
  assert.equal(parsed.cues[0].updatedAt, '2026-10-01T00:00:00.000Z');
  assert.equal(parsed.cues[0].display, 'stepwise');
});

test('matching uses ID first, then a unique normalized content match, and flags ambiguous matches', () => {
  const local = [cue('id-match', 'Changed prompt'), cue('one', 'Same prompt'), cue('two', 'Same prompt')];
  const result = matchCueExchange([cue('id-match', 'Incoming content'), cue('external', ' Same  prompt '), cue('new-id', 'Other')], local);
  assert.equal(result[0].match, 'id');
  assert.equal(result[0].local?.id, 'id-match');
  assert.equal(result[1].match, 'ambiguous');
  assert.equal(result[1].candidates.length, 2);
  assert.equal(result[2].match, 'new');
});

test('content diff excludes learning progress fields', () => {
  const local = cue('same');
  const incoming = { ...local, answer: 'Updated answer', status: 'stable' as const, updatedAt: '2026-11-01T00:00:00.000Z' };
  assert.deepEqual(cueExchangeChangedFields(local, incoming), ['answer']);
});

test('malformed and duplicate-ID exchange bundles are rejected', () => {
  assert.throws(() => parseCueExchangeBundle('{'), /有效的 JSON/);
  const data = createCueExchangeBundle([cue('same'), cue('same')]);
  assert.throws(() => parseCueExchangeBundle(JSON.stringify(data)), /ID 重复/);
});


test('AI-guided and plain exports can both be pasted back as JSON', () => {
  const plain = createCueExchangeBundle([cue('a')]);
  const guided = createCueExchangeBundle([cue('a')], plain.exportedAt, { includePrompt: true });
  assert.equal(Object.hasOwn(plain, 'aiPrompt'), false);
  assert.match(guided.aiPrompt ?? '', /jackyun-cue-exchange/);
  assert.match(guided.aiPrompt ?? '', /correctChoice/);

  const fenced = '\uFEFF```json\n' + JSON.stringify(guided) + '\n```';
  assert.deepEqual(parseCueExchangeBundle(fenced), plain);
});

test('pasted JSON rejects invalid editable field types before it can become a preview', () => {
  for (const invalid of [{ answer: { malformed: true } }, { subsection: 42 }, { choices: ['A', false], correctChoice: 0, type: 'multiple-choice' }]) {
    const bundle = createCueExchangeBundle([cue('a')]);
    assert.throws(() => parseCueExchangeBundle(JSON.stringify({ ...bundle, cues: [{ ...bundle.cues[0], ...invalid }] })), /第 1 张 CUE/);
  }
});

test('selected content updates keep omitted fields and local progress while saving deep understanding', () => {
  const local = { ...cue('a'), nextReviewDate: '2026-11-21', source: 'Course notes' };
  const incoming = {
    ...cue('a'),
    subtitle: undefined,
    answer: '',
    deepUnderstanding: { principle: { question: 'Why?', answer: 'Because.' } },
    status: 'stable' as const,
    nextReviewDate: '2027-01-01',
  };
  assert.deepEqual(cueExchangeChangedFields(local, incoming), ['deepUnderstanding', 'answer']);
  const operations = buildCueExchangeOperations([{ incoming, selectedLocalId: 'a', action: 'update' }], new Map([['a', local]]));
  const [updated] = applyCueBulkOperations([local], operations, () => { throw new Error('Unexpected create'); }, '2026-11-19T00:00:00Z');
  assert.equal(updated.id, local.id);
  assert.equal(updated.answer, '');
  assert.equal(updated.source, 'Course notes');
  assert.equal(updated.nextReviewDate, '2026-11-21');
  assert.equal(updated.status, 'partial');
  assert.deepEqual(updated.deepUnderstanding, incoming.deepUnderstanding);
});

test('creating from exchange preserves the chapter and drops external learning progress', () => {
  const incoming = { ...cue('a'), subsection: 'Paper', source: 'Course notes' };
  const [created] = buildCueExchangeOperations([{ incoming, selectedLocalId: '', action: 'add' }], new Map());
  assert.equal(created.action, 'create');
  assert.equal(created.subsection, 'Paper');
  assert.equal(created.source, 'Course notes');
  assert.equal(Object.hasOwn(created, 'id'), false);
  assert.equal(Object.hasOwn(created, 'status'), false);
  assert.equal(Object.hasOwn(created, 'intervalDays'), false);
});

test('two external selections cannot silently overwrite the same local card', () => {
  const local = cue('a');
  const selections = ['a', 'external-a'].map((id) => ({ incoming: { ...cue(id), answer: id }, selectedLocalId: 'a', action: 'update' as const }));
  assert.throws(() => buildCueExchangeOperations(selections, new Map([['a', local]])), /同一张本地 CUE/);
});
