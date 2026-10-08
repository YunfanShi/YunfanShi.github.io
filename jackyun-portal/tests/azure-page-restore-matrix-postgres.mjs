// Schema captured read-only from source catalogs. All rows are local fixtures.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir,userInfo} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {ALL_BACKUP_PAGES,tableBackupPage} from '../src/lib/backup/pages.ts';
const {Client}=createRequire(new URL('../azure/backend/package.json',import.meta.url))('pg');
const schema=JSON.parse(readFileSync(new URL('./fixtures/azure-restore-business-schema.json',import.meta.url),'utf8')).tables;
const bin=process.env.PG_TEST_BIN;assert.ok(bin);
const root=mkdtempSync(join(tmpdir(),'jackyun-restore-matrix-')),data=join(root,'data'),socket=join(root,'socket');mkdirSync(socket,{mode:0o700});
const run=(name,args)=>{const r=spawnSync(join(bin,name),args,{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);};
const migration=name=>readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const a=uid(1),b=uid(2),quote=name=>`"${name.replaceAll('"','""')}"`;
let client,started=false;
try{
 run('initdb',['-D',data,'--no-locale','--encoding=UTF8','--auth-local=trust','--auth-host=scram-sha-256']);
 run('pg_ctl',['-D',data,'-l',join(root,'server.log'),'-o',`-k ${socket} -h '' -p 15440`,'-w','start']);started=true;
 client=new Client({host:socket,port:15440,user:userInfo().username,database:'postgres'});await client.connect();
 await client.query(`CREATE ROLE authenticated NOLOGIN;CREATE ROLE anon NOLOGIN;CREATE SCHEMA auth;CREATE SCHEMA jackyun_private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA auth TO authenticated;CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users,account_status text,deleted_at timestamptz);
 CREATE TABLE public.companion_devices(id uuid PRIMARY KEY);
 CREATE TABLE public.legacy_sync_data(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,storage_key text,storage_value jsonb,revision bigint,content_hash text,deleted_at timestamptz,client_updated_at timestamptz,updated_at timestamptz);
 CREATE TABLE public.backup_center_preferences(user_id uuid PRIMARY KEY,max_versions integer);
 CREATE TABLE public.backup_center_versions(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid,page text,reason text,source_table text,snapshot jsonb,retention_exempt boolean NOT NULL DEFAULT false);
 INSERT INTO auth.users VALUES('${a}'),('${b}');INSERT INTO public.profiles VALUES('${a}','active',null),('${b}','active',null);`);
 for(const t of schema){
  assert.ok(t.columns.every(c=>!c.generated&&!c.identity),'fixture must model generated columns explicitly');
  const cols=t.columns.map(c=>`${quote(c.name)} ${c.type}${c.notNull?' NOT NULL':''}`);
  await client.query(`CREATE TABLE public.${quote(t.relname)}(${[...cols,...t.constraints.filter(c=>c.type!=='f').map(c=>c.definition)].join(',')})`);
 }
 for(const t of schema)for(const c of t.constraints.filter(c=>c.type==='f'))await client.query(`ALTER TABLE public.${quote(t.relname)} ADD ${c.definition}`);
 const rows=new Map();
 for(const [i,t] of schema.entries())for(const [userIndex,owner] of [a,b].entries()){
  const r={};for(const c of t.columns){
   r[c.name]=!c.notNull?null:c.type==='uuid'?uid(100+i*2+userIndex):c.type==='boolean'?true:c.type.endsWith('[]')?[]:c.type==='jsonb'?{fixture:'原始中文📚'}:/^(smallint|integer|bigint|numeric|real|double)/.test(c.type)?1:c.type.includes('timestamp')?'2026-10-08T00:00:00Z':c.type==='date'?'2026-10-08':'fixture';
  }
  if('user_id' in r)r.user_id=owner;
  for(const c of t.constraints.filter(c=>c.type==='c')){
   for(const m of c.definition.matchAll(/(\w+) >= (\d+(?:\.\d+)?)/g))if(m[1] in r)r[m[1]]=Number(m[2]);
   for(const m of c.definition.matchAll(/(\w+) = ANY \(ARRAY\['([^']+)'/g))if(m[1] in r)r[m[1]]=m[2];
  }
  if(t.relname==='reader_books'){r.content_source='store';r.storage_path=null;}
  if(t.relname==='user_settings')r.key='theme_preference';
  if(t.relname==='companion_learning_queue'){r.hostname='fixture.test';r.url='https://fixture.test';}
  rows.set(`${t.relname}:${owner}`,r);
 }
 for(const t of schema)for(const owner of [a,b])for(const c of t.constraints.filter(c=>c.type==='f')){
  const m=c.definition.match(/^FOREIGN KEY \((\w+)\) REFERENCES ([\w.]+)\((\w+)\)/);assert.ok(m,c.definition);
  const r=rows.get(`${t.relname}:${owner}`);if(r[m[1]]===null)continue;
  const referenced=m[2].replace('public.','');r[m[1]]=['auth.users','profiles'].includes(referenced)?owner:rows.get(`${referenced}:${owner}`)?.[m[3]];
  assert.notEqual(r[m[1]],undefined,`missing required reference ${c.definition}`);
 }
 const pending=new Set(schema.map(t=>t.relname)),ordered=[];
 while(pending.size){let progress=false;for(const t of schema.filter(t=>pending.has(t.relname))){
  const dependencies=t.constraints.filter(c=>c.type==='f').map(c=>c.definition.match(/REFERENCES ([\w.]+)/)[1].replace('public.',''));
  if(dependencies.some(d=>pending.has(d)))continue;
  ordered.push(t);pending.delete(t.relname);progress=true;
 }assert.ok(progress,'unexpected cyclic FK');}
 const insert=async(t,r)=>client.query(`INSERT INTO public.${quote(t.relname)} SELECT * FROM jsonb_populate_record(null::public.${quote(t.relname)},$1::jsonb)`,[JSON.stringify(r)]);
 for(const t of ordered)for(const owner of [a,b])await insert(t,rows.get(`${t.relname}:${owner}`));
 const initial=migration('20260924091940_backup_center_versions.sql');
 await client.query(initial.slice(initial.indexOf('create function jackyun_private.backup_page_for_key'),initial.indexOf('create function jackyun_private.save_backup_page')));
 const save=migration('20260925100034_preserve_preincident_backup_versions.sql');await client.query(save.slice(save.indexOf('create or replace function')));
 await client.query(migration('20261008014421_azure_sync_backup_bridge.sql'));
 await client.query(migration('20261008014506_azure_page_restore_coordination.sql'));
 await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[a]);
 const rpc=async(sql,args)=>{await client.query('SET ROLE authenticated');try{return (await client.query(sql,args)).rows[0].result;}finally{await client.query('RESET ROLE');}};
 for(const [i,page] of ALL_BACKUP_PAGES.entries()){
  const backup=Number(await rpc('SELECT public.create_backup_page_with_sync($1,\'[]\'::jsonb,\'before_restore\') AS result',[page]));
  const prepared=await rpc('SELECT public.prepare_azure_page_restore($1,\'[]\'::jsonb,$2::uuid) AS result',[backup,uid(1000+i)]);
  assert.equal(prepared.page,page);
  const finished=await rpc('SELECT public.finish_azure_page_restore($1::uuid,\'[]\'::jsonb) AS result',[prepared.id]);assert.equal(finished.completed,true);
 }
 // Recreated singleton and keyed settings must retain the current row identity
 // while restoring the historical value through their account-scoped key.
 const recreated=['vocab_stats','vocab_settings','study_syllabus','study_config','music_settings','relax_state','timetable_hub_data','user_settings'];
 for(const [i,name] of recreated.entries()){
  const t=schema.find(t=>t.relname===name),page=tableBackupPage(name),original=rows.get(`${name}:${a}`);
  const backup=Number(await rpc('SELECT public.create_backup_page_with_sync($1,\'[]\'::jsonb,\'before_restore\') AS result',[page]));
  await client.query(`DELETE FROM public.${quote(name)} WHERE user_id=$1`,[a]);
  const replacement={...original,id:uid(2000+i)};await insert(t,replacement);
  const job=await rpc('SELECT public.prepare_azure_page_restore($1,\'[]\'::jsonb,$2::uuid) AS result',[backup,uid(3000+i)]);
  assert.equal((await rpc('SELECT public.finish_azure_page_restore($1::uuid,\'[]\'::jsonb) AS result',[job.id])).completed,true);
  assert.equal((await client.query(`SELECT id FROM public.${quote(name)} WHERE user_id=$1`,[a])).rows[0].id,replacement.id);
 }
 for(const t of schema){
  const owner=t.relname==='quiz_questions'?'session_id':'user_id',expected=t.relname==='quiz_questions'?rows.get(`quiz_sessions:${b}`).id:b;
  assert.equal((await client.query(`SELECT count(*)::int AS n FROM public.${quote(t.relname)} WHERE ${quote(owner)}=$1`,[expected])).rows[0].n,1);
 }
 console.log(JSON.stringify({ok:true,localOnly:true,actualCatalogSchema:true,businessTables:schema.length,pages:ALL_BACKUP_PAGES.length,checksAndForeignKeys:true,recreatedNaturalKeys:recreated.length,otherAccountPreserved:true,productionAcceptance:false}));
}finally{await client?.end();if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);rmSync(root,{recursive:true,force:true});}
