import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyFetchFailure, classifyHttpFailure } from '../src/lib/network-failure.ts';

test('transient HTTP failures stay recoverable while auth and data errors remain actionable', () => {
  for (const status of [408, 425, 429, 500, 502, 503, 504]) assert.equal(classifyHttpFailure(status), 'recoverable', `${status} should retry quietly`);
  for (const status of [400, 401, 403, 404, 409, 413, 422]) assert.equal(classifyHttpFailure(status), 'actionable', `${status} must remain diagnosable`);
});

test('intentional request cancellation is diagnostic-only', () => {
  assert.equal(classifyFetchFailure(new DOMException('navigation changed', 'AbortError')), 'cancelled');
  assert.equal(classifyFetchFailure(new Error('Failed to fetch')), 'recoverable');
});
