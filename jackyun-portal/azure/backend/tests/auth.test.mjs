import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createAuthenticator } from '../auth.mjs';
import { createApiServer } from '../server.mjs';
import { createSyncApi } from '../sync-api.mjs';

const project = 'https://testproject.supabase.co';
const pair = await generateKeyPair('ES256');
const publicKey = { ...await exportJWK(pair.publicKey), kid: 'test', alg: 'ES256' };
const identity = { sub: randomUUID(), session_id: randomUUID(), role: 'authenticated' };
async function token(claims = {}, options = {}) {
  return new SignJWT({ ...identity, ...claims }).setProtectedHeader({ alg: 'ES256', kid: 'test' })
    .setIssuer(options.issuer ?? `${project}/auth/v1`).setAudience(options.audience ?? 'authenticated')
    .setIssuedAt().setExpirationTime(options.expiry ?? '5m').sign(options.key ?? pair.privateKey);
}
const authenticate = createAuthenticator({ supabaseUrl: project, keyResolver: createLocalJWKSet({ keys: [publicKey] }) });

test('valid signature yields minimal identity; editable metadata and supplied DB role are excluded', async () => {
  assert.deepEqual(await authenticate(`Bearer ${await token({ user_metadata: { role: 'admin' }, user_id: randomUUID() })}`), identity);
});
test('expired, wrong issuer/audience, anonymous, privileged and forged JWTs are rejected', async () => {
  const other = await generateKeyPair('ES256');
  const invalid = [await token({}, { expiry: '0s' }), await token({}, { issuer: 'https://other.supabase.co/auth/v1' }),
    await token({}, { audience: 'other' }), await token({ is_anonymous: true }), await token({ role: 'service_role' }),
    await token({ session_id: undefined }), await token({}, { key: other.privateKey })];
  // Expiration tolerance is five seconds; use an explicitly past expiration.
  invalid[0] = await new SignJWT(identity).setProtectedHeader({ alg: 'ES256', kid: 'test' })
    .setIssuer(`${project}/auth/v1`).setAudience('authenticated').setIssuedAt().setExpirationTime(Math.floor(Date.now()/1000)-60).sign(pair.privateKey);
  for (const value of invalid) await assert.rejects(authenticate(`Bearer ${value}`), { status: 401 });
  await assert.rejects(authenticate('Bearer garbage'), { status: 401 });
  await assert.rejects(authenticate(undefined), { status: 401 });
});
test('legacy token requires Auth approval, identity agreement and current issuer/claims', async () => {
  const secret = new TextEncoder().encode('only-a-test-key-with-adequate-length');
  const value = await new SignJWT(identity).setProtectedHeader({ alg: 'HS256' })
    .setIssuer(`${project}/auth/v1`).setAudience('authenticated').setIssuedAt().setExpirationTime('5m').sign(secret);
  let seen;
  const auth = createAuthenticator({ supabaseUrl: project, publishableKey: 'public-test-key', fetchImpl: async (url, options) => {
    seen = { url, options }; return new Response(JSON.stringify({ id: identity.sub }), { status: 200 });
  } });
  assert.deepEqual(await auth(`Bearer ${value}`), identity);
  assert.equal(seen.url, `${project}/auth/v1/user`);
  assert.equal(seen.options.headers.Authorization, `Bearer ${value}`);
  const mismatch = createAuthenticator({ supabaseUrl: project, publishableKey: 'public-test-key',
    fetchImpl: async () => new Response(JSON.stringify({ id: randomUUID() })) });
  await assert.rejects(mismatch(`Bearer ${value}`), { status: 401 });
  const unavailable = createAuthenticator({ supabaseUrl: project, publishableKey: 'public-test-key',
    fetchImpl: async () => new Response('', { status: 429 }) });
  await assert.rejects(unavailable(`Bearer ${value}`), { status: 503 });
  const oversized = createAuthenticator({ supabaseUrl: project, publishableKey: 'public-test-key',
    fetchImpl: async () => new Response(JSON.stringify({ id: identity.sub, user_metadata: { value: 'x'.repeat(262_144) } })) });
  await assert.rejects(oversized(`Bearer ${value}`), { status: 503 });
});
test('HTTP authentication, CORS, body limit and errors do not expose database diagnostics', async t => {
  const logs = [];
  const server = createApiServer({ authenticate, handle: async () => { throw Object.assign(new Error('private-payload-and-password'), { code: 'XX000' }); }, logger: { error: value => logs.push(value) } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/sync/v2`;
  const authorization = `Bearer ${await token()}`;
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { authorization, Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://jackyun.top' } })).status, 204);
  assert.equal((await fetch(url, { method: 'POST', headers: { authorization, 'Content-Type': 'application/json' }, body: 'x'.repeat(1_000_001) })).status, 413);
  const response = await fetch(url, { headers: { authorization } });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'SYNC_UNAVAILABLE');
  assert.ok(logs.length && logs.every(log => !log.includes('private-payload-and-password')));
});

test('one operation ID cannot acknowledge writes to two different keys', async () => {
  let queried = false;
  const handle = createSyncApi({ withUser: async (_identity, work) => work({ query: async () => { queried = true; throw new Error('Unexpected mutation'); } }) });
  const op = { id: randomUUID(), baseRevision: 0, baseHash: null, baseValue: null, value: {}, deleted: false, clientUpdatedAt: new Date().toISOString() };
  await assert.rejects(handle('POST', new URL('http://localhost/api/sync/v2'), { syncProtocol:3,deviceId: randomUUID(),
    operations: [{ ...op, key: 'azure_test_a' }, { ...op, key: 'azure_test_b' }] }, identity), { status: 400, code: 'DUPLICATE_OPERATION_IDS' });
  assert.equal(queried, false, 'Validation rejects the ambiguous batch before any device or record mutation');
});
