// Explicit operator-only cutover. Credentials come from a protected child environment.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const { Client } = createRequire(new URL('../azure/backend/package.json', import.meta.url))('pg');
const root = path.resolve(import.meta.dirname, '..');
const tables = ['web_sync_devices', 'legacy_sync_data', 'sync_operations', 'sync_conflicts', 'web_sync_upload_chunks'];
const qualified = tables.map(t => `public.${t}`).join(',');
const roles = 'anon, authenticated, service_role';
const privateRoot = path.join(root, '.migration-private');
const archive = path.join(privateRoot, `sync-cutover-${Date.now()}`);
const source = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432,
  user: 'postgres.gdcwwlnzylrzrqhaaljq', database: 'postgres', password: process.env.SOURCEPGPASSWORD,
  ssl: { rejectUnauthorized: true, ca: readFileSync(path.join(privateRoot, 'supabase-prod-ca-2021.crt'), 'utf8') },
  statement_timeout: 120_000 });
const target = new Client({ host: 'jackyunasia.postgres.database.azure.com', port: 5432,
  user: 'jackyun_admin', database: 'jackyun_migration_20261007', password: process.env.TARGETPGPASSWORD,
  ssl: { rejectUnauthorized: true, ca: readFileSync(path.join(privateRoot, 'windows-trusted-roots.pem'), 'utf8') },
  statement_timeout: 120_000 });
async function rows(client, table) {
  return (await client.query(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb) AS data FROM public.${table} r`)).rows[0].data;
}
async function fingerprint(client, table) {
  return (await client.query(`SELECT count(*)::text AS count, md5(coalesce(string_agg(h,'' ORDER BY h COLLATE "C"),'')) AS hash
    FROM (SELECT md5(to_jsonb(r)::text) AS h FROM public.${table} r) hashes`)).rows[0];
}
let frozen = false;
let committed = false;
try {
  if (!process.env.SOURCEPGPASSWORD || !process.env.TARGETPGPASSWORD) throw Error('Credentials required');
  await source.connect(); await target.connect();
  const identities = async client => (await client.query('SELECT id::text FROM auth.users ORDER BY id')).rows.map(x => x.id).join(',');
  if (await identities(source) !== await identities(target)) throw Error('Auth identities differ; full auth delta required');
  const profileIds = async client => (await client.query('SELECT id::text FROM public.profiles ORDER BY id')).rows.map(x => x.id).join(',');
  if (await profileIds(source) !== await profileIds(target)) throw Error('Profile identities differ');
  // Guard the exact ACL that the rollback restores; never guess privileges.
  const acl = (await source.query(`SELECT c.relname,c.relacl::text AS acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1)`, [tables])).rows;
  const expected = '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}';
  if (acl.length !== 5 || acl.some(x => x.acl !== expected)) throw Error('Source ACL changed; review rollback first');
  mkdirSync(archive, { recursive: false });
  writeFileSync(path.join(archive, 'restore-source-writes.sql'), `GRANT INSERT,UPDATE,DELETE,TRUNCATE ON ${qualified} TO ${roles};\n`);
  await source.query('BEGIN');
  await source.query("SET LOCAL lock_timeout='10s'");
  await source.query(`LOCK TABLE ${qualified} IN ACCESS EXCLUSIVE MODE`);
  await source.query(`REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON ${qualified} FROM ${roles}`);
  await source.query('COMMIT'); frozen = true;
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot = {};
  const expectedHashes = {};
  for (const table of tables) { snapshot[table] = await rows(source, table); expectedHashes[table] = await fingerprint(source, table); }
  const profiles = (await source.query('SELECT id::text,account_status,deleted_at::text FROM public.profiles')).rows;
  await source.query('COMMIT');
  writeFileSync(path.join(archive, 'source-sync.json'), JSON.stringify({ snapshot, profiles }));
  await target.query('BEGIN');
  await target.query("SET LOCAL lock_timeout='10s'");
  await target.query(`LOCK TABLE ${qualified},public.profiles IN ACCESS EXCLUSIVE MODE`);
  const before = {};
  for (const table of tables) before[table] = await rows(target, table);
  before.profiles = await rows(target, 'profiles');
  writeFileSync(path.join(archive, 'target-before.json'), JSON.stringify(before));
  await target.query('ALTER TABLE public.legacy_sync_data DISABLE TRIGGER USER');
  await target.query('ALTER TABLE public.profiles DISABLE TRIGGER USER');
  await target.query(`TRUNCATE ${qualified}`);
  for (const table of tables) {
    await target.query(`INSERT INTO public.${table} SELECT * FROM jsonb_populate_recordset(NULL::public.${table},$1::jsonb)`, [JSON.stringify(snapshot[table])]);
  }
  for (const profile of profiles) {
    await target.query('UPDATE public.profiles SET account_status=$2,deleted_at=$3::timestamptz WHERE id=$1::uuid',
      [profile.id, profile.account_status, profile.deleted_at]);
  }
  await target.query('ALTER TABLE public.legacy_sync_data ENABLE TRIGGER USER');
  await target.query('ALTER TABLE public.profiles ENABLE TRIGGER USER');
  for (const table of tables) {
    if (JSON.stringify(await fingerprint(target, table)) !== JSON.stringify(expectedHashes[table])) throw Error('Delta fingerprint mismatch');
  }
  await target.query('COMMIT'); committed = true;
  const evidence = { migratedSyncTables: 5, fingerprintsMatch: true, sourceWritesFrozen: true,
    targetRows: Object.fromEntries(tables.map(t => [t, expectedHashes[t].count])), archive };
  writeFileSync(path.join(archive, 'verification.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} catch {
  await target.query('ROLLBACK').catch(() => {});
  await source.query('ROLLBACK').catch(() => {});
  if (frozen && !committed) await source.query(`GRANT INSERT,UPDATE,DELETE,TRUNCATE ON ${qualified} TO ${roles}`);
  throw Error('Sync cutover failed; target transaction rolled back and original source writes restored');
} finally {
  await source.end().catch(() => {}); await target.end().catch(() => {});
}
