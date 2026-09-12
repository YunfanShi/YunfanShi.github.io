import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const panelSource = await readFile(new URL('../src/components/admin/content-library-panel.tsx', import.meta.url), 'utf8');
const actionSource = await readFile(new URL('../src/actions/reader-admin.ts', import.meta.url), 'utf8');

test('admin novel upload is guarded against duplicate submissions', () => {
  assert.match(panelSource, /if \(uploadLock\.current\) return;/u);
  assert.match(panelSource, /uploadLock\.current = true; setUploading\(true\)/u);
  assert.match(panelSource, /type="submit" disabled=\{uploading\}/u);
});

test('admin novel deletion removes catalog data and uploaded storage objects', () => {
  assert.match(actionSource, /export async function deleteCatalogNovel/u);
  assert.match(actionSource, /from\('novel_catalog'\)\.delete\(\)\.eq\('id', id\)/u);
  assert.match(actionSource, /storage\.from\('novel-files'\)\.remove\(paths\)/u);
  assert.match(panelSource, /window\.confirm/u);
});

test('admin can update store metadata and access controls', () => {
  for (const fieldName of ['title', 'author', 'description', 'language', 'minimum_plan', 'featured', 'enabled']) {
    assert.ok(actionSource.includes(fieldName), `missing managed field: ${fieldName}`);
  }
});
