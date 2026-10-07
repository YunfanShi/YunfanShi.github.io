import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpRequest } from '@azure/functions';
import { ApiError } from '../errors.mjs';
import { createFunctionHandler, registerFunctions } from '../functions-adapter.mjs';

const request = (path, options = {}) => new HttpRequest({ method: 'GET', url: `https://test.azurewebsites.net${path}`, ...options });
const authenticate = async value => { if (value !== 'Bearer verified') throw new ApiError(401, 'UNAUTHORIZED'); return { sub: 'verified' }; };

test('Azure SDK request preserves routes, query, identity and JSON across the shared handler', async () => {
  let called;
  const handler = createFunctionHandler({ authenticate, handle: async (method, url, body, identity) => {
    called = { method, path: url.pathname, key: url.searchParams.get('key'), body, identity }; return { ok: true };
  } });
  const result = await handler(request('/api/sync/v2?key=plans', { method: 'POST',
    headers: { authorization: 'Bearer verified', 'content-type': 'application/json', origin: 'https://jackyun.top' },
    body: { string: JSON.stringify({ value: '学习📚' }) } }));
  assert.equal(result.status, 200);
  assert.deepEqual(called, { method: 'POST', path: '/api/sync/v2', key: 'plans', body: { value: '学习📚' }, identity: { sub: 'verified' } });
  assert.equal(JSON.parse(result.body).ok, true);
  assert.equal(result.headers['Access-Control-Allow-Origin'], 'https://jackyun.top');
  assert.equal(result.headers['Cache-Control'], 'no-store');
});

test('Azure adapter keeps authentication, origin, JSON and streamed byte limits', async () => {
  let called = 0;
  const handler = createFunctionHandler({ authenticate, handle: async () => { called++; return { ok: true }; } });
  assert.equal((await handler(request('/api/sync/v2'))).status, 401);
  assert.equal((await handler(request('/api/sync/v2', { headers: { authorization: 'Bearer verified', origin: 'https://evil.example' } }))).status, 403);
  assert.equal((await handler(request('/api/sync/v2', { method: 'OPTIONS', headers: { origin: 'https://jackyun.top' } }))).status, 204);
  assert.equal((await handler(request('/api/sync/v2', { method: 'POST', headers: { authorization: 'Bearer verified', 'content-type': 'text/plain' }, body: { string: '{}' } }))).status, 415);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1_000_001)); controller.close(); } });
  const result = await handler({ method: 'POST', url: 'https://test.azurewebsites.net/api/sync/v2',
    headers: new Headers({ authorization: 'Bearer verified', 'content-type': 'application/json' }), body: stream });
  assert.equal(result.status, 413);
  assert.equal(called, 0);
});

test('Functions registration streams input and preserves exact public route prefix', () => {
  const definitions = [];
  const app = { setup: value => definitions.push(value), http: (name, value) => definitions.push({ name, ...value }) };
  const handler = () => {};
  registerFunctions(app, handler);
  assert.deepEqual(definitions[0], { enableHttpStream: true });
  assert.equal(definitions[1].route, 'api/sync/{*path}');
  assert.ok(definitions[1].methods.includes('DELETE') && definitions[1].methods.includes('OPTIONS'));
  assert.equal(definitions[2].route, 'health/live');
  assert.equal(definitions[1].handler, handler);
});
