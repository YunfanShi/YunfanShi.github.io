import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UPDATE_CATEGORIES, UPDATE_HISTORY } from '../src/lib/update-history.ts';

const projectDir = new URL('../', import.meta.url);

test('update history stays ordered, unique, and fully categorized', () => {
  assert.ok(UPDATE_HISTORY.length >= 5);
  assert.equal(UPDATE_HISTORY.filter((entry) => entry.featured).length, 1);
  assert.equal(new Set(UPDATE_HISTORY.map((entry) => entry.version)).size, UPDATE_HISTORY.length);

  for (let index = 1; index < UPDATE_HISTORY.length; index += 1) {
    assert.ok(UPDATE_HISTORY[index - 1].date >= UPDATE_HISTORY[index].date);
  }

  for (const entry of UPDATE_HISTORY) {
    assert.ok(entry.highlights.length >= 3);
    assert.ok(entry.categories.every((category) => UPDATE_CATEGORIES.includes(category)));
  }
});

test('update route uses the native showcase instead of the legacy iframe', async () => {
  const source = await readFile(new URL('src/app/(portal)/update/page.tsx', projectDir), 'utf8');
  assert.match(source, /UpdateShowcase/);
  assert.doesNotMatch(source, /LegacyFrame|UpdateHub\.html/);
});
