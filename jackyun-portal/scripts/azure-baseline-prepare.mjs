// Password is supplied only by the local hidden-input wrapper. No source access.
import { spawnSync } from 'node:child_process';
import { readFileSync, chmodSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, userInfo } from 'node:os';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { privateArchive, TABLES } from './lib/azure-cutover.mjs';
import { backupFailureCategory, privateBackupDetail } from './lib/azure-backup-diagnostics.mjs';
const {Client}=createRequire(new URL('../azure/backend/package.json',import.meta.url))('pg');
const root=resolve(import.meta.dirname,'..'),bin=process.env.PG_BACKUP_BIN||'/opt/homebrew/opt/postgresql@17/bin';
const archive=privateArchive(join(root,'.migration-private'));
const password=process.env.TARGETPGPASSWORD;
if(!password||!process.env.TARGETPGSSLROOTCERT)throw Error('Protected Azure password and CA required');
const env={...process.env,PGHOST:'jackyunasia.postgres.database.azure.com',PGPORT:'5432',PGUSER:'jackyun_admin',PGDATABASE:'jackyun_migration_20261007',PGPASSWORD:password,PGSSLMODE:'verify-full',PGSSLROOTCERT:process.env.TARGETPGSSLROOTCERT,PGCONNECT_TIMEOUT:'10',PGAPPNAME:'jackyun-baseline-prepare'};
delete env.TARGETPGPASSWORD;delete env.SOURCEPGPASSWORD;
const remote=new Client({host:env.PGHOST,port:5432,user:env.PGUSER,database:env.PGDATABASE,password,ssl:{rejectUnauthorized:true,ca:readFileSync(env.PGSSLROOTCERT,'utf8')},connectionTimeoutMillis:10000,statement_timeout:120000});
let local,started=false,work;let installed=false;
function run(name,args,options={}){
 const result=spawnSync(join(bin,name),args,{encoding:'utf8',timeout:600000,...options});
 if(result.status!==0){archive.write(`${name}-error.json`,{category:backupFailureCategory(result),...privateBackupDetail(result,[password])});throw Error(`${name.toUpperCase()}_FAILED`);}
 return result;
}
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
async function hashes(client){
 await client.query("SET timezone='UTC'");
 const tables=(await client.query("select n.nspname as schema,c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','jackyun_private') and c.relkind='r' order by 1,2")).rows;
 const values=[];
 for(const t of tables){const q=v=>'"'+v.replaceAll('"','""')+'"';const r=(await client.query(`select count(*)::text as count,md5(coalesce(string_agg(h,'' order by h collate "C"),'')) as hash from (select md5(to_jsonb(r)::text) as h from ${q(t.schema)}.${q(t.name)} r) x`)).rows[0];values.push({...t,...r});}
 return values;
}
try{
 console.log('步骤 1/5：连接 Azure 并检查目标库…');await remote.connect();
 const info=(await remote.query('select current_database() as database')).rows[0];
 if(info.database!==env.PGDATABASE)throw Error('Unexpected target database');
 const tables=(await remote.query("select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relname=any($1)",[TABLES])).rows;
 if(tables.length!==5||tables.some(t=>!t.relrowsecurity))throw Error('Sync tables or RLS missing');
 const roles=(await remote.query("select rolname from pg_roles where rolname not like 'pg_%' order by rolname")).rows;
 console.log('步骤 2/5：保护 Azure 当前数据…');
 const dump=join(archive.directory,'target.dump');
 run('pg_dump',['--format=custom','--schema=public','--schema=auth','--schema=jackyun_private','--file',dump,'--no-password'],{env});chmodSync(dump,0o600);
 run('pg_restore',['--list',dump]);
 console.log('步骤 3/5：在本机隔离数据库实际恢复备份…');
 work=mkdtempSync(join(tmpdir(),'jackyun-baseline-restore-'));chmodSync(work,0o700);const socket=join(work,'socket');mkdirSync(socket,{mode:0o700});
 const localEnv={...process.env};for(const k of Object.keys(localEnv))if(k.startsWith('PG')||k.includes('PGPASSWORD'))delete localEnv[k];
 run('initdb',['-D',join(work,'data'),'--no-locale','--encoding=UTF8','--auth-local=trust','--auth-host=scram-sha-256'],{env:localEnv});
 run('pg_ctl',['-D',join(work,'data'),'-l',join(work,'server.log'),'-o',`-k ${socket} -h '' -p 15442`,'-w','start'],{env:localEnv});started=true;
 local=new Client({host:socket,port:15442,user:userInfo().username,database:'postgres'});await local.connect();
 for(const {rolname} of roles)if(rolname!==userInfo().username)await local.query(`CREATE ROLE "${rolname.replaceAll('"','""')}" NOLOGIN`);
 await local.query('CREATE SCHEMA extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions; CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;');
 run('pg_restore',['--host',socket,'--port','15442','--username',userInfo().username,'--dbname','postgres','--no-owner','--no-privileges','--exit-on-error',dump],{env:localEnv});
 const restored=await hashes(local);const current=await hashes(remote);
 if(JSON.stringify(restored)!==JSON.stringify(current))throw Error('Baseline changed during backup; rerun with target writers paused');
 archive.write('restored-fingerprints.json',restored);
 console.log('步骤 4/5：安装 Azure 备份标记 RPC…');
 const present=(await remote.query("select to_regprocedure('public.sync_backup_markers()')::text as markers,to_regprocedure('public.ack_sync_backup_marker(text,uuid)')::text as ack")).rows[0];
 if(!present.markers&&!present.ack){await remote.query(readFileSync(join(root,'azure/sync-backup-markers.sql'),'utf8'));installed=true;}
 else if(!present.markers||!present.ack)throw Error('Partial marker installation requires inspection');
 const allowed=(await remote.query("select has_function_privilege('jackyun_sync_runtime','public.sync_backup_markers()','EXECUTE') and has_function_privilege('jackyun_sync_runtime','public.ack_sync_backup_marker(text,uuid)','EXECUTE') as allowed")).rows[0].allowed;
 if(!allowed)throw Error('Marker runtime permissions missing');
 console.log('步骤 5/5：保存可验证的基线准备报告…');
 const report={ok:true,operation:'azure-baseline-prepare',capturedAt:new Date().toISOString(),targetDatabase:env.PGDATABASE,sourceAccessed:false,sourceIncrementDiscarded:true,restoreDrillPassed:true,restoredTables:restored.length,backup:{file:dump,sha256:digest(dump)},markerFunctionsReady:true,markerInstalled:installed,productionCutover:false,archive:archive.directory};
 archive.write('baseline-prepare-report.json',report);console.log(JSON.stringify(report));
}catch(error){
 archive.write('prepare-error.json',{databaseCode:error.code??null,...privateBackupDetail({stderr:error.message},[password])});
 const code=/^[A-Z][A-Z_]{2,80}$/.test(error.message??'')?error.message:'BASELINE_PREPARE_FAILED';
 console.error(JSON.stringify({ok:false,code,markerInstalled:installed,sourceAccessed:false,productionCutover:false,archive:archive.directory}));process.exitCode=1;
}
finally{await remote.end().catch(()=>{});if(local)await local.end().catch(()=>{});if(started)spawnSync(join(bin,'pg_ctl'),['-D',join(work,'data'),'-m','immediate','-w','stop'],{encoding:'utf8'});if(work)rmSync(work,{recursive:true,force:true});}
