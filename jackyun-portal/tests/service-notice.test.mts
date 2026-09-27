import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { SERVICE_NOTICE_SNOOZE_MS, shouldShowServiceNotice } from '../src/lib/sync/notice-policy.ts';
import { syncFailureStatus, SyncHttpError } from '../src/lib/sync/service-error.ts';
import type { SyncStatusDetail } from '../src/types/sync.ts';
const blocked: SyncStatusDetail = { state: 'server_unavailable', pending: 2, conflicts: 0, lastSyncedAt: null, consecutiveFailures: 3 };
test('a single network failure never shows a global service banner', () => {
  for (const count of [undefined, 0, 1, 2]) assert.equal(shouldShowServiceNotice({ ...blocked, consecutiveFailures: count }, 1000, 0, false), false);
  assert.equal(shouldShowServiceNotice(blocked, 1000, 0, false), true);
  for (const state of ['guest', 'synced', 'syncing', 'offline_pending', 'conflict', 'error'] as const) assert.equal(shouldShowServiceNotice({ ...blocked, state }, 1000, 0, false), false);
});
test('dismiss and ten-minute snooze suppress the banner without claiming synchronization succeeded', () => {
  const now = 1000; const until = now + SERVICE_NOTICE_SNOOZE_MS;
  assert.equal(shouldShowServiceNotice(blocked, now, 0, true), false);
  assert.equal(shouldShowServiceNotice(blocked, until - 1, until, false), false);
  assert.equal(shouldShowServiceNotice(blocked, until, until, false), true);
  assert.equal(blocked.pending, 2); assert.equal(blocked.state, 'server_unavailable');
  assert.equal(shouldShowServiceNotice({ ...blocked, state: 'synced', consecutiveFailures: 0 }, until, until, false), false);
});
test('logging ordinary failures no longer creates a sticky global service error', async () => {
  const logger = await readFile(new URL('../src/lib/logger.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(logger, /dispatchEvent\(new CustomEvent\(SERVICE_ERROR_EVENT/);
});

test('transient connection errors stay pending until actual sync attempts repeatedly fail', () => {
  assert.equal(syncFailureStatus(new TypeError('failed fetch'), true, 1), 'offline_pending');
  assert.equal(syncFailureStatus(new SyncHttpError('down', 503), true, 2), 'offline_pending');
  assert.equal(syncFailureStatus(new SyncHttpError('down', 503), true, 3), 'server_unavailable');
  assert.equal(syncFailureStatus(new TypeError('offline'), false, 9), 'offline_pending');
  assert.equal(syncFailureStatus(new SyncHttpError('auth', 401), true, 3), 'error');
});
