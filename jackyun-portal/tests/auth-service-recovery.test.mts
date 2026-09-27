import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { GoTrueClient } from '@supabase/auth-js';
import { fetchWithTimeout } from '../src/lib/request-timeout.ts';
import { serviceErrorMessage, isDefinitiveSessionError } from '../src/lib/service-errors.ts';

test('only explicit invalid credentials reports password error; service failures have stable codes', () => {
  for (const error of [{ status: 500 }, { status: 503 }, { code: '57014' }, new TypeError('fetch failed'), { name: 'AuthRetryableFetchError', status: 0 }, { message: 'database SQL and secret' }]) {
    assert.doesNotMatch(serviceErrorMessage(error), /密码错误|database SQL|secret/);
    assert.equal(isDefinitiveSessionError(error), false);
  }
  assert.match(serviceErrorMessage({ code: 'invalid_credentials', status: 400 }), /INVALID_CREDENTIALS/);
  assert.match(serviceErrorMessage({ name: 'TimeoutError' }), /REQUEST_TIMEOUT/);
  assert.match(serviceErrorMessage({ status: 429 }), /RATE_LIMITED/);
  assert.match(serviceErrorMessage({ code: 'email_not_confirmed' }), /EMAIL_NOT_CONFIRMED/);
  assert.equal(isDefinitiveSessionError({ code: 'refresh_token_not_found', status: 400 }), true);
});

test('real SDK reproduces HTTP 500 session deletion, retains protected session and recovers without password', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const originalConsole = console.error;
  let clock = originalNow();
  Date.now = () => clock;
  console.error = () => {};
  let status = 500;
  let requests = 0;
  globalThis.fetch = async (input, init) => {
    requests++;
    assert.match(String(input), /grant_type=refresh_token/);
    assert.doesNotMatch(String(init?.body), /password/);
    clock += 60_000; // End the SDK's retry window deterministically; no real sleeps.
    return new Response(JSON.stringify(status === 200 ? {
      access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600, token_type: 'bearer', user: { id: 'user' },
    } : { error_code: status === 400 ? 'refresh_token_not_found' : 'unexpected_failure', message: 'server failure' }), { status, headers: { 'Content-Type': 'application/json' } });
  };
  const make = (protectedFetch: boolean) => {
    const store = new Map([['test-session', JSON.stringify({ access_token: 'old-access', refresh_token: 'old-refresh', expires_at: 1, user: { id: 'user' } })]]);
    const auth = new GoTrueClient({ url: 'https://example.com/auth/v1', storageKey: 'test-session', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
      storage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); }, removeItem: (key) => { store.delete(key); } },
      fetch: protectedFetch ? fetchWithTimeout : globalThis.fetch,
    });
    return { auth, store };
  };
  try {
    const broken = make(false);
    await broken.auth.getSession();
    assert.equal(broken.store.has('test-session'), false, 'baseline must reproduce session deletion');
    const fixed = make(true);
    const init = await fixed.auth.getSession();
    assert.equal(init.error?.name, 'AuthRetryableFetchError');
    assert.equal(JSON.parse(fixed.store.get('test-session')!).refresh_token, 'old-refresh');
    status = 200;
    const recovered = await fixed.auth.getSession();
    assert.equal(recovered.error, null);
    assert.equal(recovered.data.session?.refresh_token, 'new-refresh');
    assert.equal(requests, 3);
    status = 400;
    const revoked = make(true);
    await revoked.auth.getSession();
    assert.equal(revoked.store.has('test-session'), false, 'revoked refresh tokens must still be removed');
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; console.error = originalConsole; }
});

