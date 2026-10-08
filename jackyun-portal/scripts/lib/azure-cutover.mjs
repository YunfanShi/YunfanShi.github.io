import { mkdirSync, writeFileSync, readFileSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { atStage } from './azure-cutover-diagnostics.mjs';

export const TABLES = ['web_sync_devices', 'legacy_sync_data', 'sync_operations', 'sync_conflicts', 'web_sync_upload_chunks'];
const relations = TABLES.map(t => `public.${t}`).join(',');
const fence = 'jackyun_cutover_write_fence';
const restoreBackupSource = "UPDATE jackyun_private.sync_source_control SET sync_backend='supabase' WHERE singleton AND guard_version=1;";
const quote = value => `"${String(value).replaceAll('"', '""')}"`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const columnsCatalog = `SELECT c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname=ANY($1) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`;
const tableCatalog = `SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls,
  c.relacl::text AS acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname=ANY($1) ORDER BY c.relname`;
const triggersCatalog = `SELECT c.relname AS table_name,t.tgname,t.tgenabled FROM pg_trigger t
  JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relname=ANY($1) ORDER BY c.relname,t.tgname`;

export function privateArchive(root) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  if (lstatSync(root).isSymbolicLink() || (process.platform !== 'win32' && (lstatSync(root).mode & 0o077))) throw Error('Migration directory must be private');
  const directory = join(realpathSync(root), `sync-cutover-${Date.now()}-${randomUUID()}`);
  mkdirSync(directory, { mode: 0o700 });
  return { directory, write(name, value) {
    if (!/^[a-z0-9-]+\.(json|sql)$/.test(name)) throw Error('Invalid archive name');
    writeFileSync(join(directory, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
  } };
}

// Operator evidence is required; unit-test signatures are not live-login evidence.
export function validateEvidence(file, report, now = Date.now()) {
  if (!file) throw Error('Protected live verification and backup evidence is required');
  const evidenceStats = lstatSync(file);
  if (!evidenceStats.isFile() || evidenceStats.isSymbolicLink() || (process.platform !== 'win32' && (evidenceStats.mode & 0o077))) throw Error('Evidence must be private regular files');
  const evidence = JSON.parse(readFileSync(file, 'utf8'));
  const age = now - Date.parse(evidence.verifiedAt);
  if (!Number.isFinite(age) || age < 0 || age > 86_400_000 || evidence.targetDatabase !== report.target.database
      || evidence.sourceProject !== 'gdcwwlnzylrzrqhaaljq') throw Error('Stale or mismatched evidence');
  for (const check of ['realLogin', 'twoUserIsolation', 'deviceRevocation', 'accountSuspension', 'reverseCopyDrill',
    'sourceWritersPaused', 'targetWritersPaused', 'backupRoutingVerified']) {
    if (evidence.checks?.[check] !== true) throw Error(`Missing ${check} verification`);
  }
  for (const name of ['sourceBackup', 'targetBackup', 'liveReport', 'rollbackReport']) {
    const ref = evidence[name];
    if (!ref?.file || !/^[a-f0-9]{64}$/i.test(ref.sha256)) throw Error('Missing protected evidence file');
    const path = resolve(dirname(file), ref.file); const stats = lstatSync(path);
    if (!stats.isFile() || stats.isSymbolicLink() || (process.platform !== 'win32' && (stats.mode & 0o077))) throw Error('Evidence must be private regular files');
    if (!stats.size || createHash('sha256').update(readFileSync(path)).digest('hex') !== ref.sha256.toLowerCase()) throw Error('Evidence checksum mismatch');
  }
  return { verifiedAt: evidence.verifiedAt, checks: evidence.checks };
}

async function inspect(client, allowSourceFence = false) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await client.query("SET LOCAL statement_timeout='30s'");
    await client.query("SET LOCAL timezone='UTC'");
    const database = (await client.query('SELECT current_database() AS database, session_user AS operator')).rows[0];
    const tables = (await client.query(tableCatalog, [TABLES])).rows;
    if (tables.length !== TABLES.length || tables.some(t => !t.rls)) throw Error('Missing tables or RLS');
    const columns = (await client.query(columnsCatalog,[TABLES])).rows;
    if (!columns.length) throw Error('Sync columns missing');
    const grants = (await client.query(`SELECT c.relname,pg_get_userbyid(a.grantor) AS grantor,
      CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
      a.privilege_type,a.is_grantable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE n.nspname='public' AND c.relname=ANY($1) ORDER BY c.relname,grantee,a.privilege_type`, [TABLES])).rows;
    const triggers = (await client.query(triggersCatalog, [[...TABLES, 'profiles']])).rows;
    const fences=triggers.filter(t=>t.tgname===fence);
    if (allowSourceFence ? fences.length!==5 || fences.some(t=>!TABLES.includes(t.table_name)||t.tgenabled!=='A') : fences.length>0) {
      throw Error('Existing fence requires explicit recovery');
    }
    const ids = (await client.query('SELECT id::text FROM auth.users ORDER BY id')).rows.map(r => r.id);
    const profiles = (await client.query('SELECT id::text,account_status,deleted_at::text FROM public.profiles ORDER BY id')).rows;
    const background = (await client.query("SELECT to_regclass('cron.job')::text AS cron, to_regclass('jackyun_private.backup_dirty_pages')::text AS dirty")).rows[0];
    const control = (await client.query("SELECT to_regclass('jackyun_private.sync_source_control')::text AS control")).rows[0]?.control;
    const backupSource = control ? (await client.query('SELECT sync_backend,guard_version FROM jackyun_private.sync_source_control WHERE singleton')).rows[0] ?? null : null;
    const guardedBackupRPCs = control ? (await client.query(`SELECT count(*)::int AS count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.oid=ANY(ARRAY[to_regprocedure('public.create_backup_page(text)'),
      to_regprocedure('public.create_due_backup_pages()'),to_regprocedure('public.restore_backup_page(bigint)')])
      AND p.prosecdef AND pg_get_functiondef(p.oid) LIKE '%jackyun_private.require_supabase_backup_source()%'`)).rows[0].count : 0;
    const jobs = background.cron ? (await client.query('SELECT jobid,active FROM cron.job ORDER BY jobid')).rows : [];
    const prepared = (await client.query('SELECT count(*)::int AS count FROM pg_prepared_xacts WHERE database=current_database()')).rows[0].count;
    if (prepared || jobs.some(j => j.active)) throw Error('Drain prepared transactions and pause jobs first');
    await client.query('COMMIT');
    return { ...database, tables, columns, grants, triggers, ids, profiles, jobs, dirtyTable: Boolean(background.dirty), backupSource, guardedBackupRPCs };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export async function inspectCutover(source, target, { sourceFrozen = false } = {}) {
  const from = await atStage('source_catalog',()=>inspect(source,sourceFrozen));
  const to = await atStage('target_catalog',()=>inspect(target));
  return atStage('compare_catalog',()=>{
  if (from.database !== 'postgres' || !/^jackyun_migration_\d{8}$/.test(to.database)) throw Error('Unexpected database');
  if (!same(from.ids,to.ids) || !same(from.profiles.map(p => p.id),to.profiles.map(p => p.id))) throw Error('Provision identity delta separately');
  if (from.dirtyTable !== to.dirtyTable) throw Error('Backup schema differs');
  if (!same(from.columns,to.columns)) throw Error('Sync columns differ');
  if (from.grants.some(g => g.grantor !== from.tables.find(t => t.relname === g.relname)?.owner)) throw Error('Delegated grants need owner review');
  return { operation: 'preflight', writesPerformed: false, source: from, target: to };
  });
}

export function restorationSQL(report) {
  return report.source.grants.filter(g => ['INSERT','UPDATE','DELETE','TRUNCATE'].includes(g.privilege_type)
      && g.grantee !== report.source.tables.find(t => t.relname === g.relname)?.owner)
    .map(g => `GRANT ${g.privilege_type} ON public.${quote(g.relname)} TO ${g.grantee === 'PUBLIC' ? 'PUBLIC' : quote(g.grantee)}${g.is_grantable ? ' WITH GRANT OPTION' : ''};`).join('\n');
}

async function dropFence(client) {
  for (const table of TABLES) await client.query(`DROP TRIGGER ${fence} ON public.${table}`);
  await client.query(`DROP FUNCTION jackyun_private.${fence}()`);
}
async function rows(client, table, schema = 'public') {
  return (await client.query(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text COLLATE "C"),'[]'::jsonb) AS data FROM ${schema}.${table} r`)).rows[0].data;
}
async function fingerprint(client, table) {
  return (await client.query(`SELECT count(*)::text AS count, md5(coalesce(string_agg(h,'' ORDER BY h COLLATE "C"),'')) AS hash
    FROM (SELECT md5(to_jsonb(r)::text) AS h FROM public.${table} r) hashes`)).rows[0];
}

export async function applyCutover({ source, target, report, evidence, archive }) {
  let frozen = false; let committed = false; let uncertain = false;
  const locks = []; const restore = restorationSQL(report);
  try {
    if (report.source.backupSource?.sync_backend !== 'supabase' || report.source.backupSource?.guard_version !== 1
      || report.source.guardedBackupRPCs !== 3) throw Object.assign(Error('Legacy backup source guards required'),{cutoverCode:'BACKUP_SOURCE_GUARDS_REQUIRED'});
    for (const client of [source,target]) {
      if (!(await client.query("SELECT pg_try_advisory_lock(hashtextextended('jackyun-sync-cutover',0)) AS acquired")).rows[0].acquired) throw Error('Migration already running');
      locks.push(client);
    }
    if (!same(await inspectCutover(source,target),report)) throw Error('Preflight changed');
    archive.write('preflight.json',{ report,evidence });
    archive.write('restore-source-writes.sql', `-- Only before target commit or after verified reverse copy.\nBEGIN;\n${TABLES.map(t => `DROP TRIGGER ${fence} ON public.${t};`).join('\n')}\nDROP FUNCTION jackyun_private.${fence}();\n${restore}\n${restoreBackupSource}\nCOMMIT;\n`);
    await source.query('BEGIN');
    await source.query("SET LOCAL lock_timeout='10s'");
    const lockedBackupSource = (await source.query('SELECT sync_backend,guard_version FROM jackyun_private.sync_source_control WHERE singleton FOR UPDATE')).rows[0];
    if (!same(lockedBackupSource,report.source.backupSource)) throw Error('Backup source changed during cutover');
    await source.query(`LOCK TABLE ${relations} IN ACCESS EXCLUSIVE MODE`);
    await source.query(`CREATE FUNCTION jackyun_private.${fence}() RETURNS trigger LANGUAGE plpgsql
      SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Sync migration write freeze' USING ERRCODE='55000'; END $$`);
    await source.query(`REVOKE ALL ON FUNCTION jackyun_private.${fence}() FROM PUBLIC`);
    for (const table of report.source.tables) {
      await source.query(`CREATE TRIGGER ${fence} BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.${quote(table.relname)} FOR EACH STATEMENT EXECUTE FUNCTION jackyun_private.${fence}()`);
      await source.query(`ALTER TABLE public.${quote(table.relname)} ENABLE ALWAYS TRIGGER ${fence}`);
      const grantees = [...new Set(report.source.grants.filter(g => g.relname === table.relname && g.grantee !== table.owner)
        .map(g => g.grantee === 'PUBLIC' ? 'PUBLIC' : quote(g.grantee)))];
      if (grantees.length) await source.query(`REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.${quote(table.relname)} FROM ${grantees.join(',')}`);
    }
    await source.query("UPDATE jackyun_private.sync_source_control SET sync_backend='azure' WHERE singleton AND guard_version=1");
    uncertain = true; await source.query('COMMIT'); frozen = true; uncertain = false;
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await source.query("SET LOCAL timezone='UTC'");
    const snapshot = {}; const hashes = {};
    for (const table of TABLES) { snapshot[table] = await rows(source,table); hashes[table] = await fingerprint(source,table); }
    const profiles = (await source.query('SELECT id::text,account_status,deleted_at::text FROM public.profiles ORDER BY id')).rows;
    const dirty = report.source.dirtyTable ? await rows(source,'backup_dirty_pages','jackyun_private') : null;
    await source.query('COMMIT');
    archive.write('source-sync.json',{ snapshot,profiles,dirty,hashes });
    await target.query('BEGIN'); await target.query("SET LOCAL timezone='UTC'"); await target.query("SET LOCAL lock_timeout='10s'");
    await target.query(`LOCK TABLE ${relations},public.profiles${dirty ? ',jackyun_private.backup_dirty_pages' : ''} IN ACCESS EXCLUSIVE MODE`);
    const before = {};
    for (const table of TABLES) before[table] = await rows(target,table);
    before.profiles = await rows(target,'profiles');
    if (dirty) before.dirty = await rows(target,'backup_dirty_pages','jackyun_private');
    archive.write('target-before.json',before);
    for (const t of report.target.triggers) await target.query(`ALTER TABLE public.${quote(t.table_name)} DISABLE TRIGGER ${quote(t.tgname)}`);
    await target.query(`TRUNCATE ${relations}`);
    for (const table of TABLES) await target.query(`INSERT INTO public.${table} SELECT * FROM jsonb_populate_recordset(NULL::public.${table},$1::jsonb)`,[JSON.stringify(snapshot[table])]);
    for (const p of profiles) await target.query('UPDATE public.profiles SET account_status=$2,deleted_at=$3::timestamptz WHERE id=$1::uuid',[p.id,p.account_status,p.deleted_at]);
    if (dirty) await target.query(`INSERT INTO jackyun_private.backup_dirty_pages SELECT * FROM jsonb_populate_recordset(NULL::jackyun_private.backup_dirty_pages,$1::jsonb)
      ON CONFLICT(user_id,page) DO UPDATE SET changed_at=greatest(backup_dirty_pages.changed_at,excluded.changed_at),
      first_changed_at=least(backup_dirty_pages.first_changed_at,excluded.first_changed_at),change_bytes=greatest(backup_dirty_pages.change_bytes,excluded.change_bytes)`,[JSON.stringify(dirty)]);
    for (const t of report.target.triggers) {
      const command = { O:'ENABLE',D:'DISABLE',R:'ENABLE REPLICA',A:'ENABLE ALWAYS' }[t.tgenabled];
      if (!command) throw Error('Unknown trigger state');
      await target.query(`ALTER TABLE public.${quote(t.table_name)} ${command} TRIGGER ${quote(t.tgname)}`);
    }
    for (const table of TABLES) if (!same(await fingerprint(target,table),hashes[table])) throw Error('Fingerprint mismatch');
    const applied = (await target.query('SELECT id::text,account_status,deleted_at::text FROM public.profiles ORDER BY id')).rows;
    const current = (await source.query('SELECT id::text,account_status,deleted_at::text FROM public.profiles ORDER BY id')).rows;
    const ids = (await source.query('SELECT id::text FROM auth.users ORDER BY id')).rows.map(r => r.id);
    if (!same(profiles,applied) || !same(profiles,current) || !same(ids,report.source.ids)) throw Error('Identity changed during cutover');
    if (!same((await target.query(triggersCatalog,[[...TABLES,'profiles']])).rows,report.target.triggers)) throw Error('Trigger restoration mismatch');
    archive.write('verified-before-commit.json',{ hashes,profileCount:profiles.length });
    uncertain = true; await target.query('COMMIT'); committed = true; uncertain = false;
    const result = { ok:true,committed,sourceFrozen:true,migratedSyncTables:5,fingerprintsMatch:true,archive:archive.directory,websiteSwitched:false };
    archive.write('verification.json',result); return result;
  } catch (error) {
    await target.query('ROLLBACK').catch(() => {}); await source.query('ROLLBACK').catch(() => {});
    let code = committed ? 'COMMITTED_EVIDENCE_FAILED' : uncertain ? 'COMMIT_OUTCOME_UNKNOWN' : error.cutoverCode ?? 'CUTOVER_ROLLED_BACK';
    if (frozen && !committed && !uncertain) {
      try { await source.query('BEGIN'); await dropFence(source); if (restore) await source.query(restore); await source.query(restoreBackupSource); await source.query('COMMIT'); frozen = false; }
      catch { await source.query('ROLLBACK').catch(() => {}); code = 'SOURCE_RECOVERY_REQUIRED'; }
    }
    const state = { code,committed,sourceFrozen:frozen || uncertain,recoveryArchive:archive.directory };
    try { archive.write('failure.json',state); } catch { /* Keep the real commit outcome. */ }
    throw Object.assign(Error(code),state,{ cutoverCode:code });
  } finally {
    for (const client of locks.reverse()) await client.query("SELECT pg_advisory_unlock(hashtextextended('jackyun-sync-cutover',0))").catch(() => {});
  }
}
