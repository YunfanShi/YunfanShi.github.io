// Runs the candidate backup RPC against isolated PostgreSQL, never production.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const {Client}=createRequire(new URL('../azure/backend/package.json',import.meta.url))('pg');
const bin=process.env.PG_TEST_BIN;
assert.ok(bin,'Set PG_TEST_BIN to PostgreSQL 17 binaries');
const root=mkdtempSync(join(tmpdir(),'jackyun-backup-pg-')),data=join(root,'data'),socket=join(root,'socket');
mkdirSync(socket,{mode:0o700});
const run=(name,args)=>{const r=spawnSync(join(bin,name),args,{encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${name}: ${r.stderr}`);};
const migration=name=>readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
let started=false,client;
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
    CREATE TABLE jackyun_private.backup_dirty_pages(user_id uuid,page text,change_bytes bigint);
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
  await client.query("INSERT INTO jackyun_private.backup_dirty_pages VALUES ($1,'schedule',10);",[a]);
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
  console.log(JSON.stringify({ok:true,localOnly:true,realSQL:true,combinedSnapshot:true,noFrozenSyncWrites:true,
    dirtyMarkerPreserved:true,ownershipPageValidation:true,suspendedDeletedRejected:true,anonymousRejected:true,productionMigration:false}));
}finally{
  await client?.end();if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);rmSync(root,{recursive:true,force:true});
}
