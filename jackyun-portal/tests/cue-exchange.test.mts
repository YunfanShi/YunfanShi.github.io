import test from 'node:test';
import assert from 'node:assert/strict';
import { createCueExchangeBundle, cueExchangeChangedFields, matchCueExchange, parseCueExchangeBundle } from '../src/lib/learning/cue-exchange.ts';
import type { StudyCue } from '../src/lib/learning/schedule-control.ts';

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
