// Explicit local integration test. Starts an isolated Unix-socket-only PostgreSQL,
// never connects to production or changes the Homebrew default cluster.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,rmSync,mkdirSync,readFileSync } from 'node:fs';
import { tmpdir,userInfo } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { inspectReverseCopy,applyReverseCopy } from '../scripts/lib/azure-reverse-copy.mjs';
import { TABLES,inspectCutover,applyCutover,privateArchive } from '../scripts/lib/azure-cutover.mjs';
const {Client}=createRequire(new URL('../azure/backend/package.json',import.meta.url))('pg');
const bin=process.env.PG_TEST_BIN;
assert.ok(bin,'Set PG_TEST_BIN to the PostgreSQL 17 binary directory');
const root=mkdtempSync(join(tmpdir(),'jackyun-cutover-pg-'));
const data=join(root,'data'),socket=join(root,'socket');mkdirSync(socket,{mode:0o700});
const run=(name,args)=>{
  const result=spawnSync(join(bin,name),args,{encoding:'utf8',timeout:30_000});
  assert.equal(result.status,0,`${name} failed: ${result.stderr}`);
};
const user=userInfo().username;
let started=false;const clients=[];
const connect=async database=>{const c=new Client({host:socket,port:15437,user,database});await c.connect();clients.push(c);return c;};
try{
  run('initdb',['-D',data,'--no-locale','--encoding=UTF8','--auth-local=trust','--auth-host=scram-sha-256']);
  run('pg_ctl',['-D',data,'-l',join(root,'server.log'),'-o',`-k ${socket} -h '' -p 15437`,'-w','start']);started=true;
  const source=await connect('postgres');
  await source.query('CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN');
  await source.query('CREATE DATABASE jackyun_migration_20261007');
  const target=await connect('jackyun_migration_20261007');
  const fixture=async(client,targetSide)=>{
    await client.query(`CREATE SCHEMA auth;CREATE SCHEMA jackyun_private;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
      CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users,account_status text,deleted_at timestamptz);
      INSERT INTO public.profiles SELECT id,'active',NULL FROM auth.users;
      CREATE TABLE jackyun_private.backup_dirty_pages(user_id uuid,page text,changed_at timestamptz,first_changed_at timestamptz,change_bytes bigint,generation uuid DEFAULT gen_random_uuid(),PRIMARY KEY(user_id,page));
      CREATE FUNCTION jackyun_private.advance_generation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.generation:=gen_random_uuid();RETURN NEW; END $$;
      CREATE TRIGGER backup_dirty_generation BEFORE UPDATE ON jackyun_private.backup_dirty_pages FOR EACH ROW EXECUTE FUNCTION jackyun_private.advance_generation();
      CREATE FUNCTION public.fixture_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;`);
    for(const [index,table] of TABLES.entries()){
      await client.query(`CREATE TABLE public.${table}(id integer PRIMARY KEY,user_id uuid REFERENCES auth.users,payload jsonb,changed_at timestamptz,deleted_at timestamptz);
        ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
        GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON public.${table} TO authenticated;
        CREATE TRIGGER existing_trigger BEFORE INSERT ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.fixture_trigger();`);
      await client.query(`INSERT INTO public.${table} VALUES($1,'00000000-0000-4000-8000-000000000001',$2::jsonb,'2026-10-07T16:00:00Z',NULL)`,[index,JSON.stringify({value:targetSide?'old':'学习📚'})]);
      await client.query(`ALTER TABLE public.${table} ${['DISABLE','ENABLE','ENABLE REPLICA','ENABLE ALWAYS','ENABLE'][index]} TRIGGER existing_trigger`);
    }
  };
  await fixture(source,false);await fixture(target,true);
  await source.query("INSERT INTO jackyun_private.backup_dirty_pages VALUES('00000000-0000-4000-8000-000000000001','schedule','2026-10-07T16:00:00Z','2026-10-07T15:00:00Z',100,DEFAULT)");
  await source.query(`CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE FUNCTION public.create_backup_page(target_page text) RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT 7::bigint$$;
    CREATE FUNCTION public.create_due_backup_pages() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT 3$$;
    CREATE FUNCTION public.restore_backup_page(backup_id bigint) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT '{}'::jsonb$$;`);
  await source.query(readFileSync(new URL('../supabase/migrations/20261008000909_guard_legacy_backup_source.sql',import.meta.url),'utf8'));
  await source.query("SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false)");
  await source.query('SET ROLE authenticated');
  assert.equal((await source.query("SELECT public.create_backup_page('schedule') AS id")).rows[0].id,'7');
  await assert.rejects(source.query('SELECT * FROM jackyun_private.sync_source_control'),{code:'42501'});
  await assert.rejects(source.query("SELECT jackyun_private.source_create_backup_page('schedule')"),{code:'42501'});
  await source.query('RESET ROLE');
  const report=await inspectCutover(source,target);
  // Inject a real SQL failure after target truncation and verify committed source
  // ACL/fence recovery rather than merely mocking PostgreSQL responses.
  const targetQuery=target.query.bind(target);let fail=true;
  target.query=async(...args)=>{
    const result=await targetQuery(...args);
    if(fail&&String(args[0]).startsWith('TRUNCATE')){fail=false;throw Error('Injected target failure');}
    return result;
  };
  await assert.rejects(applyCutover({source,target,report,evidence:{localTest:true},archive:privateArchive(join(root,'failure'))}),{cutoverCode:'CUTOVER_ROLLED_BACK',sourceFrozen:false});
  target.query=targetQuery;
  const recovered=await inspectCutover(source,target);
  assert.deepEqual(recovered,report,'Original ACL and trigger state recovered exactly');
  for(const table of TABLES){
    assert.equal((await target.query(`SELECT payload->>'value' AS value FROM public.${table}`)).rows[0].value,'old','Target transaction rolled back');
  }
  const held=await connect('postgres');
  await held.query('BEGIN');
  await held.query("SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)");
  await held.query('SET LOCAL ROLE authenticated');
  assert.equal((await held.query('SELECT public.create_due_backup_pages() AS n')).rows[0].n,3);
  const sourcePid=(await source.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const pending=applyCutover({source,target,report:recovered,evidence:{localTest:true},archive:privateArchive(join(root,'success'))});
  let draining=false;
  for(let i=0;i<50;i++) {
    const activity=(await target.query('SELECT wait_event_type,query FROM pg_stat_activity WHERE pid=$1',[sourcePid])).rows[0];
    if(activity?.wait_event_type==='Lock' && activity.query.includes('sync_source_control')) {draining=true;break;}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.equal(draining,true,'cutover drains old RPC control locks before sync-table locks');
  await held.query('COMMIT');
  const result=await pending;
  assert.equal(result.committed,true);
  assert.equal((await source.query('SELECT sync_backend FROM jackyun_private.sync_source_control')).rows[0].sync_backend,'azure');
  await source.query('SET ROLE authenticated');
  for(const sql of ["SELECT public.create_backup_page('schedule')",'SELECT public.create_due_backup_pages()','SELECT public.restore_backup_page(7)']) {
    await assert.rejects(source.query(sql),{code:'55000'});
  }
  await source.query('RESET ROLE');
  for(const table of TABLES){
    assert.equal((await target.query(`SELECT payload->>'value' AS value FROM public.${table}`)).rows[0].value,'学习📚');
    await assert.rejects(source.query(`UPDATE public.${table} SET payload='{}'::jsonb`),{code:'55000'});
    await assert.rejects(source.query(`TRUNCATE public.${table}`),{code:'55000'});
  }
  assert.deepEqual((await target.query(`SELECT c.relname AS table_name,t.tgname,t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public' ORDER BY c.relname,t.tgname`)).rows,report.target.triggers);
  for(const [index,table] of TABLES.entries()) {
    await target.query(`UPDATE public.${table} SET payload=$1::jsonb,deleted_at='2026-10-08T00:00:00Z'`,[JSON.stringify({deleted:true,value:'Azure更新📚'})]);
    await target.query(`INSERT INTO public.${table} VALUES($1,'00000000-0000-4000-8000-000000000002',$2::jsonb,now(),NULL)`,[index+100,JSON.stringify({value:'Azure新增🐈'})]);
  }
  await source.query("UPDATE public.profiles SET account_status='suspended' WHERE id='00000000-0000-4000-8000-000000000002'");
  await source.query("UPDATE jackyun_private.backup_dirty_pages SET change_bytes=10000");
  const sourceGeneration=(await source.query('SELECT generation FROM jackyun_private.backup_dirty_pages')).rows[0].generation;
  await target.query("UPDATE jackyun_private.backup_dirty_pages SET change_bytes=20000,changed_at='2026-10-08T00:00:00Z'");
  await target.query("INSERT INTO jackyun_private.backup_dirty_pages VALUES('00000000-0000-4000-8000-000000000002','cue','2026-10-08T00:00:00Z','2026-10-08T00:00:00Z',300,DEFAULT)");
  const reverseReport=await inspectReverseCopy(source,target);
  const sourceQuery=source.query.bind(source);let failReverse=true;
  source.query=async(...args)=>{const r=await sourceQuery(...args);if(failReverse&&String(args[0]).startsWith('TRUNCATE')) {failReverse=false;throw Error('Injected source reverse failure');}return r;};
  const reverseFailure=privateArchive(join(root,'reverse-failure'));
  const evidence={localTest:true,checks:{sourceWritersPaused:true,targetWritersPaused:true,backupsVerified:true}};
  await assert.rejects(applyReverseCopy({source,target,report:reverseReport,evidence,archive:reverseFailure}),{cutoverCode:'REVERSE_COPY_ROLLED_BACK',committed:false,targetFrozen:true});
  source.query=sourceQuery;
  assert.equal((await source.query('SELECT count(*)::int AS n FROM public.legacy_sync_data')).rows[0].n,1);
  await assert.rejects(target.query("UPDATE public.legacy_sync_data SET payload='{}'::jsonb"),{code:'55000'});
  // Explicit local drill recovery after the known pre-commit rollback. Production
  // must inspect the outcome and choose routing before using this archive SQL.
  await target.query(readFileSync(join(reverseFailure.directory,'resume-azure-writes.sql'),'utf8'));
  const reverseResult=await applyReverseCopy({source,target,report:await inspectReverseCopy(source,target),evidence,archive:privateArchive(join(root,'reverse-success'))});
  assert.equal(reverseResult.committed,true);assert.equal(reverseResult.websiteSwitched,false);
  for(const table of TABLES) {
    const from=(await source.query(`SELECT * FROM public.${table} ORDER BY id`)).rows;
    assert.deepEqual(from,(await target.query(`SELECT * FROM public.${table} ORDER BY id`)).rows);
    assert.equal(from.length,2);assert.ok(from[0].deleted_at);
    await assert.rejects(source.query(`UPDATE public.${table} SET payload='{}'::jsonb`),{code:'55000'});
    await assert.rejects(target.query(`TRUNCATE public.${table}`),{code:'55000'});
  }
  assert.equal((await source.query("SELECT account_status FROM public.profiles WHERE id='00000000-0000-4000-8000-000000000002'")).rows[0].account_status,'suspended');
  assert.equal((await source.query('SELECT sync_backend FROM jackyun_private.sync_source_control')).rows[0].sync_backend,'azure');
  const merged=(await source.query('SELECT page,change_bytes,generation FROM jackyun_private.backup_dirty_pages ORDER BY page')).rows;
  assert.equal(merged.length,2);assert.equal(merged[1].change_bytes,'20000');assert.notEqual(merged[1].generation,sourceGeneration);
  await assert.rejects(target.query('DELETE FROM jackyun_private.backup_dirty_pages'),{code:'55000'});
  console.log(JSON.stringify({ok:true,postgresVersion:17,localOnly:true,targetRollback:true,sourceACLRestored:true,fiveTableCopy:true,unicodePreserved:true,sourceUpdateAndTruncateFenced:true,triggerStatesRestored:true,legacyBackupRPCsGuarded:true,inFlightLegacyRPCDrained:true,backupSourceRolledBack:true,reverseFiveTableCopy:true,reverseFailureRolledBack:true,reverseKeepsBothSidesFenced:true,sourceAuthorityPreserved:true,productionCutover:false}));
}finally{
  for(const client of clients)await client.end().catch(()=>{});
  if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
  rmSync(root,{recursive:true,force:true});
}
