// Explicit local integration test. Starts an isolated Unix-socket-only PostgreSQL,
// never connects to production or changes the Homebrew default cluster.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,rmSync,mkdirSync } from 'node:fs';
import { tmpdir,userInfo } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
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
  await source.query('CREATE ROLE authenticated NOLOGIN');
  await source.query('CREATE DATABASE jackyun_migration_20261007');
  const target=await connect('jackyun_migration_20261007');
  const fixture=async(client,targetSide)=>{
    await client.query(`CREATE SCHEMA auth;CREATE SCHEMA jackyun_private;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
      CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users,account_status text,deleted_at timestamptz);
      INSERT INTO public.profiles SELECT id,'active',NULL FROM auth.users;
      CREATE FUNCTION public.fixture_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;`);
    for(const [index,table] of TABLES.entries()){
      await client.query(`CREATE TABLE public.${table}(id integer PRIMARY KEY,user_id uuid REFERENCES auth.users,payload jsonb,changed_at timestamptz);
        ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
        GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON public.${table} TO authenticated;
        CREATE TRIGGER existing_trigger BEFORE INSERT ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.fixture_trigger();`);
      await client.query(`INSERT INTO public.${table} VALUES($1,'00000000-0000-4000-8000-000000000001',$2::jsonb,'2026-10-07T16:00:00Z')`,[index,JSON.stringify({value:targetSide?'old':'学习📚'})]);
      await client.query(`ALTER TABLE public.${table} ${['DISABLE','ENABLE','ENABLE REPLICA','ENABLE ALWAYS','ENABLE'][index]} TRIGGER existing_trigger`);
    }
  };
  await fixture(source,false);await fixture(target,true);
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
  const result=await applyCutover({source,target,report:recovered,evidence:{localTest:true},archive:privateArchive(join(root,'success'))});
  assert.equal(result.committed,true);
  for(const table of TABLES){
    assert.equal((await target.query(`SELECT payload->>'value' AS value FROM public.${table}`)).rows[0].value,'学习📚');
    await assert.rejects(source.query(`UPDATE public.${table} SET payload='{}'::jsonb`),{code:'55000'});
    await assert.rejects(source.query(`TRUNCATE public.${table}`),{code:'55000'});
  }
  assert.deepEqual((await target.query(`SELECT c.relname AS table_name,t.tgname,t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows,report.target.triggers);
  console.log(JSON.stringify({ok:true,postgresVersion:17,localOnly:true,targetRollback:true,sourceACLRestored:true,fiveTableCopy:true,unicodePreserved:true,sourceUpdateAndTruncateFenced:true,triggerStatesRestored:true,productionCutover:false}));
}finally{
  for(const client of clients)await client.end().catch(()=>{});
  if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
  rmSync(root,{recursive:true,force:true});
}
