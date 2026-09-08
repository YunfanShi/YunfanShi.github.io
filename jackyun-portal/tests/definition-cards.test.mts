import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefinitionCard, dueDefinitionCards, parseDefinitionCards, scheduleDefinitionCard } from '../src/lib/definition-cards.ts';

test('parses the preferred colon and dash definition formats', () => {
  assert.deepEqual(parseDefinitionCards('Drawing object: Contains XXX\nCanvas - Contains shapes\nLayer — Groups objects'), [
    { term: 'Drawing object', definition: 'Contains XXX', note: '' },
    { term: 'Canvas', definition: 'Contains shapes', note: '' },
    { term: 'Layer', definition: 'Groups objects', note: '' },
  ]);
});

test('parses header-based CSV, TSV, and JSON aliases', () => {
  assert.deepEqual(parseDefinitionCards('term,definition,note\n"Drawing object","Contains shapes, text","Core"'), [
    { term: 'Drawing object', definition: 'Contains shapes, text', note: 'Core' },
  ]);
  assert.equal(parseDefinitionCards('front\tback\nCanvas\tContains drawing objects')[0].term, 'Canvas');
  assert.equal(parseDefinitionCards('[{"concept":"Layer","meaning":"Groups objects"}]')[0].definition, 'Groups objects');
});

test('skips malformed rows and removes exact duplicates', () => {
  assert.deepEqual(parseDefinitionCards('No separator\nTerm: Definition\nterm: definition'), [
    { term: 'Term', definition: 'Definition', note: '' },
  ]);
});

test('keeps commas inside line-based definitions', () => {
  assert.deepEqual(parseDefinitionCards('Drawing object: Contains shapes, text and images'), [
    { term: 'Drawing object', definition: 'Contains shapes, text and images', note: '' },
  ]);
});

test('review ratings schedule due dates and reset forgotten cards', () => {
  const now = new Date('2026-09-08T00:00:00.000Z');
  const card = createDefinitionCard({ term: 'Object', definition: 'A thing', note: '' }, now);
  const good = scheduleDefinitionCard(card, 'good', now);
  assert.equal(good.intervalDays, 1);
  assert.equal(good.dueAt, '2026-09-09T00:00:00.000Z');
  const again = scheduleDefinitionCard(good, 'again', now);
  assert.equal(again.dueAt, '2026-09-08T00:10:00.000Z');
  assert.equal(again.lapses, 1);
  assert.deepEqual(dueDefinitionCards([good, card], now).map((item) => item.id), [card.id]);
});
