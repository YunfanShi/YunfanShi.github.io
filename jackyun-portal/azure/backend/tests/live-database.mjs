// Explicit opt-in: fixtures use unique keys only; this database now serves production.
// PGADMINPASSWORD is solely for fixture selection/cleanup; HTTP uses an ordinary login.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createAuthenticator } from '../auth.mjs';
import { createDatabase } from '../database.mjs';
import { createApiServer } from '../server.mjs';
import { createSyncApi } from '../sync-api.mjs';
import { splitSyncBody } from '../../../src/lib/sync/transfer.ts';

assert.match(process.env.PGDATABASE ?? '', /^jackyun_migration_[0-9]{8}$/);
const config = { host: process.env.PGHOST, user: process.env.PGUSER, database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD, caPath: process.env.PGSSLROOTCERT, port: Number(process.env.PGPORT ?? 5432), servername: process.env.PGSSLSERVERNAME };
const admin = new pg.Client({ host: config.host, user: 'jackyun_admin', database: config.database,
  port: config.port, password: process.env.PGADMINPASSWORD, connectionTimeoutMillis: 10_000, query_timeout: 30_000,
  ssl: { ca: readFileSync(config.caPath, 'utf8'), rejectUnauthorized: true, servername: config.servername ?? config.host } });
const database = createDatabase(config);
let server;
const device = randomUUID(), secondDevice = randomUUID(), key = `azure_backend_test_${randomUUID()}`;
const errors = [];
const pair = await generateKeyPair('ES256');
const jwk = { ...await exportJWK(pair.publicKey), alg: 'ES256', kid: 'live-test' };
const project = 'https://gdcwwlnzylrzrqhaaljq.supabase.co';
let users;
const sessions = [randomUUID(), randomUUID(), randomUUID()];
try {
  await admin.connect();
  users = (await admin.query("SELECT id FROM public.profiles WHERE account_status='active' AND deleted_at IS NULL ORDER BY id LIMIT 2")).rows.map(row => row.id);
  assert.equal(users.length, 2, 'Two active copied accounts required');
  const tokens = await Promise.all([...users, randomUUID()].map((sub, index) => new SignJWT({ sub, role: 'authenticated', session_id: sessions[index] })
    .setProtectedHeader({ alg: 'ES256', kid: 'live-test' }).setIssuer(`${project}/auth/v1`)
    .setAudience('authenticated').setIssuedAt().setExpirationTime('10m').sign(pair.privateKey)));
  server = createApiServer({ authenticate: createAuthenticator({ supabaseUrl: project,
    keyResolver: createLocalJWKSet({ keys: [jwk] }) }), handle: createSyncApi(database), logger: { error: value => errors.push(value) } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { user = 0, method = 'GET', body } = {}) => {
    const response = await fetch(base + path, { method, signal: AbortSignal.timeout(30_000), headers: { authorization: `Bearer ${tokens[user]}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const operation = (value, revision, overrides = {}) => ({ id: randomUUID(), key, baseRevision: revision,
    baseHash: null, baseValue: null, value, deleted: false, clientUpdatedAt: new Date().toISOString(), ...overrides });
  const post = op => call('/api/sync/v2', { method: 'POST', body: { syncProtocol: 3, deviceId: device, operations: [op] } });
  assert.equal((await call('/api/sync/v2', { user: 2 })).status, 403, 'A verified identity must also have an active copied profile');
  const first = operation({ first: true }, 0);
  const concurrent = await Promise.all([post(first), post(first)]);
  assert.ok(concurrent.every(result => result.status === 200 && result.data.applied[0].revision === 1), `Concurrent retries are idempotent: ${JSON.stringify(concurrent.map(result => ({ status: result.status, code: result.data.code, revision: result.data.applied?.[0]?.revision })))}`);
  assert.equal((await call(`/api/sync/v2?key=${key}`, { user: 1 })).data.records.length, 0, 'Second user cannot see the first user');
  const crossDevice = await call('/api/sync/v2', { user: 1, method: 'POST', body: { syncProtocol: 3, deviceId: device, operations: [operation({}, 0)] } });
  assert.equal(crossDevice.status, 403, 'Cannot take over another user device');
  const second = await call('/api/sync/v2', { user: 1, method: 'POST', body: { syncProtocol: 3, deviceId: secondDevice, operations: [operation({ second: true }, 0)] } });
  assert.equal(second.status, 200);
  const firstRead = await call(`/api/sync/v2?key=${key}`);
  assert.deepEqual(firstRead.data.records[0].value, { first: true }, 'Pool identity does not leak between users');
  const invalidBatch = await call('/api/sync/v2', { method: 'POST', body: { syncProtocol: 3, deviceId: device, operations: [operation({}, 1), operation({}, 1)] } });
  assert.equal(invalidBatch.status, 400);
  assert.equal((await call(`/api/sync/v2?key=${key}`)).data.records[0].revision, 1, 'Invalid batch rolls back');
  const value = { text: '学习📚'.repeat(150000) };
  const largeOperation = operation(value, 1, {baseHash:firstRead.data.records[0].contentHash});
  const upload = splitSyncBody(JSON.stringify({ syncProtocol: 3, deviceId: device, operations: [largeOperation] }));
  for (let index = 0; index < upload.length; index++) {
    const result = await call('/api/sync/v2/large', { method: 'POST', body: { uploadId: largeOperation.id, index, count: upload.length, data: upload[index] } });
    assert.equal(result.status, 200, 'Upload chunk accepted');
  }
  assert.equal((await call('/api/sync/v2/large', { method: 'POST', body: { uploadId: largeOperation.id, complete: true } })).data.applied[0].revision, 2);
  const metadata = (await call(`/api/sync/v2?key=${key}`)).data.records[0];
  assert.equal(metadata.large, true); assert.equal(metadata.value, null);
  const firstPart = await call(`/api/sync/v2/large?key=${key}&revision=2&part=0`);
  const chunks = [firstPart.data.data];
  for (let part = 1; part < firstPart.data.count; part++) chunks.push((await call(`/api/sync/v2/large?key=${key}&revision=2&part=${part}`)).data.data);
  assert.deepEqual(JSON.parse(Buffer.concat(chunks.map(chunk => Buffer.from(chunk, 'base64'))).toString('utf8')), value);
  assert.equal((await call(`/api/sync/v2/large?key=${key}&revision=2&part=0`, { user: 1 })).status, 409);
  const deletion = await post(operation(null, 2, { deleted: true, baseHash:metadata.contentHash }));
  assert.equal(deletion.data.applied[0].revision, 3);
  const stale = await post(operation({ revive: true }, 0, { clientUpdatedAt: new Date(Date.now()-86400000).toISOString() }));
  assert.equal(stale.data.remote[0].deleted, true);
  assert.equal((await call('/api/sync/devices', { method: 'PATCH', body: { id: device, name: 'Verified device' } })).status, 200);
  assert.equal((await call('/api/sync/conflicts')).status, 200);
  assert.equal((await call('/api/sync/devices', { method: 'DELETE', body: { id: device } })).status, 200);
  assert.equal((await post(operation({}, 3))).status, 403);
  const legacy = await call('/api/legacy-sync', { method: 'POST', body: { key, value: JSON.stringify({ legacy: '学习📚' }) } });
  assert.equal(legacy.status, 426);
  assert.equal((await call(`/api/sync/v2?key=${key}`)).data.records[0].revision,3,'Old writes cannot overwrite modern records');
  const manifest=await call('/api/sync/v3');assert.equal(manifest.status,200);assert.ok(manifest.data.records.every(r=>!Object.hasOwn(r,'value')));
  assert.equal((await admin.query('SELECT count(*)::int AS count FROM public.sync_record_history WHERE storage_key=$1',[key])).rows[0].count,2,'Preimages retained before each overwrite');
  assert.equal(errors.length, 0, 'No unexpected server errors');
  console.log(JSON.stringify({ ordinaryLoginHttpToAzurePassed: true, concurrentRetryPassed: true,
    twoUserPoolIsolationPassed: true, unicodeChunkRoundTripPassed: true, uploadParts: upload.length,
    legacyWriteFencePassed: true, versionManifestPassed: true, preimageHistoryPassed: true, testIssuerKeysOnly: true, productionAuthAndBrowserCutover: false }));
} finally {
  if (server) { await new Promise(resolve => server.close(resolve)); }
  await database.close();
  if (users?.length) {
    await admin.query('BEGIN');
    await admin.query('DELETE FROM public.sync_v3_receipts WHERE user_id=ANY($1::uuid[]) AND operation_id IN (SELECT id FROM public.sync_operations WHERE storage_key=$2 AND user_id=ANY($1::uuid[]))',[users,key]);
    await admin.query('DELETE FROM public.sync_record_history WHERE storage_key=$1 AND user_id=ANY($2::uuid[])',[key,users]);
    await admin.query('DELETE FROM public.legacy_sync_data WHERE storage_key=$1 AND user_id=ANY($2::uuid[])', [key, users]);
    await admin.query('DELETE FROM public.web_sync_devices WHERE id=ANY($1::uuid[])', [[device, secondDevice, ...sessions]]);
    await admin.query('COMMIT');
  }
  await admin.end();
}
