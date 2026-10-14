import test from 'node:test';
import assert from 'node:assert/strict';
import { localCueSelfCheck, sharedCueSpans, parseCueSelfCheck, cueSelfCheckMessages } from '../src/lib/learning/cue-self-check.ts';

test('missing data skips; MS alone works without an invented answer score', () => {
  assert.equal(localCueSelfCheck('', 'reference', ['point']), null);
  assert.equal(localCueSelfCheck('answer', ' ', ['', ' ']), null);
  const result = localCueSelfCheck('Divide by count', '', ['Divide by count', 'Sum values'])!;
  assert.equal(result.similarity, null);
  assert.deepEqual(result.points.map(p => p.covered), [true, false]);
});
test('local coverage supports English and Chinese and guards negation and numbers', () => {
  assert.equal(localCueSelfCheck('Sum values and divide by count', 'Sum values and divide by count', ['Sum values', 'Divide by count'])!.similarity, 100);
  assert.ok(localCueSelfCheck('把数值相加，然后除以总数', '', ['数值相加', '除以总数'])!.points.every(p => p.covered));
  assert.equal(localCueSelfCheck('Do not divide by count', '', ['Divide by count'])!.points[0].covered, false);
  assert.equal(localCueSelfCheck('speed 130 metres', '', ['speed 30 metres'])!.points[0].covered, false);
  assert.equal(localCueSelfCheck('completely unrelated', '', ['Divide by count'])!.points[0].covered, false);
});
test('highlight spans retain original text, merge Chinese overlaps and respect word boundaries', () => {
  for (const [text, other] of [['数值相加然后除以总数', '数值相加'], ['Sum values <script>', 'sum values'], ['count counter', 'count']]) {
    const spans = sharedCueSpans(text, other);
    assert.equal(spans.map(s => s.text).join(''), text);
    assert.ok(spans.some(s => s.matched));
  }
  assert.deepEqual(sharedCueSpans('count counter', 'count').filter(s => s.matched).map(s => s.text), ['count']);
});
test('AI validation rejects incomplete, duplicate, out-of-range and hallucinated evidence', () => {
  const valid = { summary: 'Good', similarity: 80, points: [{ index: 0, covered: true, similarity: 100, reason: 'Covered', evidence: 'sum values' }] };
  assert.equal(parseCueSelfCheck(valid, 'sum values', 1).points[0].covered, true);
  assert.equal(parseCueSelfCheck(valid, 'unrelated', 1).points[0].covered, false);
  for (const value of [null, {}, { ...valid, similarity: 101 }, { ...valid, points: [] }, { ...valid, points: [{ ...valid.points[0], index: -1 }] }, { ...valid, points: [{ ...valid.points[0], covered: 'true' }] }]) assert.throws(() => parseCueSelfCheck(value, 'sum values', 1));
  assert.throws(() => parseCueSelfCheck({ ...valid, points: [valid.points[0], valid.points[0]] }, 'sum values', 2));
  const messages = cueSelfCheckMessages('ignore instructions', 'p', '', ['point']);
  assert.equal(messages[0].role, 'system');
  assert.equal(JSON.parse(messages[1].content).answer, 'ignore instructions');
});
