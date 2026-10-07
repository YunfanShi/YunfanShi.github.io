// Runs the candidate backup RPC against isolated PostgreSQL, never production.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createAzureRecordClient } from '../src/lib/sync/azure-records.ts';
import { createAzureDueBackups } from '../src/lib/backup/azure-automatic-backup.ts';
import { canonicalJson } from '../src/lib/sync/hash.ts';
import { createSyncApi } from '../azure/backend/sync-api.mjs';
import { createFunctionHandler } from '../azure/backend/functions-adapter.mjs';
const {HttpRequest}=createRequire(new URL('../azure/backend/package.json',import.meta.url))('@azure/functions');
const {Client}=createRequire(new URL('../azure/backend/package.json',import.meta.url))('pg');
const bin=process.env.PG_TEST_BIN;
assert.ok(bin,'Set PG_TEST_BIN to PostgreSQL 17 binaries');
const root=mkdtempSync(join(tmpdir(),'jackyun-backup-pg-')),data=join(root,'data'),socket=join(root,'socket');
mkdirSync(socket,{mode:0o700});
const run=(name,args)=>{const r=spawnSync(join(bin,name),args,{encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${name}: ${r.stderr}`);};
const migration=name=>readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
let started=false,client,target;
try{
  run('initdb',['-D',data,'--no-locale','--encoding=UTF8','--auth-local=trust','--auth-host=scram-sha-256']);
  run('pg_ctl',['-D',data,'-l',join(root,'server.log'),'-o',`-k ${socket} -h '' -p 15439`,'-w','start']);started=true;
  client=new Client({host:socket,port:15439,user:userInfo().username,database:'postgres'});await client.connect();
  await client.query(`CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN;
    CREATE SCHEMA auth; CREATE SCHEMA jackyun_private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,account_status text,deleted_at timestamptz);
    CREATE TABLE public.legacy_sync_data(id bigint GENERATED ALWAYS AS IDENTITY,user_id uuid,storage_key text,storage_value jsonb,
      revision bigint,content_hash text,deleted_at timestamptz,client_updated_at timestamptz,updated_at timestamptz);
    CREATE TABLE public.timetable_hub_data(id uuid,user_id uuid,value jsonb);
    CREATE TABLE public.backup_center_preferences(user_id uuid,max_versions integer);
    CREATE TABLE public.backup_center_versions(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid,page text,
      reason text,source_table text,snapshot jsonb,retention_exempt boolean NOT NULL DEFAULT false);
    CREATE TABLE jackyun_private.backup_dirty_pages(user_id uuid,page text,change_bytes bigint,
      changed_at timestamptz not null default now(),first_changed_at timestamptz not null default now(),primary key(user_id,page));
    CREATE FUNCTION jackyun_private.frozen() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Old sync write rejected'; END$$;
    CREATE TRIGGER frozen BEFORE INSERT OR UPDATE OR DELETE ON public.legacy_sync_data FOR EACH STATEMENT EXECUTE FUNCTION jackyun_private.frozen();`);
  const initial=migration('20260924091940_backup_center_versions.sql');
  await client.query(initial.slice(initial.indexOf('create function jackyun_private.backup_page_for_key'),initial.indexOf('create function jackyun_private.save_backup_page')));
  const save=migration('20260925100034_preserve_preincident_backup_versions.sql');
  await client.query(save.slice(save.indexOf('create or replace function')));
  await client.query(migration('20261007174145_azure_sync_backup_bridge.sql'));
  await client.query("INSERT INTO public.profiles VALUES ($1,'active',null),($2,'active',null);",[a,b]);
  await client.query('ALTER TABLE public.legacy_sync_data DISABLE TRIGGER frozen');
  await client.query("INSERT INTO public.legacy_sync_data(user_id,storage_key,storage_value,revision,updated_at) VALUES ($1,'jackyun_schedule_control_v1','{\"text\":\"stale-source\"}',1,now()),($2,'jackyun_schedule_control_v1','{\"text\":\"other-private\"}',1,now())",[a,b]);
  await client.query('ALTER TABLE public.legacy_sync_data ENABLE ALWAYS TRIGGER frozen');
  await client.query("INSERT INTO public.timetable_hub_data VALUES ($1,$1,'{\"source\":\"current-source\"}'),($2,$2,'{\"source\":\"other-private\"}');",[a,b]);
  await client.query("INSERT INTO jackyun_private.backup_dirty_pages(user_id,page,change_bytes) VALUES ($1,'schedule',10);",[a]);
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[a]);
  const row={user_id:a,storage_key:'jackyun_schedule_control_v1',storage_value:{text:'当前课表📚'},revision:7,
    content_hash:'a'.repeat(64),deleted_at:null,client_updated_at:'2026-10-08T00:00:00Z',updated_at:'2026-10-08T00:00:00Z',extra:'discard'};
  const call=async(rows,reason='manual')=>{
    await client.query('SET ROLE authenticated');
    try{return (await client.query("SELECT public.create_backup_page_with_sync('schedule',$1::jsonb,$2) AS id",[JSON.stringify(rows),reason])).rows[0].id;}
    finally{await client.query('RESET ROLE');}
  };
  const id=await call([row],'before_restore');
  const saved=(await client.query('SELECT * FROM public.backup_center_versions WHERE id=$1',[id])).rows[0];
  assert.equal(saved.user_id,a);assert.equal(saved.source_table,'azure_sync');assert.equal(saved.retention_exempt,true);
  assert.equal(saved.snapshot.legacy_sync_data[0].storage_value.text,'当前课表📚');
  assert.equal(saved.snapshot.legacy_sync_data[0].extra,undefined);
  assert.equal(saved.snapshot.timetable_hub_data.length,1);assert.equal(saved.snapshot.timetable_hub_data[0].user_id,a);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM public.legacy_sync_data')).rows[0].n,2);
  assert.deepEqual((await client.query('SELECT storage_value,revision FROM public.legacy_sync_data WHERE user_id=$1',[a])).rows[0],
    {storage_value:{text:'stale-source'},revision:'1'});
  assert.equal((await client.query('SELECT change_bytes FROM jackyun_private.backup_dirty_pages')).rows[0].change_bytes,'10');
  for(const rows of [[{...row,user_id:b}],[{...row,storage_key:'access_token'}],[{...row,storage_key:'jackyun_theme'}],
    [row,row],[{...row,revision:0}],[{...row,updated_at:'invalid-date'}],[{...row,content_hash:'bad'}],null]){
    await assert.rejects(call(rows));
  }
  assert.equal((await client.query('SELECT count(*)::int AS n FROM public.backup_center_versions')).rows[0].n,1);
  await client.query("UPDATE public.profiles SET account_status='suspended' WHERE id=$1",[a]);
  await assert.rejects(call([row]),/Active account required/);
  await client.query("UPDATE public.profiles SET account_status='active',deleted_at=now() WHERE id=$1",[a]);
  await assert.rejects(call([row]),/Active account required/);
  await client.query('SET ROLE anon');
  await assert.rejects(client.query("SELECT public.create_backup_page_with_sync('schedule','[]'::jsonb)"),/permission denied/);
  await client.query('RESET ROLE');
  await client.query("UPDATE public.profiles SET deleted_at=null WHERE id=$1",[a]);
  await client.query(migration('20261007175839_azure_automatic_backup_coordination.sql'));
  await client.query("INSERT INTO jackyun_private.backup_dirty_pages(user_id,page,change_bytes) VALUES ($1,'schedule',4194304)",[b]);
  const initialGeneration=(await client.query("SELECT generation FROM jackyun_private.backup_dirty_pages WHERE user_id=$1",[a])).rows[0].generation;
  await client.query("UPDATE jackyun_private.backup_dirty_pages SET change_bytes=change_bytes WHERE user_id=$1",[a]);
  const freshGeneration=(await client.query("SELECT generation FROM jackyun_private.backup_dirty_pages WHERE user_id=$1",[a])).rows[0].generation;
  assert.notEqual(freshGeneration,initialGeneration,'identical counters/timestamps still advance generation');
  const azureGeneration='00000000-0000-4000-8000-000000000007';
  const capture=async(sourceGeneration,azureGen=azureGeneration)=>{
    await client.query('SET ROLE authenticated');
    try{return (await client.query("SELECT public.create_automatic_backup_with_sync('schedule',$1::jsonb,$2::uuid,$3::uuid) AS result",[JSON.stringify([row]),sourceGeneration,azureGen])).rows[0].result;}
    finally{await client.query('RESET ROLE');}
  };
  await client.query('SET ROLE authenticated');
  const markers=(await client.query('SELECT public.list_backup_change_markers() AS result')).rows[0].result;
  assert.equal(markers.length,1);assert.equal(markers[0].generation,freshGeneration);
  await assert.rejects(client.query('SELECT * FROM jackyun_private.backup_capture_receipts'),/permission denied/);
  await client.query('RESET ROLE');
  const first=await capture(freshGeneration);
  assert.equal(first.created,true);
  assert.equal((await client.query("SELECT count(*)::int AS n FROM jackyun_private.backup_dirty_pages WHERE user_id=$1",[a])).rows[0].n,0);
  await client.query('SET ROLE authenticated');
  assert.equal((await client.query("SELECT public.confirm_backup_capture('schedule',$1,$2) AS ok",[azureGeneration,first.versionId])).rows[0].ok,true);
  assert.equal((await client.query("SELECT public.confirm_backup_capture('settings',$1,$2) AS ok",[azureGeneration,first.versionId])).rows[0].ok,false);
  await client.query('RESET ROLE');
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[b]);await client.query('SET ROLE authenticated');
  assert.equal((await client.query("SELECT public.confirm_backup_capture('schedule',$1,$2) AS ok",[azureGeneration,first.versionId])).rows[0].ok,false);
  await client.query('RESET ROLE');await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[a]);
  const retry=await capture(null);
  assert.equal(retry.created,false);assert.equal(retry.versionId,first.versionId,'lost Azure ack does not create another version');
  assert.equal((await client.query("SELECT count(*)::int AS n FROM jackyun_private.backup_dirty_pages WHERE user_id=$1",[b])).rows[0].n,1);
  await client.query("INSERT INTO jackyun_private.backup_dirty_pages(user_id,page,change_bytes) VALUES ($1,'schedule',4194304)",[a]);
  const newer=(await client.query("SELECT generation FROM jackyun_private.backup_dirty_pages WHERE user_id=$1",[a])).rows[0].generation;
  const next=await capture(newer);assert.equal(next.created,true);assert.notEqual(next.versionId,first.versionId);
  await client.query("INSERT INTO jackyun_private.backup_dirty_pages(user_id,page,change_bytes) VALUES ($1,'schedule',4194304)",[a]);
  const retained=(await client.query("SELECT generation FROM jackyun_private.backup_dirty_pages WHERE user_id=$1",[a])).rows[0].generation;
  await capture(initialGeneration,'00000000-0000-4000-8000-000000000008');
  assert.equal((await client.query("SELECT generation FROM jackyun_private.backup_dirty_pages WHERE user_id=$1",[a])).rows[0].generation,retained,'stale source acknowledgment preserves a newer change');
  await client.query('SET ROLE anon');
  await assert.rejects(client.query('SELECT public.list_backup_change_markers()'),/permission denied/);
  await client.query('RESET ROLE');
  // A complete two-database flow through the Azure SDK HTTP adapter, shared
  // API, RLS SQL, source snapshot/receipt, and conditional Azure acknowledgment.
  await client.query('CREATE DATABASE jackyun_migration_20261008');
  target=new Client({host:socket,port:15439,user:userInfo().username,database:'jackyun_migration_20261008'});await target.connect();
  await target.query(`CREATE ROLE jackyun_sync_runtime NOLOGIN;
    CREATE SCHEMA auth; CREATE SCHEMA jackyun_private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,account_status text,deleted_at timestamptz);
    CREATE TABLE public.legacy_sync_data(id bigint GENERATED ALWAYS AS IDENTITY,user_id uuid,storage_key text,storage_value jsonb,
      revision bigint,content_hash text,deleted_at timestamptz,client_updated_at timestamptz,updated_at timestamptz);
    ALTER TABLE public.legacy_sync_data ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_sync ON public.legacy_sync_data TO jackyun_sync_runtime USING(user_id=(SELECT auth.uid()));
    CREATE TABLE jackyun_private.backup_dirty_pages(user_id uuid,page text,change_bytes bigint NOT NULL DEFAULT 0,
      changed_at timestamptz NOT NULL DEFAULT now(),first_changed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,page));
    CREATE FUNCTION public.sync_identity_allowed() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
      SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND account_status='active' AND deleted_at IS NULL)$$;
    REVOKE ALL ON FUNCTION auth.uid(),public.sync_identity_allowed() FROM PUBLIC,anon,authenticated;
    GRANT USAGE ON SCHEMA public,auth TO jackyun_sync_runtime;
    GRANT SELECT ON public.legacy_sync_data TO jackyun_sync_runtime;
    GRANT EXECUTE ON FUNCTION auth.uid(),public.sync_identity_allowed() TO jackyun_sync_runtime;`);
  await target.query(initial.slice(initial.indexOf('create function jackyun_private.backup_page_for_key'),initial.indexOf('create function jackyun_private.save_backup_page')));
  const cadence=migration('20260925111000_backup_change_or_time_cadence.sql');
  await target.query(cadence.slice(cadence.indexOf('create or replace function jackyun_private.backup_before_change'),cadence.indexOf('create or replace function public.create_due_backup_pages')));
  await target.query('CREATE TRIGGER mark_sync BEFORE INSERT OR UPDATE OR DELETE ON public.legacy_sync_data FOR EACH ROW EXECUTE FUNCTION jackyun_private.backup_before_change()');
  await target.query(readFileSync(new URL('../azure/sync-backup-markers.sql',import.meta.url),'utf8'));
  await target.query("INSERT INTO public.profiles VALUES($1,'active',null),($2,'active',null)",[a,b]);
  let azureValue={timetable:{text:'Azure当前课表📚'}};
  const contentHash=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
  await target.query("INSERT INTO public.legacy_sync_data(user_id,storage_key,storage_value,revision,content_hash,updated_at,client_updated_at) VALUES($1,'jackyun_schedule_control_v1',$3::jsonb,1,$4,now(),now()),($2,'jackyun_schedule_control_v1','{\"private\":true}',1,null,now(),now())",[a,b,JSON.stringify(azureValue),contentHash(azureValue)]);
  await target.query('UPDATE jackyun_private.backup_dirty_pages SET change_bytes=4194304');
  const sourceRPC=async(sql,args=[])=>{
    await client.query('SET ROLE authenticated');
    try{return {data:(await client.query(sql,args)).rows[0].result,error:null};}
    finally{await client.query('RESET ROLE');}
  };
  const database={async withUser(identity,work,{write=false}={}){
    assert.equal(identity.sub,a);await target.query('BEGIN');
    try{
      await target.query('SET LOCAL ROLE jackyun_sync_runtime');
      await target.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[identity.sub]);
      if(write)await target.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[identity.sub]);
      const result=await work(target);await target.query('COMMIT');return result;
    }catch(error){await target.query('ROLLBACK');throw error;}
  }};
  const handler=createFunctionHandler({authenticate:async authorization=>{
    assert.equal(authorization,'Bearer fixture-token');return {sub:a,role:'authenticated'};
  },handle:createSyncApi(database,{verifyBackupCapture:async(identity,token,body)=>{
    assert.equal(identity.sub,a);assert.equal(token,'fixture-token');
    const proof=await sourceRPC("SELECT public.confirm_backup_capture($1,$2,$3) AS result",[body.page,body.generation,body.versionId]);
    assert.equal(proof.data,true,'source receipt committed before Azure SQL acknowledgment');
  }}),logger:{error:()=>{}}});
  let failAcknowledgment=true,concurrentChange=false;
  const source=createAzureRecordClient({endpoint:'https://jackyun-sync-9d26b2cc.azurewebsites.net',token:'fixture-token',fetchImpl:async(url,options)=>{
    if(options.method==='POST'&&failAcknowledgment){failAcknowledgment=false;return Response.json({}, {status:503});}
    const result=await handler(new HttpRequest({method:options.method,url:String(url),headers:options.headers,
      ...(options.body?{body:{string:options.body}}:{})}));
    return new Response(result.body,{status:result.status,headers:result.headers});
  }});
  const checkpoints=[];
  const runDue=()=>createAzureDueBackups(source,a,()=>sourceRPC('SELECT public.list_backup_change_markers() AS result'),async args=>{
    const saved=await sourceRPC('SELECT public.create_automatic_backup_with_sync($1,$2::jsonb,$3::uuid,$4::uuid) AS result',
      [args.target_page,JSON.stringify(args.sync_records),args.source_generation,args.azure_generation]);
    checkpoints.push(saved.data);
    if(concurrentChange){
      concurrentChange=false;azureValue={timetable:{text:'备份期间的新课表📚'}};
      await target.query("UPDATE public.legacy_sync_data SET storage_value=$2::jsonb,revision=revision+1,content_hash=$3,updated_at=now(),client_updated_at=now() WHERE user_id=$1",[a,JSON.stringify(azureValue),contentHash(azureValue)]);
    }
    return saved;
  });
  await assert.rejects(runDue(),/503/);
  const checkpoint=checkpoints.at(-1);
  assert.equal(checkpoint.created,true);
  const combined=(await client.query('SELECT snapshot FROM public.backup_center_versions WHERE id=$1',[checkpoint.versionId])).rows[0].snapshot;
  assert.deepEqual(combined.legacy_sync_data[0].storage_value,azureValue);
  assert.equal(combined.timetable_hub_data[0].value.source,'current-source');
  assert.equal(combined.legacy_sync_data.length,1,'other account omitted by target RLS');
  assert.equal(await runDue(),0);assert.equal(checkpoints.at(-1).versionId,checkpoint.versionId);
  assert.equal((await target.query('SELECT count(*)::int AS n FROM jackyun_private.backup_dirty_pages WHERE user_id=$1',[a])).rows[0].n,0);
  // A sync write after the source snapshot cannot be cleared by its old token.
  azureValue={timetable:{text:'第二次备份前课表'}};
  await target.query("UPDATE public.legacy_sync_data SET storage_value=$2::jsonb,revision=revision+1,content_hash=$3,updated_at=now(),client_updated_at=now() WHERE user_id=$1",[a,JSON.stringify(azureValue),contentHash(azureValue)]);
  await target.query('UPDATE jackyun_private.backup_dirty_pages SET change_bytes=4194304 WHERE user_id=$1',[a]);
  concurrentChange=true;assert.equal(await runDue(),1);
  assert.equal((await target.query('SELECT count(*)::int AS n FROM jackyun_private.backup_dirty_pages WHERE user_id=$1',[a])).rows[0].n,1);
  assert.equal(await runDue(),1);
  const latest=(await client.query('SELECT snapshot FROM public.backup_center_versions WHERE id=$1',[checkpoints.at(-1).versionId])).rows[0].snapshot;
  assert.deepEqual(latest.legacy_sync_data[0].storage_value,azureValue);
  assert.equal((await target.query('SELECT count(*)::int AS n FROM jackyun_private.backup_dirty_pages WHERE user_id=$1',[a])).rows[0].n,0);
  assert.equal((await target.query('SELECT count(*)::int AS n FROM jackyun_private.backup_dirty_pages WHERE user_id=$1',[b])).rows[0].n,1);
  assert.equal((await client.query('SELECT storage_value FROM public.legacy_sync_data WHERE user_id=$1',[a])).rows[0].storage_value.text,'stale-source');
  // Install the real source cadence functions and guard wrappers. Azure-aware
  // snapshot capture remains available; old RPCs cannot save stale snapshots.
  await client.query(cadence.slice(cadence.indexOf('create or replace function public.create_due_backup_pages')));
  const restoreGrant='grant execute on function public.restore_backup_page(bigint) to authenticated;';
  await client.query(initial.slice(initial.indexOf('create function public.restore_backup_page'),initial.indexOf(restoreGrant)+restoreGrant.length));
  await client.query('GRANT EXECUTE ON FUNCTION public.create_backup_page(text),public.create_due_backup_pages() TO authenticated');
  await assert.rejects(target.query(migration('20261007235000_guard_legacy_backup_source.sql')),/Only Supabase source/);
  assert.equal((await target.query("SELECT to_regclass('jackyun_private.sync_source_control') AS control")).rows[0].control,null);
  await client.query(migration('20261007235000_guard_legacy_backup_source.sql'));
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[a]);
  await client.query('SET ROLE authenticated');
  const legacyId=(await client.query("SELECT public.create_backup_page('schedule') AS id")).rows[0].id;
  await client.query('RESET ROLE');
  assert.ok(Number(legacyId)>0,'guard keeps Supabase mode compatible');
  await client.query("UPDATE jackyun_private.sync_source_control SET sync_backend='azure'");
  const countBefore=(await client.query('SELECT count(*)::int AS n FROM public.backup_center_versions')).rows[0].n;
  await client.query('SET ROLE authenticated');
  for(const sql of ["SELECT public.create_backup_page('schedule')",'SELECT public.create_due_backup_pages()',`SELECT public.restore_backup_page(${legacyId})`]) {
    await assert.rejects(client.query(sql),{code:'55000'});
  }
  await assert.rejects(client.query('SELECT * FROM jackyun_private.sync_source_control'),{code:'42501'});
  await assert.rejects(client.query("SELECT jackyun_private.source_create_backup_page('schedule')"),{code:'42501'});
  await client.query('RESET ROLE');
  assert.equal((await client.query('SELECT count(*)::int AS n FROM public.backup_center_versions')).rows[0].n,countBefore);
  await call([row]); // Current Azure-supplied values can still be saved.
  console.log(JSON.stringify({ok:true,localOnly:true,realSQL:true,combinedSnapshot:true,noFrozenSyncWrites:true,
    dirtyMarkerPreserved:true,automaticBackupReceiptRetry:true,legacyRPCSourceGuard:true,twoDatabaseSDKFlow:true,generationRaceProtected:true,ownershipPageValidation:true,suspendedDeletedRejected:true,anonymousRejected:true,productionMigration:false}));
}finally{
  await target?.end();await client?.end();if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);rmSync(root,{recursive:true,force:true});
}
