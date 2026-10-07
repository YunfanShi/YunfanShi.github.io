import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,readFileSync,statSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { TABLES,inspectCutover,applyCutover,restorationSQL,privateArchive,validateEvidence } from '../scripts/lib/azure-cutover.mjs';
import { atStage,safeDiagnostic } from '../scripts/lib/azure-cutover-diagnostics.mjs';

test('diagnostics identify connection failures without exposing database error details',async()=>{
  const error=Object.assign(Error('private password and connection information'),{code:'28P01'});
  await assert.rejects(atStage('target_connect',async()=>{throw error;}));
  const diagnostic=safeDiagnostic(error);
  assert.equal(diagnostic.code,'DATABASE_PASSWORD_REJECTED');
  assert.equal(diagnostic.stage,'target_connect');
  assert.equal(diagnostic.committed,false);
  assert.doesNotMatch(JSON.stringify(diagnostic),/private password/);
  const timeout=safeDiagnostic(Object.assign(Error('Connection terminated due to connection timeout'),{cutoverStage:'target_connect'}));
  assert.equal(timeout.code,'DATABASE_CONNECTION_TIMEOUT');
  const unknown=safeDiagnostic(Error('private query rows and token'));
  assert.doesNotMatch(JSON.stringify(unknown),/private query|token/);
});

function fixture({ failTargetWrite=false,unknownTargetCommit=false,unknownSourceCommit=false,failEvidence=false,recoveryFails=false,missingBackupGuards=false }={}) {
  const commands = []; const files = new Map(); const profile = {id:'test-user',account_status:'active',deleted_at:null};
  function client(side) {
    let fenced = false; let targetWritten = false;
    return {async query(sql) {
      commands.push({side,sql});
      if (sql.startsWith('CREATE FUNCTION jackyun_private.jackyun_cutover')) fenced = true;
      if (side === 'source' && sql === 'COMMIT' && fenced && unknownSourceCommit) throw Error('connection lost');
      if (side === 'target' && sql.startsWith('TRUNCATE')) {targetWritten=true;if(failTargetWrite)throw Error('private SQL error');}
      if (side === 'target' && sql === 'COMMIT' && targetWritten && unknownTargetCommit) throw Error('connection lost');
      if (side === 'source' && sql.startsWith('DROP TRIGGER') && recoveryFails) throw Error('recovery failed');
      if (sql.includes('AS acquired')) return {rows:[{acquired:true}]};
      if (sql.includes('current_database() AS database')) return {rows:[{database:side==='source'?'postgres':'jackyun_migration_20261007',operator:'owner'}]};
      if (sql.includes('c.relacl::text AS acl')) return {rows:TABLES.map(relname=>({relname,owner:'owner',rls:true,acl:'recorded'}))};
      if (sql.includes('a.attnum,a.attname')) return {rows:TABLES.map(relname=>({relname,attnum:1,attname:'id',type:'uuid',attnotnull:true}))};
      if (sql.includes('aclexplode')) return {rows:TABLES.flatMap(relname=>[
        {relname,grantor:'owner',grantee:'authenticated',privilege_type:'SELECT',is_grantable:false},
        {relname,grantor:'owner',grantee:'authenticated',privilege_type:'INSERT',is_grantable:true}])};
      if (sql.includes('t.tgname,t.tgenabled')) return {rows:[{table_name:'legacy_sync_data',tgname:'existing_disabled',tgenabled:'D'},{table_name:'legacy_sync_data',tgname:'existing_replica',tgenabled:'R'}]};
      if (sql.includes('SELECT id::text FROM auth.users')) return {rows:[{id:'test-user'}]};
      if (sql.startsWith('SELECT id::text,account_status')) return {rows:[profile]};
      if (sql.includes("to_regclass('cron.job')")) return {rows:[{cron:null,dirty:null}]};
      if (sql.includes("to_regclass('jackyun_private.sync_source_control')")) return {rows:[{control:side==='source'&&!missingBackupGuards?'jackyun_private.sync_source_control':null}]};
      if (sql.startsWith('SELECT sync_backend,guard_version')) return {rows:[{sync_backend:'supabase',guard_version:1}]};
      if (sql.includes("pg_get_functiondef(p.oid) LIKE")) return {rows:[{count:3}]};
      if (sql.includes('pg_prepared_xacts')) return {rows:[{count:0}]};
      if (sql.includes('jsonb_agg(to_jsonb(r)')) return {rows:[{data:[]}]};
      if (sql.includes("AS hash")) return {rows:[{count:'0',hash:'same'}]};
      return {rows:[]};
    }};
  }
  const source = client('source');const target = client('target');
  const archive = {directory:'/protected-test-archive',write(name,value){if(name==='verification.json'&&failEvidence)throw Error('disk full');files.set(name,value);}};
  return {source,target,archive,commands,files};
}
const execute = async f => applyCutover({...f,report:await inspectCutover(f.source,f.target),evidence:{verifiedAt:'test'}});

