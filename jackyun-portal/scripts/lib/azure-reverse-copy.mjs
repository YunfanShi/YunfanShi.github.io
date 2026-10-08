// Reverse copy keeps both sides fenced. Routing and ACL activation are separate.
import { TABLES, inspectCutover } from './azure-cutover.mjs';
import { readFileSync,lstatSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { createHash } from 'node:crypto';
const relations=TABLES.map(t=>`public.${t}`).join(',');
const fence='jackyun_rollback_write_fence';
const quote=v=>`"${String(v).replaceAll('"','""')}"`;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const rows=async(c,t,schema='public')=>(await c.query(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text COLLATE "C"),'[]'::jsonb) AS data FROM ${schema}.${t} r`)).rows[0].data;
const fingerprint=async(c,t)=>(await c.query(`SELECT count(*)::text AS count, md5(coalesce(string_agg(h,'' ORDER BY h COLLATE "C"),'')) AS hash FROM (SELECT md5(to_jsonb(r)::text) AS h FROM public.${t} r) hashes`)).rows[0];

export function validateReverseEvidence(file,report,now=Date.now()) {
  const read=path=>{
    const stat=lstatSync(path);
    if(!stat.isFile()||stat.isSymbolicLink()||(process.platform!=='win32'&&(stat.mode&0o077))||!stat.size) throw Error('Reverse evidence must be private regular files');
    return readFileSync(path);
  };
  if(!file) throw Error('Reverse evidence required');
  const evidence=JSON.parse(read(file));
  const age=now-Date.parse(evidence.verifiedAt);
  if(!Number.isFinite(age)||age<0||age>86_400_000||evidence.sourceProject!=='gdcwwlnzylrzrqhaaljq'||evidence.targetDatabase!==report.target.database) throw Error('Stale or mismatched reverse evidence');
  for(const check of ['sourceWritersPaused','targetWritersPaused','backupsVerified','backupRestoreDrill']) {
    if(evidence.checks?.[check]!==true) throw Error(`Missing ${check} verification`);
  }
  for(const key of ['sourceBackup','targetBackup','writersReport','restoreReport']) {
    const ref=evidence[key];
    if(!ref?.file||!/^[a-f0-9]{64}$/i.test(ref.sha256)) throw Error('Missing protected reverse artifact');
    if(createHash('sha256').update(read(resolve(dirname(file),ref.file))).digest('hex')!==ref.sha256.toLowerCase()) throw Error('Reverse artifact checksum mismatch');
  }
  return {verifiedAt:evidence.verifiedAt,checks:evidence.checks};
}

export async function inspectReverseCopy(source,target) {
  const report=await inspectCutover(source,target,{sourceFrozen:true});
  if(report.source.backupSource?.sync_backend!=='azure' || report.source.backupSource?.guard_version!==1
    || report.source.guardedBackupRPCs!==3) throw Error('Reverse copy requires the frozen Azure cutover state');
  if(report.target.triggers.some(t=>t.tgname===fence)) throw Error('Existing Azure rollback fence requires outcome inspection');
  return {...report,operation:'reverse-preflight'};
}

export async function applyReverseCopy({source,target,report,evidence,archive}) {
  let committed=false,azureFrozen=false,uncertain=false;
  const locks=[];
  try {
    if(evidence?.checks?.sourceWritersPaused!==true || evidence?.checks?.targetWritersPaused!==true
      || evidence?.checks?.backupsVerified!==true) throw Error('Reverse copy requires paused writers and verified backups');
    for(const client of [source,target]) {
      if(!(await client.query("SELECT pg_try_advisory_lock(hashtextextended('jackyun-sync-cutover',0)) AS acquired")).rows[0].acquired) throw Error('Migration already running');
      locks.push(client);
    }
    if(!same(await inspectReverseCopy(source,target),report)) throw Error('Reverse preflight changed');
    archive.write('reverse-preflight.json',{report,evidence});
    const frozenRelations=[...TABLES.map(t=>`public.${t}`),...(report.target.dirtyTable?['jackyun_private.backup_dirty_pages']:[])];
    archive.write('resume-azure-writes.sql',`-- Only after the source commit outcome is known and an explicit routing decision.\nBEGIN;\n${frozenRelations.map(t=>`DROP TRIGGER ${fence} ON ${t};`).join('\n')}\nDROP FUNCTION jackyun_private.${fence}();\nCOMMIT;\n`);
    await target.query('BEGIN');
    await target.query("SET LOCAL lock_timeout='10s'");
    await target.query(`LOCK TABLE ${frozenRelations.join(',')} IN ACCESS EXCLUSIVE MODE`);
    await target.query(`CREATE FUNCTION jackyun_private.${fence}() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Azure rollback write freeze' USING ERRCODE='55000'; END $$`);
    await target.query(`REVOKE ALL ON FUNCTION jackyun_private.${fence}() FROM PUBLIC`);
    for(const table of frozenRelations) {
      await target.query(`CREATE TRIGGER ${fence} BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION jackyun_private.${fence}()`);
      await target.query(`ALTER TABLE ${table} ENABLE ALWAYS TRIGGER ${fence}`);
    }
    uncertain=true;await target.query('COMMIT');azureFrozen=true;uncertain=false;
    await target.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await target.query("SET LOCAL timezone='UTC'");
    const snapshot={},hashes={};
    for(const table of TABLES) {snapshot[table]=await rows(target,table);hashes[table]=await fingerprint(target,table);}
    const dirty=report.target.dirtyTable?await rows(target,'backup_dirty_pages','jackyun_private'):null;
    await target.query('COMMIT');
    archive.write('azure-reverse-snapshot.json',{snapshot,hashes,dirty});
    await source.query('BEGIN');await source.query("SET LOCAL timezone='UTC'");await source.query("SET LOCAL lock_timeout='10s'");
    const state=(await source.query('SELECT sync_backend,guard_version FROM jackyun_private.sync_source_control WHERE singleton FOR UPDATE')).rows[0];
    if(!same(state,report.source.backupSource)) throw Error('Source control changed during reverse copy');
    await source.query(`LOCK TABLE ${relations}${dirty?',jackyun_private.backup_dirty_pages':''} IN ACCESS EXCLUSIVE MODE`);
    const before={};
    for(const table of TABLES) before[table]=await rows(source,table);
    if(dirty) before.dirty=await rows(source,'backup_dirty_pages','jackyun_private');
    archive.write('source-before-reverse.json',before);
    const sourceTriggers=report.source.triggers.filter(t=>TABLES.includes(t.table_name));
    for(const t of sourceTriggers) await source.query(`ALTER TABLE public.${quote(t.table_name)} DISABLE TRIGGER ${quote(t.tgname)}`);
    await source.query(`TRUNCATE ${relations}`);
    for(const table of TABLES) await source.query(`INSERT INTO public.${table} SELECT * FROM jsonb_populate_recordset(NULL::public.${table},$1::jsonb)`,[JSON.stringify(snapshot[table])]);
    if(dirty) await source.query(`INSERT INTO jackyun_private.backup_dirty_pages SELECT * FROM jsonb_populate_recordset(NULL::jackyun_private.backup_dirty_pages,$1::jsonb)
      ON CONFLICT(user_id,page) DO UPDATE SET changed_at=greatest(backup_dirty_pages.changed_at,excluded.changed_at),first_changed_at=least(backup_dirty_pages.first_changed_at,excluded.first_changed_at),change_bytes=greatest(backup_dirty_pages.change_bytes,excluded.change_bytes)`,[JSON.stringify(dirty)]);
    for(const t of sourceTriggers) {
      const command={O:'ENABLE',D:'DISABLE',R:'ENABLE REPLICA',A:'ENABLE ALWAYS'}[t.tgenabled];
      if(!command) throw Error('Unknown trigger state');
      await source.query(`ALTER TABLE public.${quote(t.table_name)} ${command} TRIGGER ${quote(t.tgname)}`);
    }
    const restoredTriggers=(await source.query(`SELECT c.relname AS table_name,t.tgname,t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relname=ANY($1) ORDER BY c.relname,t.tgname`,[TABLES])).rows;
    if(!same(restoredTriggers,sourceTriggers)) throw Error('Source trigger restoration mismatch');
    await target.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await target.query("SET LOCAL timezone='UTC'");
    for(const table of TABLES) if(!same(await fingerprint(source,table),hashes[table]) || !same(await fingerprint(target,table),hashes[table])) throw Error('Reverse fingerprint mismatch');
    for(const client of [source,target]) {
      const ids=(await client.query('SELECT id::text FROM auth.users ORDER BY id')).rows.map(r=>r.id);
      if(!same(ids,report.source.ids)) throw Error('Identity changed during reverse copy');
    }
    await target.query('COMMIT');
    archive.write('reverse-verified-before-commit.json',{hashes,sourceAccountStatesPreserved:true});
    uncertain=true;await source.query('COMMIT');committed=true;uncertain=false;
    const result={ok:true,committed,sourceFrozen:true,targetFrozen:true,migratedSyncTables:5,fingerprintsMatch:true,
      sourceAccountStatesPreserved:true,websiteSwitched:false,sourceBackupRPCsEnabled:false,archive:archive.directory};
    archive.write('reverse-verification.json',result);return result;
  } catch (cause) {
    await source.query('ROLLBACK').catch(()=>{});await target.query('ROLLBACK').catch(()=>{});
    const state={cutoverCode:committed?'REVERSE_COMMITTED_EVIDENCE_FAILED':uncertain?'REVERSE_COMMIT_OUTCOME_UNKNOWN':'REVERSE_COPY_ROLLED_BACK',
      committed,sourceFrozen:true,targetFrozen:azureFrozen||uncertain,recoveryArchive:archive.directory};
    try {archive.write('reverse-failure.json',state);}catch { /* Preserve actual commit outcome. */ }
    throw Object.assign(Error(state.cutoverCode,{cause}),state);
  } finally {
    for(const c of locks.reverse()) await c.query("SELECT pg_advisory_unlock(hashtextextended('jackyun-sync-cutover',0))").catch(()=>{});
  }
}
