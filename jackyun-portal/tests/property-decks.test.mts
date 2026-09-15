import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePropertyDeck, propertyPrompts } from '../src/lib/property-decks.ts';

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
