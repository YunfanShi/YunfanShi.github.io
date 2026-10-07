import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { importStorageDownloads } from '../scripts/import-storage-downloads.mjs';
import { verifyStorage } from '../scripts/export-supabase-storage.mjs';

const inventory = { format: 'jackyun-storage-inventory-v1', project: 'gdcwwlnzylrzrqhaaljq', buckets: [{ id: 'avatars', public: true }, { id: 'novel-files', public: false }], objects: [{ id: 'a', bucket: 'avatars', path: 'user/file.txt', size: 3, owner: 'a' }, { id: 'b', bucket: 'novel-files', path: 'user/file.txt', size: 3, owner: 'b' }] };
async function archive(bucket, path = 'user/file.txt', bytes = 'abc') {
  const zip = new JSZip(); zip.file(path, bytes);
  return { bucket, bytes: await zip.generateAsync({ type: 'nodebuffer' }) };
}

test('same path in different buckets remains separate and all file bytes verify', async t => {
  const root = await mkdtemp(join(tmpdir(), 'jackyun-downloads-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destination = join(root, 'backup');
  assert.deepEqual(await importStorageDownloads(inventory, destination, [await archive('avatars'), await archive('novel-files')]), { objects: 2, bytes: 6 });
  assert.deepEqual(await verifyStorage(destination), { objects: 2, bytes: 6 });
});

test('missing, duplicate, unknown and unsafe entries cannot create a backup', async () => {
  for (const archives of [
    [await archive('avatars')],
    [await archive('avatars'), await archive('avatars'), await archive('novel-files')],
    [await archive('unknown')],
    [await archive('avatars', '../user/file.txt'), await archive('novel-files')],
    [await archive('avatars', 'extra.txt'), await archive('novel-files')],
  ]) await assert.rejects(importStorageDownloads(inventory, 'must-not-be-created', archives));
});

test('invalid ZIP CRC is rejected before producing backup files', async () => {
  const item = await archive('avatars');
  const marker = item.bytes.indexOf(Buffer.from('abc'));
  assert.ok(marker >= 0); item.bytes[marker] ^= 1;
  await assert.rejects(importStorageDownloads(inventory, 'must-not-be-created', [item, await archive('novel-files')]));
});
