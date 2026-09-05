import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { boundedByteRange, isValidBvid, normalizeFnval, normalizeQn, validateBilibiliCdnUrl } from '../src/lib/bilibili-security.ts';
import { threeWayMerge } from '../src/lib/sync/merge.ts';
import { canonicalJson } from '../src/lib/sync/hash.ts';
import { buildSyncRequest, compactSyncOperations } from '../src/lib/sync/batch.ts';
import { isSyncableStorageKey } from '../src/lib/local-workspace.ts';

test('canonical JSON is stable across object key order', () => {
  assert.equal(canonicalJson({ b: 2, a: { d: 4, c: 3 } }), canonicalJson({ a: { c: 3, d: 4 }, b: 2 }));
});

test('three-way merge combines independent object changes', () => {
  assert.deepEqual(threeWayMerge({ a: 1, b: 1 }, { a: 2, b: 1 }, { a: 1, b: 3 }), { merged: { a: 2, b: 3 }, conflicts: [] });
});

test('three-way merge preserves local data and reports same-field conflicts', () => {
  assert.deepEqual(threeWayMerge({ value: 1 }, { value: 2 }, { value: 3 }), { merged: { value: 2 }, conflicts: ['$.value'] });
});

test('stable-id arrays merge records while anonymous arrays conflict', () => {
  const merged = threeWayMerge([{ id: 'a', x: 1 }, { id: 'b', x: 1 }], [{ id: 'a', x: 2 }, { id: 'b', x: 1 }], [{ id: 'a', x: 1 }, { id: 'b', x: 3 }]);
  assert.deepEqual(merged, { merged: [{ id: 'a', x: 2 }, { id: 'b', x: 3 }], conflicts: [] });
  assert.deepEqual(threeWayMerge([1], [2], [3]).conflicts, ['$']);
});

test('delete and edit is preserved as an explicit conflict', () => {
  assert.deepEqual(threeWayMerge({ value: 1 }, undefined, { value: 2 }), { merged: undefined, conflicts: ['$'] });
});

test('sync batches deduplicate keys while preserving the oldest base and newest value', () => {
  const first = { id: '00000000-0000-4000-8000-000000000001', key: 'study', baseRevision: 2, baseHash: 'a'.repeat(64), baseValue: { value: 1 }, value: { value: 2 }, deleted: false, clientUpdatedAt: '2026-09-04T00:00:00.000Z' };
  const latest = { ...first, id: '00000000-0000-4000-8000-000000000002', baseRevision: 3, baseHash: 'b'.repeat(64), baseValue: { value: 2 }, value: { value: 4 }, clientUpdatedAt: '2026-09-04T00:01:00.000Z' };
  const middle = { ...latest, id: '00000000-0000-4000-8000-000000000003', value: { value: 3 }, clientUpdatedAt: '2026-09-04T00:00:30.000Z' };
  assert.deepEqual(compactSyncOperations([latest, middle, first]), [{ ...latest, id: first.id, baseRevision: first.baseRevision, baseHash: first.baseHash, baseValue: first.baseValue }]);
});

test('sync request batching stays below the server byte and operation limits', () => {
  const operations = Array.from({ length: 120 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    key: `key-${index}`,
    baseRevision: 0,
    baseHash: null,
    baseValue: null,
    value: 'x'.repeat(20_000),
    deleted: false,
    clientUpdatedAt: '2026-09-04T00:00:00.000Z',
  }));
  const request = buildSyncRequest('00000000-0000-4000-8000-000000000999', { name: 'Browser', platform: 'web' }, operations);
  assert.ok(request.operations.length > 0 && request.operations.length <= 100);
  assert.ok(new TextEncoder().encode(request.body).byteLength <= 900_000);
  assert.deepEqual(JSON.parse(request.body).operations, request.operations);
});

