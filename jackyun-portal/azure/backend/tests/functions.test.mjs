import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpRequest } from '@azure/functions';
import { ApiError } from '../errors.mjs';
import { createFunctionHandler, registerFunctions } from '../functions-adapter.mjs';

const request = (path, options = {}) => new HttpRequest({ method: 'GET', url: `https://test.azurewebsites.net${path}`, ...options });
const authenticate = async value => { if (value !== 'Bearer verified') throw new ApiError(401, 'UNAUTHORIZED'); return { sub: 'verified' }; };

test('runtime metadata proves the deployed version and original error codes remain compatible',async()=>{
  const handler=createFunctionHandler({authenticate,handle:async()=>({ok:true})});
  const health=await handler(request('/health/live'));
  assert.equal(health.status,200);
  const metadata=JSON.parse(health.body);
  assert.equal(metadata.version,'3.5.0');assert.equal(metadata.transferEncoding,'gzip');assert.equal(metadata.legacyEncoding,'identity');
  const denied=JSON.parse((await handler(request('/api/sync/v3'))).body);
  assert.equal(denied.code,'UNAUTHORIZED');assert.equal(denied.siteCode,'JY-1001');assert.ok(denied.requestId);
});

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

test('export and backup marker routes reach the shared HTTP handler and retain authentication',async()=>{
  const seen=[];
  const handler=createFunctionHandler({authenticate,handle:async(method,url,body,identity,token)=>{
    seen.push({method,path:url.pathname,body,identity,token});return {ok:true};
  }});
  for(const path of ['/api/sync/export?after=jackyun_theme','/api/sync/backup-markers']){
    assert.equal((await handler(request(path))).status,401);
    assert.equal((await handler(request(path,{headers:{authorization:'Bearer verified'}}))).status,200);
  }
  const body={page:'schedule',generation:'00000000-0000-4000-8000-000000000003',versionId:42};
  assert.equal((await handler(request('/api/sync/backup-markers',{method:'POST',headers:{authorization:'Bearer verified','content-type':'application/json'},body:{string:JSON.stringify(body)}}))).status,200);
  assert.deepEqual(seen.map(s=>s.path),['/api/sync/export','/api/sync/backup-markers','/api/sync/backup-markers']);
  assert.ok(seen.every(s=>s.token==='verified'&&s.identity.sub==='verified'));assert.deepEqual(seen.at(-1).body,body);
});
