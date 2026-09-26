import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isAuthCookie } from '../src/lib/auth-cookies.ts';
import { syncRetryDelay, shouldPauseSync, SyncRequestError } from '../src/lib/sync/retry-policy.ts';
import { fetchWithTimeout } from '../src/lib/request-timeout.ts';

test('logout expires SSR session chunks and verifier without touching application data', () => {
  for (const name of ['sb-project-auth-token', 'sb-project-auth-token.0', 'sb-project-auth-token.12', 'sb-project-auth-token-code-verifier', 'supabase-auth-token']) assert.equal(isAuthCookie(name), true);
  for (const name of ['theme', 'jackyun_schedule', 'sb-other-setting']) assert.equal(isAuthCookie(name), false);
});

test('revoked devices pause retry and service failures use capped exponential backoff', () => {
  assert.equal(shouldPauseSync(new SyncRequestError('Device revoked', 403)), true);
  assert.equal(shouldPauseSync(new SyncRequestError('Unauthorized', 401)), true);
  assert.equal(shouldPauseSync(new SyncRequestError('Unavailable', 503)), false);
  assert.deepEqual([1, 2, 3, 4, 5, 100].map(syncRetryDelay), [30000, 60000, 120000, 240000, 300000, 300000]);
});

test('network deadline aborts a hung fetch and preserves caller cancellation', async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  const deadline = new AbortController();
  AbortSignal.timeout = (milliseconds) => { assert.equal(milliseconds, 8000); return deadline.signal; };
  globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
    const signal = init!.signal!;
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  try {
    const hung = fetchWithTimeout('https://example.com');
    deadline.abort(new DOMException('Timed out', 'TimeoutError'));
    await assert.rejects(hung, { name: 'TimeoutError' });
    const caller = new AbortController();
    caller.abort(new Error('Caller cancelled'));
    await assert.rejects(fetchWithTimeout(new Request('https://example.com', { signal: caller.signal })), /Caller cancelled/);
  } finally { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; }
});

test('forced logout skips remote auth and UI preserves pending data', () => {
  const route = readFileSync(new URL('../src/app/api/auth/signout/route.ts', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/components/auth/logout-button.tsx', import.meta.url), 'utf8');
  assert.match(route, /if \(!force\) \{[\s\S]*auth\.signOut/);
  assert.match(route, /request\.headers\.get\('origin'\) !== request\.nextUrl\.origin/);
  assert.match(ui, /logout\(true\)/);
  assert.doesNotMatch(ui, /clearOfflineWorkspace|getOutbox|await signOut/);
  const sync = readFileSync(new URL('../src/components/layout/local-workspace-sync.tsx', import.meta.url), 'utf8');
  assert.match(sync, /onlyPending && !\(await getOutbox\(\)\)\.length/);
  assert.doesNotMatch(sync, /\/api\/health/);
  assert.doesNotMatch(sync, /current === lastSnapshot\[key\] && base/);
  assert.match(sync, /pendingByKey/);
});
