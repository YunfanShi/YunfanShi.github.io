import assert from 'node:assert/strict';
import test from 'node:test';
import { isServerUnavailable, SyncHttpError } from '../src/lib/sync/service-error.ts';

test('server failure is distinct from a disconnected device or an auth response', () => {
  assert.equal(isServerUnavailable(new SyncHttpError('database unavailable', 503), true), true);
  assert.equal(isServerUnavailable(new TypeError('Failed to fetch'), true), true);
  assert.equal(isServerUnavailable(new SyncHttpError('expired session', 401), true), false);
  assert.equal(isServerUnavailable(new SyncHttpError('database unavailable', 503), false), false);
});
