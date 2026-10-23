import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyncRunGate } from '../src/lib/sync/run-gate.ts';
import { fetchSyncWithTimeout } from '../src/lib/request-timeout.ts';
import { splitSyncBody, joinSyncParts } from '../src/lib/sync/transfer.ts';
import { buildSyncRequest } from '../src/lib/sync/batch.ts';
import { announceSyncStatus, getLatestSyncStatus } from '../src/lib/sync/status.ts';

test('manual requests during a running sync coalesce into one subsequent run', () => {
  const gate = createSyncRunGate();
  assert.equal(gate.begin(false), true);
  assert.equal(gate.begin(false), false);
  assert.equal(gate.begin(true), false);
  assert.equal(gate.begin(true), false);
  assert.equal(gate.finish(), true);
  assert.equal(gate.begin(true), true);
  assert.equal(gate.finish(), false);
});

test('sync client outlasts the 45-second proxy deadline and retains caller cancellation', async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = (ms) => { assert.equal(ms, 60_000); return new AbortController().signal; };
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.signal?.aborted, true);
    throw init?.signal?.reason;
  };
  try {
    const controller = new AbortController(); controller.abort(new Error('cancelled'));
    await assert.rejects(fetchSyncWithTimeout('https://example.com', { signal: controller.signal }), /cancelled/);
  } finally { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; }
});

test('smaller chunks preserve Unicode while maximum payload stays within 200 database parts', () => {
  const body = JSON.stringify({ text: '中文📚'.repeat(40_000) });
  const parts = splitSyncBody(body);
  assert.ok(parts.every((part) => atob(part).length <= 60_000));
  assert.deepEqual(joinSyncParts(parts), JSON.parse(body));
  const maximum = splitSyncBody('x'.repeat(24_000_000));
  assert.equal(maximum.length, 200);
  assert.ok(maximum.every((part) => atob(part).length <= 120_000));
});

test('smaller request batches can drain all operations without dropping any', () => {
  const pending = Array.from({ length: 27 }, (_, i) => ({ id: `${i}`, key: `key-${i}`, value: 'x'.repeat(35_000), clientUpdatedAt: new Date(0).toISOString(), baseRevision: 0, baseHash: null, baseValue: null, deleted: false }));
  const sent: string[] = [];
  while (pending.length) {
    const request = buildSyncRequest('device', { name: 'test', platform: 'web' }, pending);
    assert.ok(request.operations.length <= 10);
    assert.ok(new TextEncoder().encode(request.body).length <= 250_000);
    sent.push(...request.operations.map((operation) => operation.id));
    pending.splice(0, request.operations.length);
  }
  assert.equal(new Set(sent).size, 27);
});

test('late-mounted sync panels retrieve active upload progress', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  try {
    const detail = { state: 'syncing' as const, pending: 3, conflicts: 0, lastSyncedAt: null, progress: '上传分片 2 / 4' };
    announceSyncStatus(detail);
    assert.deepEqual(getLatestSyncStatus(), detail);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
