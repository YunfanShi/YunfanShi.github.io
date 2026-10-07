import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportStorage, verifyStorage, validateInventory } from '../scripts/export-supabase-storage.mjs';

const inventory = () => ({ format: 'jackyun-storage-inventory-v1', project: 'gdcwwlnzylrzrqhaaljq', buckets: [{ id: 'novel-files', public: false }], objects: [{ id: 'object-1', bucket: 'novel-files', path: '../../中文/book.txt', owner: 'user-1', size: 3, metadata: { mimetype: 'text/plain' } }] });
async function directory(t) {
  const parent = await mkdtemp(join(tmpdir(), 'jackyun-storage-test-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  return join(parent, 'backup');
}

test('original ownership, private visibility and arbitrary source paths survive a verified export', async t => {
  const destination = await directory(t);
  assert.deepEqual(await exportStorage(inventory(), destination, async () => Buffer.from('abc')), { objects: 1, bytes: 3 });
  assert.deepEqual(await verifyStorage(destination), { objects: 1, bytes: 3 });
  const manifest = JSON.parse(await readFile(join(destination, 'manifest.json')));
  assert.match(manifest.objects[0].file, /^[a-f0-9]{64}\.bin$/);
  assert.equal(manifest.objects[0].path, '../../中文/book.txt');
  assert.equal(manifest.objects[0].owner, 'user-1');
  assert.equal(manifest.buckets[0].public, false);
});

test('same-size corruption cannot pass checksum verification', async t => {
  const destination = await directory(t);
  await exportStorage(inventory(), destination, async () => Buffer.from('abc'));
  const manifest = JSON.parse(await readFile(join(destination, 'manifest.json')));
  await writeFile(join(destination, manifest.objects[0].file), 'xyz');
  await assert.rejects(verifyStorage(destination), /corrupted/);
});

test('missing downloads and unexpected sizes never produce a completed manifest', async t => {
  const destination = await directory(t);
  await assert.rejects(exportStorage(inventory(), destination, async () => Buffer.from('ab')), /size differs/);
  await assert.rejects(access(join(destination, 'manifest.json')));
  await assert.rejects(verifyStorage(destination));
});

test('earlier backups cannot be overwritten, including partial directories', async t => {
  const destination = await directory(t);
  await exportStorage(inventory(), destination, async () => Buffer.from('abc'));
  await assert.rejects(exportStorage(inventory(), destination, async () => Buffer.from('xyz')), { code: 'EEXIST' });
  assert.deepEqual(await verifyStorage(destination), { objects: 1, bytes: 3 });
});

test('duplicate objects, missing sizes, unknown buckets and redirected local paths fail closed', async t => {
  for (const modify of [value => value.objects.push(value.objects[0]), value => value.objects[0].size = null, value => value.objects[0].bucket = 'unknown']) {
    const value = inventory(); modify(value);
    assert.throws(() => validateInventory(value));
  }
  const destination = await directory(t);
  await exportStorage(inventory(), destination, async () => Buffer.from('abc'));
  const manifest = JSON.parse(await readFile(join(destination, 'manifest.json')));
  manifest.objects[0].file = '../outside.txt';
  await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(verifyStorage(destination), /mapping/);
});

test('removing a record or changing ownership cannot pass archive verification', async t => {
  const destination = await directory(t);
  await exportStorage(inventory(), destination, async () => Buffer.from('abc'));
  const manifest = JSON.parse(await readFile(join(destination, 'manifest.json')));
  manifest.objects[0].owner = 'another-user';
  await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(verifyStorage(destination), /mapping/);
  manifest.objects = [];
  await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(verifyStorage(destination), /does not match/);
});