test('ID login distinguishes database lookup failure from absent account and incorrect password', async () => {
  const source = readFileSync(new URL('../src/actions/auth.ts', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('export async function signInWithIdentifier'), source.indexOf('export async function syncProfile')).replace('export async', 'async');
  let queryError: unknown = { code: '57014' };
  let authError: unknown = null;
  let email: string | null = 'user@example.com';
  const query: any = { select: () => query, ilike: () => query, maybeSingle: async () => ({ data: email ? { email } : null, error: queryError }) };
  const fn = runInNewContext(ts.transpileModule(block, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nsignInWithIdentifier', {
    createAdminClient: () => ({ from: () => query }),
    createClient: async () => ({ auth: { signInWithPassword: async () => ({ error: authError }) } }), serviceErrorMessage,
  });
  assert.match((await fn('my-id', 'pass')).error, /REQUEST_TIMEOUT/);
  queryError = null; authError = { status: 500 };
  assert.match((await fn('my-id', 'pass')).error, /SERVICE_UNAVAILABLE/);
  authError = { code: 'invalid_credentials', status: 400 };
  assert.match((await fn('my-id', 'pass')).error, /INVALID_CREDENTIALS/);
  authError = null;
  assert.equal((await fn('my-id', 'pass')).success, true);
  email = null;
  assert.match((await fn('missing-id', 'pass')).error, /INVALID_CREDENTIALS/);
});

function recoveryHarness(result: { data: unknown; error: unknown }) {
  const source = readFileSync(new URL('../src/components/auth/session-recovery.tsx', import.meta.url), 'utf8');
  let effect!: () => () => void;
  let calls = 0;
  let nextResult = result;
  let scheduled: (() => void) | undefined;
  let delay = 0;
  let notice: unknown;
  const navigation: string[] = [];
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const window = new EventTarget();
  const exports: any = {};
  const deps: Record<string, unknown> = {
    'react': { useEffect: (fn: () => () => void) => { effect = fn; }, useState: () => [null, (value: unknown) => { notice = value; }] },
    'react/jsx-runtime': { jsx: () => null },
    'next/navigation': { useRouter: () => ({ replace: (url: string) => navigation.push(url), refresh: () => navigation.push('refresh') }) },
    '@/lib/supabase/client': { createClient: () => ({ auth: { getClaims: async () => { calls++; return nextResult; }, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }) },
    '@/lib/service-errors': { serviceErrorMessage, isDefinitiveSessionError },
    '@/lib/workspace-idle': { isWorkspaceSleeping: () => false },
  };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; },
    window, document, navigator: { onLine: true }, location: { search: '?next=https://evil.example' }, URLSearchParams, queueMicrotask,
    setTimeout: (fn: () => void, milliseconds: number) => { scheduled = fn; delay = milliseconds; return 1; }, clearTimeout: () => { scheduled = undefined; },
  });
  exports.default({ loginPage: true });
  const cleanup = effect();
  return { document, window, navigation, cleanup, setResult: (value: typeof result) => { nextResult = value; }, tick: () => scheduled?.(), get calls() { return calls; }, get delay() { return delay; }, get notice() { return notice; } };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test('login page retries existing session, pauses hidden checks, and returns safely on recovery', async () => {
  const recovery = recoveryHarness({ data: null, error: { status: 503 } });
  await settle();
  assert.equal(recovery.calls, 1);
  assert.equal(recovery.delay, 30_000);
  assert.match(String(recovery.notice), /SERVICE_UNAVAILABLE/);
  recovery.document.visibilityState = 'hidden';
  recovery.tick(); await settle();
  assert.equal(recovery.calls, 1);
  recovery.setResult({ data: { claims: { sub: 'user' } }, error: null });
  recovery.document.visibilityState = 'visible';
  recovery.document.dispatchEvent(new Event('visibilitychange'));
  await settle();
  assert.deepEqual(recovery.navigation, ['/dashboard', 'refresh']);
  recovery.cleanup();
});

test('revoked session requires login and never retries credentials automatically', async () => {
  const recovery = recoveryHarness({ data: null, error: { code: 'refresh_token_not_found', status: 400 } });
  await settle();
  assert.match(String(recovery.notice), /SESSION_EXPIRED/);
  assert.equal(recovery.delay, 0);
  assert.equal(recovery.navigation.length, 0);
  recovery.window.dispatchEvent(new Event('online'));
  await settle();
  assert.equal(recovery.calls, 1);
  recovery.cleanup();
});
