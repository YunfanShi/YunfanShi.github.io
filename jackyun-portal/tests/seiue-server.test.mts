import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export%20{}', shortCircuit: true };
  if (specifier === './seiue' && context.parentURL?.endsWith('/seiue-server.ts')) return nextResolve('./seiue.ts', context);
  return nextResolve(specifier, context);
} });
const { fetchSeiueSnapshot, pageCount, SeiueApiError } = await import('../src/lib/integrations/seiue-server.ts');
import type { SeiueCredentials } from '../src/lib/integrations/seiue-server.ts';

const credentials: SeiueCredentials = { token: 'synthetic-secret-token-123456', reflectionId: 'reflection-1', schoolId: 'school-1', role: 'student', schoolSite: 'https://chalk-c3.seiue.com/', expiresAt: new Date(Date.now() + 60_000).toISOString() };
const lesson = { type: 'lesson', title: 'Algebra', subject: { name: 'Mathematics' }, start_time: '2026-10-23 09:00:00', end_time: '2026-10-23 09:45:00', custom: { id: 'lesson-1' } };

test('snapshot sends only pinned GET requests and reads every todo page', async () => {
  const original = globalThis.fetch, calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.includes('/events?')) return Response.json([lesson]);
    if (url.includes('/todos?') && new URL(url).searchParams.get('page') === '1') return Response.json([{ id: 'todo-1', type: 'seiue.task_submit_todo', status: 'pending', title: 'Homework', related: { expired_at: '2026-10-24 23:59:00', content: { blocks: [{ text: 'Write report' }] } } }], { headers: { 'X-Pagination-Page-Count': '2' } });
    if (url.includes('/todos?') && new URL(url).searchParams.get('page') === '2') return Response.json([{ id: 'todo-2', type: 'seiue.scms.election.student', status: 'completed', title: 'Course election', related: { end_at: '2026-10-25 12:00:00' } }]);
    if (url.endsWith('/scms/schcal/events')) return Response.json([{ id: 'holiday-1', title: 'Break', start_at: '2026-10-26', end_at: '2026-10-28' }]);
    return Response.json({}, { status: 404 });
  }) as typeof fetch;
  try {
    const result = await fetchSeiueSnapshot(credentials, '2026-10-23');
    assert.equal(result.lessons[0].id, 'lesson-1');
    assert.equal(result.todos.length, 2);
    assert.equal(result.todos[1].status, 'completed');
    assert.equal(result.calendar[0].title, 'Break');
    assert.equal(calls.length, 4);
    for (const call of calls) {
      assert.equal(new URL(call.url).origin, 'https://api.seiue.com');
      assert.equal(call.init?.method, 'GET');
      assert.equal(call.init?.redirect, 'error');
      const headers = new Headers(call.init?.headers);
      assert.equal(headers.get('X-Role'), 'student');
      assert.equal(headers.get('X-Reflection-Id'), 'reflection-1');
      assert.equal(headers.get('X-School-Id'), 'school-1');
      assert.match(headers.get('Authorization') ?? '', /^Bearer synthetic-secret-token-123456$/);
    }
  } finally { globalThis.fetch = original; }
});

test('unauthorized, forbidden, timeout and malformed upstream responses fail without exposing credentials', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [401, 403]) {
      globalThis.fetch = (async () => new Response('', { status })) as typeof fetch;
      await assert.rejects(fetchSeiueSnapshot(credentials, '2026-10-23'), error => error instanceof SeiueApiError && error.status === status && !error.message.includes(credentials.token));
    }
    globalThis.fetch = (async () => { throw new Error('network down'); }) as typeof fetch;
    await assert.rejects(fetchSeiueSnapshot(credentials, '2026-10-23'), error => error instanceof SeiueApiError && error.status === 502 && !error.message.includes(credentials.token));
    globalThis.fetch = (async () => Response.json({ unexpected: true })) as typeof fetch;
    await assert.rejects(fetchSeiueSnapshot(credentials, '2026-10-23'), error => error instanceof SeiueApiError && !error.message.includes(credentials.token));
  } finally { globalThis.fetch = original; }
});

test('expired tokens and unsafe pagination are rejected without fallback truncation', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('must not call'); }) as typeof fetch;
  try {
    await assert.rejects(fetchSeiueSnapshot({ ...credentials, expiresAt: new Date(0).toISOString() }, '2026-10-23'), error => error instanceof SeiueApiError && error.status === 401);
  } finally { globalThis.fetch = original; }
  assert.equal(pageCount(new Headers({ 'X-Pagination-Page-Count': '2' }), []), 2);
  assert.throws(() => pageCount(new Headers({ 'X-Pagination-Page-Count': 'not-a-number' }), []), SeiueApiError);
  assert.throws(() => pageCount(new Headers({ 'X-Pagination-Page-Count': '101' }), []), SeiueApiError);
});