test('Bilibili validation blocks SSRF and bounds media ranges', () => {
  assert.equal(isValidBvid('BV1xx411c7mD'), true);
  assert.equal(isValidBvid('not-a-bvid'), false);
  assert.equal(validateBilibiliCdnUrl('https://cn-gotcha01.bilivideo.com/video.m4s')?.hostname, 'cn-gotcha01.bilivideo.com');
  assert.equal(validateBilibiliCdnUrl('https://bilivideo.com.evil.example/video'), null);
  assert.equal(validateBilibiliCdnUrl('http://cn-gotcha01.bilivideo.com/video'), null);
  assert.equal(validateBilibiliCdnUrl('https://user@cn-gotcha01.bilivideo.com/video'), null);
  assert.equal(boundedByteRange('bytes=20-99999999', 100), 'bytes=20-119');
  assert.equal(normalizeQn('999'), '80');
  assert.equal(normalizeFnval('evil'), '4048');
});

test('security migration uses tenant RLS and restricted RPC grants', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260902021137_secure_sync_v2.sql', import.meta.url), 'utf8');
  assert.match(sql, /with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /p_base_hash text/i);
  assert.match(sql, /local_deleted boolean[\s\S]+remote_deleted boolean/i);
  assert.match(sql, /where n\.nspname = 'public' and p\.prosecdef/i);
  assert.match(sql, /select unnest\(array\[/i);
  assert.match(sql, /revoke all on function public\.apply_web_sync_operation[\s\S]+from public, anon/i);
  assert.match(sql, /delete from public\.answer_sheet_broadcasts where user_id is null/i);
  assert.doesNotMatch(sql, /delete from public\.answer_sheet_broadcasts\s*;/i);
  assert.doesNotMatch(sql, /auth\.role\(\)/i);
});

test('legacy iframe bridge cannot bypass the durable v2 outbox', async () => {
  const source = await readFile(new URL('../src/components/modules/legacy-bridge.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(['"]\/api\/legacy-sync/);
  assert.match(source, /storage-set\/storage-remove are intentionally ignored/);
});

test('answer-sheet sync has no service-role fallback and authenticates every method', async () => {
  const source = await readFile(new URL('../src/app/api/answer-sheet-sync/route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.equal((source.match(/if \(!context\.user\)/g) ?? []).length, 3);
});

test('web sync writes use bounded concurrency instead of a serial database waterfall', async () => {
  const source = await readFile(new URL('../src/app/api/sync/v2/route.ts', import.meta.url), 'utf8');
  assert.match(source, /const DATABASE_CONCURRENCY = 8/);
  assert.match(source, /mapWithConcurrency\(body\.operations/);
  assert.match(source, /DUPLICATE_KEYS/);
});

test('automatic sync excludes its timestamp ledger and removes manual conflict choices', async () => {
  assert.equal(isSyncableStorageKey('jackyun_sync_timestamps'), false);
  assert.equal(isSyncableStorageKey('jackyun_goal_data'), true);
  const panel = await readFile(new URL('../src/components/settings/sync-center-panel.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(panel, /保留本机|保留云端|提交编辑结果|待处理冲突/);
  assert.match(panel, /冲突自动处理/);
});

test('sync migration normalizes legacy JSON and resolves concurrent edits by per-key time', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260905085645_automatic_web_sync_lww.sql', import.meta.url), 'utf8');
  assert.match(sql, /client_updated_at timestamptz/i);
  assert.match(sql, /normalize_web_sync_value/i);
  assert.match(sql, /effective_updated_at > current_record\.client_updated_at/i);
  assert.match(sql, /status', 'remote'/i);
  assert.doesNotMatch(sql, /insert into public\.sync_conflicts/i);
  assert.match(sql, /update public\.sync_conflicts set resolved_at = now\(\)/i);
  const legacyRoute = await readFile(new URL('../src/app/api/legacy-sync/route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(legacyRoute, /storageValueToString/);
});

test('topbar avatar bypasses the image proxy and falls back after a load error', async () => {
  const source = await readFile(new URL('../src/components/auth/user-avatar.tsx', import.meta.url), 'utf8');
  assert.match(source, /unoptimized/);
  assert.match(source, /onError=\{\(\) => setFailedUrl\(avatarUrl\)\}/);
  assert.match(source, /alt=""/);
});