test('preflight only executes read-only transactions and catalogue queries',async()=>{
  const f=fixture();const report=await inspectCutover(f.source,f.target);
  assert.equal(report.writesPerformed,false);
  assert.ok(f.commands.every(({sql})=>/^(BEGIN.*READ ONLY|SELECT|SET LOCAL|COMMIT)/.test(sql)));
  const restore=restorationSQL(report);
  assert.match(restore,/WITH GRANT OPTION/);assert.doesNotMatch(restore,/GRANT SELECT/);
});
test('success fences every write path, preserves trigger states and leaves old writes frozen',async()=>{
  const f=fixture();const result=await execute(f);
  assert.ok(f.commands.findIndex(x=>x.side==='source'&&x.sql.includes('FOR UPDATE')) < f.commands.findIndex(x=>x.side==='source'&&x.sql.startsWith('LOCK TABLE')));
  assert.ok(f.commands.some(x=>x.side==='source'&&x.sql.includes("sync_backend='azure'")));
  assert.match(f.files.get('restore-source-writes.sql'),/sync_backend='supabase'/);
  assert.equal(result.committed,true);assert.equal(result.websiteSwitched,false);
  assert.equal(f.commands.filter(x=>x.side==='source'&&x.sql.startsWith('CREATE TRIGGER')).length,5);
  assert.equal(f.commands.filter(x=>x.side==='source'&&x.sql.includes('ENABLE ALWAYS TRIGGER')).length,5);
  assert.ok(f.commands.some(x=>x.side==='target'&&x.sql.includes('DISABLE TRIGGER "existing_disabled"')));
  assert.ok(f.commands.some(x=>x.side==='target'&&x.sql.includes('ENABLE REPLICA TRIGGER "existing_replica"')));
  assert.equal(f.commands.filter(x=>x.side==='source'&&x.sql.startsWith('DROP TRIGGER')).length,0);
  assert.ok(f.files.has('target-before.json')&&f.files.has('verified-before-commit.json'));
});
test('target failure rolls back and restores exactly recorded source write grants',async()=>{
  const f=fixture({failTargetWrite:true});
  await assert.rejects(execute(f),{cutoverCode:'CUTOVER_ROLLED_BACK',committed:false,sourceFrozen:false});
  assert.ok(f.commands.some(x=>x.side==='source'&&x.sql.includes("sync_backend='supabase'")));
  assert.equal(f.commands.filter(x=>x.side==='source'&&x.sql.startsWith('DROP TRIGGER')).length,5);
  assert.ok(f.commands.some(x=>x.side==='source'&&x.sql.startsWith('GRANT INSERT')&&x.sql.includes('WITH GRANT OPTION')));
});
test('post-commit disk failure cannot claim rollback or unfreeze the source',async()=>{
  const f=fixture({failEvidence:true});
  await assert.rejects(execute(f),{cutoverCode:'COMMITTED_EVIDENCE_FAILED',committed:true,sourceFrozen:true});
  assert.equal(f.commands.filter(x=>x.sql.startsWith('DROP TRIGGER')).length,0);
});
test('lost commit acknowledgements preserve freeze and require outcome inspection',async()=>{
  for(const options of [{unknownTargetCommit:true},{unknownSourceCommit:true}]){
    const f=fixture(options);
    await assert.rejects(execute(f),{cutoverCode:'COMMIT_OUTCOME_UNKNOWN',sourceFrozen:true});
    assert.equal(f.commands.filter(x=>x.sql.startsWith('DROP TRIGGER')).length,0);
  }
});
test('failed permission recovery is explicitly reported rather than claimed restored',async()=>{
  const f=fixture({failTargetWrite:true,recoveryFails:true});
  await assert.rejects(execute(f),{cutoverCode:'SOURCE_RECOVERY_REQUIRED',sourceFrozen:true});
});
test('protected archives do not overwrite files; evidence validates age, scope and bytes',t=>{
  const root=mkdtempSync(join(tmpdir(),'azure-cutover-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const archive=privateArchive(root);archive.write('sample.json',{safe:true});
  assert.throws(()=>archive.write('sample.json',{}));assert.throws(()=>archive.write('../escape.json',{}));
  if(process.platform!=='win32')assert.equal(statSync(join(archive.directory,'sample.json')).mode&0o777,0o600);
  const bytes=readFileSync(join(archive.directory,'sample.json'));
  const ref={file:'sample.json',sha256:createHash('sha256').update(bytes).digest('hex')};
  const evidence={verifiedAt:new Date().toISOString(),sourceProject:'gdcwwlnzylrzrqhaaljq',targetDatabase:'jackyun_migration_20261007',
    checks:Object.fromEntries(['realLogin','twoUserIsolation','deviceRevocation','accountSuspension','reverseCopyDrill','sourceWritersPaused','targetWritersPaused','backupRoutingVerified'].map(k=>[k,true])),
    sourceBackup:ref,targetBackup:ref,liveReport:ref,rollbackReport:ref};
  const file=join(archive.directory,'evidence.json');const report={target:{database:evidence.targetDatabase}};
  const save=()=>writeFileSync(file,JSON.stringify(evidence),{mode:0o600});save();
  assert.ok(validateEvidence(file,report));evidence.checks.realLogin=false;save();assert.throws(()=>validateEvidence(file,report));
  evidence.checks.realLogin=true;evidence.verifiedAt='2020-01-01';save();assert.throws(()=>validateEvidence(file,report));
  evidence.verifiedAt=new Date().toISOString();evidence.liveReport={...ref,sha256:'0'.repeat(64)};save();assert.throws(()=>validateEvidence(file,report));
});

test('uninstalled backup guards fail before any production mutation',async()=>{
  const f=fixture({missingBackupGuards:true});
  await assert.rejects(execute(f),{cutoverCode:'BACKUP_SOURCE_GUARDS_REQUIRED',sourceFrozen:false});
  assert.ok(f.commands.every(({sql})=>/^(BEGIN.*READ ONLY|SELECT|SET LOCAL|COMMIT|ROLLBACK)/.test(sql)));
});
