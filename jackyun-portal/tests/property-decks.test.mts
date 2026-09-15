import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePropertyDeck, parsePropertyDeckImport, propertyPrompts, propertyRowOptions } from '../src/lib/property-decks.ts';

test('normalizes table rows to the item column count', () => {
  const deck = normalizePropertyDeck({ id: 'one', title: 'Waves', items: ['Radio', 'Microwave'], properties: [{ id: 'frequency', label: 'Frequency', values: ['Low'] }] });
  assert.ok(deck);
  assert.deepEqual(deck.properties[0].values, ['Low', '']);
});

test('creates row-major study prompts and keeps table coordinates', () => {
  const deck = normalizePropertyDeck({ id: 'one', title: 'Waves', items: ['Radio', 'Microwave'], properties: [{ id: 'frequency', label: 'Frequency', values: ['Low', 'High'] }, { id: 'range', label: 'Range', values: ['Long', 'Line of sight'] }] });
  assert.ok(deck);
  assert.deepEqual(propertyPrompts(deck).map(({ property, item, answer }) => [property, item, answer]), [
    ['Frequency', 'Radio', 'Low'],
    ['Frequency', 'Microwave', 'High'],
    ['Range', 'Radio', 'Long'],
    ['Range', 'Microwave', 'Line of sight'],
  ]);
});

test('creates second-stage choices from the current row only', () => {
  const deck = normalizePropertyDeck({ id: 'one', title: 'Waves', items: ['Radio', 'Microwave', 'Infrared'], properties: [{ id: 'frequency', label: 'Frequency', values: ['Low', 'High', 'High'] }, { id: 'range', label: 'Range', values: ['Long', 'Line of sight', 'Short'] }] });
  assert.ok(deck);
  assert.deepEqual(propertyRowOptions(deck, 0), ['Low', 'High']);
  assert.deepEqual(propertyRowOptions(deck, 1), ['Long', 'Line of sight', 'Short']);
});

test('parses the documented property table format', () => {
  const result = parsePropertyDeckImport('@title: Waves\n@items: Radio | Microwave | Infrared\nFrequency: Low | Medium | High\nRange: Long | Line of sight | Short');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.draft, {
    title: 'Waves',
    items: ['Radio', 'Microwave', 'Infrared'],
    properties: [
      { label: 'Frequency', values: ['Low', 'Medium', 'High'] },
      { label: 'Range', values: ['Long', 'Line of sight', 'Short'] },
    ],
  });
});

test('rejects property rows with the wrong number of values', () => {
  const result = parsePropertyDeckImport('@title: Waves\n@items: Radio | Microwave | Infrared\nFrequency: Low | High');
  assert.equal(result.draft, null);
  assert.match(result.errors[0], /2 个值.*3 个/u);
});
