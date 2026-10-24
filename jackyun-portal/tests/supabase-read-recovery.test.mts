import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const timeoutStubUrl = `data:text/javascript,${encodeURIComponent(`
  export const calls = [];
  export async function fetchWithTimeout(...args) {
    calls.push(args);
    return fetch(args[0], args[1]);
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/lib/request-timeout') return { url: timeoutStubUrl, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const timeoutStub = await import(timeoutStubUrl);
const { fetchWithReadRecovery } = await import('../src/lib/supabase/read-recovery.ts');

async function withFetch(implementation: typeof fetch, run: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = implementation;
  timeoutStub.calls.length = 0;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('retries a transient PostgREST GET once and passes through the bounded timeout', async () => {
  await withFetch((async () => {
    if (timeoutStub.calls.length === 1) throw new TypeError('synthetic network failure');
    return new Response('ok', { status: 200 });
  }) as typeof fetch, async () => {
    const response = await fetchWithReadRecovery('https://example.supabase.co/rest/v1/profiles?id=eq.user', undefined, 2500);
    assert.equal(response.status, 200);
    assert.equal(timeoutStub.calls.length, 2);
    assert.equal(timeoutStub.calls[0][2], 2500);
    assert.equal(timeoutStub.calls[0][3], false);
  });
});

test('retries selected transient statuses once and cancels the first response body', async () => {
  await withFetch((async () => new Response('temporary', { status: timeoutStub.calls.length === 1 ? 503 : 200 })) as typeof fetch, async () => {
    const response = await fetchWithReadRecovery('https://example.supabase.co/rest/v1/profiles');
    assert.equal(response.status, 200);
    assert.equal(timeoutStub.calls.length, 2);
  });
});

test('does not retry explicit throttling delay, stable errors, writes, or non-REST requests', async () => {
  const cases: Array<[string, number, Record<string, string>?, string?]> = [
    ['https://example.supabase.co/rest/v1/profiles', 429, { 'retry-after': '2' }],
    ['https://example.supabase.co/rest/v1/profiles', 400],
    ['https://example.supabase.co/auth/v1/user', 503],
    ['https://example.supabase.co/rest/v1/profiles', 503, undefined, 'PATCH'],
  ];
  for (const [url, status, headers, method] of cases) {
    await withFetch((async () => new Response('result', { status, headers })) as typeof fetch, async () => {
      const response = await fetchWithReadRecovery(url, method ? { method } : undefined);
      assert.equal(response.status, status);
      assert.equal(timeoutStub.calls.length, 1);
    });
  }
});

test('retries 429 without Retry-After only once', async () => {
  await withFetch((async () => new Response('busy', { status: timeoutStub.calls.length === 1 ? 429 : 200 })) as typeof fetch, async () => {
    const response = await fetchWithReadRecovery('https://example.supabase.co/rest/v1/profiles');
    assert.equal(response.status, 200);
    assert.equal(timeoutStub.calls.length, 2);
  });
});

test('does not retry caller cancellation or non-transient exceptions', async () => {
  const controller = new AbortController();
  controller.abort();
  await withFetch((async () => { throw new DOMException('aborted', 'AbortError'); }) as typeof fetch, async () => {
    await assert.rejects(fetchWithReadRecovery('https://example.supabase.co/rest/v1/profiles', { signal: controller.signal }));
    assert.equal(timeoutStub.calls.length, 1);
  });
  await withFetch((async () => { throw new Error('unexpected'); }) as typeof fetch, async () => {
    await assert.rejects(fetchWithReadRecovery('https://example.supabase.co/rest/v1/profiles'));
    assert.equal(timeoutStub.calls.length, 1);
  });
});
