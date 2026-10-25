import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { APP_VERSION } from '../src/lib/utils.ts';
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
    // A small published patch may have one or two meaningful highlights.
    assert.ok(entry.highlights.length >= 1);
    assert.ok(entry.highlights.every((highlight) => highlight.trim().length > 0));
    assert.ok(entry.categories.every((category) => UPDATE_CATEGORIES.includes(category)));
  }
});

test('published package, client diagnostics, and latest update share one version', async () => {
  const manifest = JSON.parse(await readFile(new URL('package.json', projectDir), 'utf8')) as { version: string };
  assert.equal(APP_VERSION, manifest.version);
  assert.equal(UPDATE_HISTORY[0].version, manifest.version);
});

test('update route uses the native showcase instead of the legacy iframe', async () => {
  const source = await readFile(new URL('src/app/(portal)/update/page.tsx', projectDir), 'utf8');
  assert.match(source, /UpdateShowcase/);
  assert.doesNotMatch(source, /LegacyFrame|UpdateHub\.html/);
});
