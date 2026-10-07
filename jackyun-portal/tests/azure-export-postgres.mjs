// Isolated local SQL/RLS test; never connects to a production database.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createSyncApi } from '../azure/backend/sync-api.mjs';
import { createAzureRecordClient } from '../src/lib/sync/azure-records.ts';
const {Client}=createRequire(new URL('../azure/backend/package.json',import.meta.url))('pg');
const bin=process.env.PG_TEST_BIN;
assert.ok(bin,'Set PG_TEST_BIN to PostgreSQL 17 binaries');
const root=mkdtempSync(join(tmpdir(),'jackyun-export-pg-')),data=join(root,'data'),socket=join(root,'socket');
mkdirSync(socket,{mode:0o700});
const run=(name,args)=>{const result=spawnSync(join(bin,name),args,{encoding:'utf8',timeout:30000});assert.equal(result.status,0,`${name}: ${result.stderr}`);};
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
let started=false,client;
try{
  run('initdb',['-D',data,'--no-locale','--encoding=UTF8','--auth-local=trust','--auth-host=scram-sha-256']);
  run('pg_ctl',['-D',data,'-l',join(root,'server.log'),'-o',`-k ${socket} -h '' -p 15438`,'-w','start']);started=true;
  client=new Client({host:socket,port:15438,user:userInfo().username,database:'postgres'});await client.connect();
  await client.query(`CREATE ROLE authenticated NOLOGIN;
    CREATE TABLE public.legacy_sync_data(user_id uuid,storage_key text,storage_value jsonb,revision integer,
      content_hash text,deleted_at timestamptz,updated_at timestamptz,client_updated_at timestamptz);
    ALTER TABLE public.legacy_sync_data ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_rows ON public.legacy_sync_data TO authenticated USING(user_id=current_setting('request.jwt.claim.sub',true)::uuid);
    GRANT SELECT ON public.legacy_sync_data TO authenticated;`);
  const items=Array.from({length:530},(_,i)=>({user_id:a,storage_key:`azure_backend_export_${String(i).padStart(4,'0')}`,storage_value:{i},revision:1,updated_at:'2026-10-08T00:00:00Z',content_hash:null}));
  items.push({user_id:b,storage_key:'azure_backend_other_account',storage_value:{private:true},revision:1,updated_at:'2026-10-08T00:00:00Z',content_hash:null});
  for(const key of ['azure_backend_debug_hidden','数据📚','数据\uE000'])items.push({...items[0],storage_key:key});
  await client.query('INSERT INTO public.legacy_sync_data SELECT * FROM jsonb_populate_recordset(NULL::public.legacy_sync_data,$1::jsonb)',[JSON.stringify(items)]);
  const database={async withUser(identity,work){
    await client.query('BEGIN');try{
      await client.query('SET LOCAL ROLE authenticated');
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[identity.sub]);
      const result=await work(client);await client.query('COMMIT');return result;
    }catch(error){await client.query('ROLLBACK');throw error;}
  }};
  const api=createSyncApi(database);
  const read=async user=>createAzureRecordClient({endpoint:'https://jackyun-sync-9d26b2cc.azurewebsites.net',token:'local-fixture',
    fetchImpl:async url=>Response.json(await api('GET',new URL(url),null,{sub:user,role:'authenticated'}))}).list({values:false});
  const first=await read(a),second=await read(b),again=await read(a);
  assert.equal(first.length,532);assert.equal(new Set(first.map(r=>r.key)).size,532);
  assert.equal(second.length,1);assert.equal(second[0].key,'azure_backend_other_account');
  assert.deepEqual(again,first,'A B A does not retain the previous user context');
  assert.ok(first.every(r=>!r.key.includes('debug')&&r.key!=='azure_backend_other_account'));
  assert.ok(first.some(r=>r.key==='数据📚')&&first.some(r=>r.key==='数据\uE000'));
  console.log(JSON.stringify({ok:true,localOnly:true,realSQL:true,tenantRLSPagination:true,over500Records:true,unicodeCursor:true,contextReset:true,productionLogin:false}));
}finally{
  await client?.end();if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);rmSync(root,{recursive:true,force:true});
}
