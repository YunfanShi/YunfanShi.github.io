// Exercises the narrow Azure marker functions in an isolated database only.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const {Client}=createRequire(new URL('../azure/backend/package.json',import.meta.url))('pg');
const bin=process.env.PG_TEST_BIN;assert.ok(bin,'Set PG_TEST_BIN to PostgreSQL 17 binaries');
const root=mkdtempSync(join(tmpdir(),'jackyun-marker-pg-')),data=join(root,'data'),socket=join(root,'socket');
mkdirSync(socket,{mode:0o700});
const run=(name,args)=>{const r=spawnSync(join(bin,name),args,{encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${name}: ${r.stderr}`);};
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
let started=false,client;
try{
  run('initdb',['-D',data,'--no-locale','--encoding=UTF8','--auth-local=trust','--auth-host=scram-sha-256']);
  run('pg_ctl',['-D',data,'-l',join(root,'server.log'),'-o',`-k ${socket} -h '' -p 15440`,'-w','start']);started=true;
  const config={host:socket,port:15440,user:userInfo().username};
  client=new Client({...config,database:'postgres'});await client.connect();
  await client.query('CREATE DATABASE jackyun_migration_20261008');await client.end();
  client=new Client({...config,database:'jackyun_migration_20261008'});await client.connect();
  await client.query(`CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE jackyun_sync_runtime NOLOGIN;
    CREATE SCHEMA auth; CREATE SCHEMA jackyun_private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,account_status text,deleted_at timestamptz);
    CREATE TABLE jackyun_private.backup_dirty_pages(user_id uuid,page text,change_bytes bigint,
      changed_at timestamptz NOT NULL DEFAULT now(),first_changed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,page));
    CREATE FUNCTION public.sync_identity_allowed() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
      SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND account_status='active' AND deleted_at IS NULL)$$;
    REVOKE ALL ON FUNCTION auth.uid(),public.sync_identity_allowed() FROM PUBLIC,anon,authenticated;
    GRANT USAGE ON SCHEMA public,auth TO jackyun_sync_runtime;
    GRANT EXECUTE ON FUNCTION auth.uid(),public.sync_identity_allowed() TO jackyun_sync_runtime;`);
  await client.query(readFileSync(new URL('../azure/sync-backup-markers.sql',import.meta.url),'utf8'));
  await assert.rejects(client.query(readFileSync(new URL('../supabase/migrations/20261007174145_azure_sync_backup_bridge.sql',import.meta.url),'utf8')),/Only Supabase source backup migrations/);
  await client.query("INSERT INTO public.profiles VALUES($1,'active',null),($2,'active',null)",[a,b]);
  await client.query("INSERT INTO jackyun_private.backup_dirty_pages(user_id,page,change_bytes) VALUES($1,'schedule',4194304),($2,'schedule',4194304)",[a,b]);
  const invoke=async(user,sql,args=[])=>{
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);await client.query('SET ROLE jackyun_sync_runtime');
    try{return (await client.query(sql,args)).rows[0];}finally{await client.query('RESET ROLE');}
  };
  const first=(await invoke(a,'SELECT public.sync_backup_markers() AS markers')).markers;
  const other=(await invoke(b,'SELECT public.sync_backup_markers() AS markers')).markers;
  assert.equal(first.length,1);assert.equal(first[0].due,true);assert.equal(other.length,1);assert.notEqual(first[0].generation,other[0].generation);
  assert.equal((await invoke(a,'SELECT public.ack_sync_backup_marker($1,$2) AS ack',['schedule',other[0].generation])).ack,false);
  await client.query("UPDATE jackyun_private.backup_dirty_pages SET change_bytes=change_bytes WHERE user_id=$1",[a]);
  const updated=(await invoke(a,'SELECT public.sync_backup_markers() AS markers')).markers[0];assert.notEqual(updated.generation,first[0].generation);
  assert.equal((await invoke(a,'SELECT public.ack_sync_backup_marker($1,$2) AS ack',['schedule',first[0].generation])).ack,false);
  assert.equal((await invoke(a,'SELECT public.ack_sync_backup_marker($1,$2) AS ack',['schedule',updated.generation])).ack,true);
  assert.equal((await invoke(a,'SELECT public.sync_backup_markers() AS markers')).markers.length,0);
  assert.equal((await invoke(b,'SELECT public.sync_backup_markers() AS markers')).markers.length,1);
  await assert.rejects(invoke(a,'SELECT * FROM jackyun_private.backup_dirty_pages'),/permission denied/);
  await client.query('SET ROLE authenticated');
  await assert.rejects(client.query('SELECT public.sync_backup_markers()'),/permission denied/);await client.query('RESET ROLE');
  await client.query('SET ROLE anon');
  await assert.rejects(client.query("SELECT public.ack_sync_backup_marker('schedule',$1)",[other[0].generation]),/permission denied/);await client.query('RESET ROLE');
  await client.query("UPDATE public.profiles SET account_status='suspended' WHERE id=$1",[b]);
  await assert.rejects(invoke(b,'SELECT public.sync_backup_markers()'),/Active identity required/);
  await client.query("UPDATE public.profiles SET account_status='active',deleted_at=now() WHERE id=$1",[b]);
  await assert.rejects(invoke(b,"SELECT public.ack_sync_backup_marker('schedule',$1)",[other[0].generation]),/Active identity required/);
  console.log(JSON.stringify({ok:true,localOnly:true,realSQL:true,narrowRuntimeFunctions:true,noDirectTableAccess:true,
    ownMarkersOnly:true,generationRaceProtected:true,anonymousSuspendedDeletedRejected:true,productionMigration:false}));
}finally{
  await client?.end();if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);rmSync(root,{recursive:true,force:true});
}
