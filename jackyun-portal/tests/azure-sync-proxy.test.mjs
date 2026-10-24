import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../src/lib/sync/azure-proxy.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(endpoint, fetcher, session = { access_token: 'transported-token' }, logs = []) {
  const exports = {};
  const modules = {
    'server-only': {}, 'next/server': { NextResponse: Response },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getSession: async () => ({ data: { session } }) } }) },
    '@/lib/api-response': { requestIdFrom: () => 'test-request',
      apiError: (_id, _message, status, code) => Response.json({ code }, { status }) },
  };
  vm.runInNewContext(code, { exports, require: name => {
    if (!(name in modules)) throw Error('Unexpected dependency'); return modules[name];
  }, process: { env: { AZURE_SYNC_API_URL: endpoint } }, URL, Headers, Uint8Array, AbortSignal,
  fetch: fetcher, console:{warn:(...args)=>logs.push(args.join(' '))} });
  return request => exports.forwardAzureSync(Object.assign(request, { nextUrl: new URL(request.url) }));
}
const endpoint = 'https://jackyun-sync-9d26b2cc.azurewebsites.net';
test('failed upstream transport logs phase and safe system code without messages or credentials',async()=>{
  const logs=[];
  const error=Object.assign(new TypeError('private-token and learning content'),{cause:{code:'ECONNRESET',message:'private-password'}});
  const forward=fixture(endpoint,()=>{throw error;},undefined,logs);
  assert.equal((await forward(new Request('https://jackyun.top/api/sync/v3?private=value'))).status,503);
  assert.equal(logs.length,1);
  const event=JSON.parse(logs[0].slice('[sync-proxy] '.length));
  assert.equal(event.stage,'upstream_fetch');assert.equal(event.causeCode,'ECONNRESET');
  assert.equal(event.route,'/api/sync/v3');
  assert.ok(!logs[0].includes('private')&&!logs[0].includes('transported-token'));
});
test('proxy transports only bearer and bounded JSON; preserves query, errors and no-store', async () => {
  let calls = 0;
  const forward = fixture(endpoint, async (url, options) => {
    calls++;
    assert.equal(url.href, `${endpoint}/api/sync/v2?cursor=abc`);
    assert.equal(options.headers.get('Authorization'), 'Bearer transported-token');
    assert.equal(options.headers.get('Cookie'), null);
    assert.equal(options.headers.get('Origin'), 'https://jackyun.top');
    assert.equal(new TextDecoder().decode(options.body), '{"value":"学习📚"}');
    assert.equal(options.redirect, 'error');
    return Response.json({ code: 'DEVICE_REVOKED' }, { status: 403 });
  });
  const response = await forward(new Request('https://jackyun.top/api/sync/v2?cursor=abc', { method: 'POST',
    headers: { cookie: 'private-session-cookie', origin: 'https://jackyun.top', 'content-type': 'application/json' },
    body: '{"value":"学习📚"}' }));
  assert.equal(response.status, 403); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).code, 'DEVICE_REVOKED'); assert.equal(calls, 1);
});
test('proxy rejects untrusted endpoints and never retries a failed mutation on Supabase', async () => {
  let calls = 0;
  for (const bad of ['http://jackyun-sync-9d26b2cc.azurewebsites.net', 'https://evil.example', `${endpoint}.evil.example`, `${endpoint}/other`, `https://user:password@jackyun-sync-9d26b2cc.azurewebsites.net`]) {
    const result = await fixture(bad, () => { calls++; })(new Request('https://jackyun.top/api/sync/v2'));
    assert.equal(result.status, 503);
  }
  assert.equal(calls, 0);
  const result = await fixture(endpoint, () => { calls++; throw Error('Timeout'); })(new Request('https://jackyun.top/api/sync/v2', { method: 'POST', body: '{}' }));
  assert.equal(result.status, 503); assert.equal(calls, 1);
});
test('streamed oversize JSON and missing login never reach Azure; unset endpoint keeps legacy path', async () => {
  let calls = 0;
  const result = await fixture(endpoint, () => { calls++; })(new Request('https://jackyun.top/api/sync/v2', {
    method: 'POST', body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1_000_001)); c.close(); } }), duplex: 'half' }));
  assert.equal(result.status, 413);
  assert.equal((await fixture(endpoint, () => { calls++; }, null)(new Request('https://jackyun.top/api/sync/v2'))).status, 401);
  assert.equal(await fixture(undefined, () => { calls++; })(new Request('https://jackyun.top/api/sync/v2')), null);
  assert.equal(calls, 0);
});
