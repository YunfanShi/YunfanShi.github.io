import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import tls from 'node:tls';
import {Pool} from 'pg';
import {handleSyncV5} from '../sync-v5.mjs';
import {createSyncApi} from '../sync-api.mjs';
import {verifyStagingWorkspaceHandoff} from './v5-staging-workspace-handoff.mjs';
import {verifyStagingWritingCollections} from './v5-staging-writing-collections.mjs';
import {canonicalJson} from '../../../src/lib/sync/hash.ts';
import {isSyncableStorageKey} from '../../../src/lib/local-workspace.ts';
import {legacyWorkspaceRecordId,legacyWorkspaceKeyFromRecordId} from '../../../src/lib/sync/resource-model.ts';

const STAGING_DATABASE='jackyun_v5_stage_20261026';
const STAGING_HOST='jackyunasia.postgres.database.azure.com';
const RUNTIME_LOGIN='jackyun_sync_login';
const testSubject=process.env.V5_STAGING_TEST_SUBJECT??'';
assert.match(testSubject,/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  'V5_STAGING_TEST_SUBJECT must be an existing dedicated staging test account UUID');
for(const [name,expected] of Object.entries({PGDATABASE:STAGING_DATABASE,PGHOST:STAGING_HOST,PGUSER:RUNTIME_LOGIN})){
  assert.equal(process.env[name],expected,`${name} must target the restricted v5 staging database`);
}
assert.ok(process.env.PGPASSWORD,'PGPASSWORD must be injected by a local hidden-input wrapper');

const pool=new Pool({host:STAGING_HOST,database:STAGING_DATABASE,user:RUNTIME_LOGIN,password:process.env.PGPASSWORD,
  port:Number(process.env.PGPORT??5432),ssl:{ca:tls.rootCertificates.join('\n'),rejectUnauthorized:true,servername:STAGING_HOST},
  connectionTimeoutMillis:10_000,query_timeout:15_000,application_name:'jackyun-v5-staging-runtime-test'});
let client;
let transactionOpen=false;
let verification;
const rolloutKeys=['SYNC_V4_USERS','SYNC_V5_USERS','SYNC_V5_SCOPES','SYNC_V5_MODE','SYNC_V5_WRITE_PAUSE'];
const previousRollout=new Map(rolloutKeys.map(key=>[key,process.env[key]]));
try{
  console.error('[staging-v5] Connecting to the isolated PostgreSQL database with the restricted runtime login.');
  client=await pool.connect();
  console.error('[staging-v5] Database connection established; beginning rollback-only verification.');
  const login=(await client.query(`SELECT current_database() AS database,session_user,r.rolsuper,r.rolbypassrls,
    r.rolcreatedb,r.rolcreaterole FROM pg_roles r WHERE r.rolname=session_user`)).rows[0];
  assert.equal(login.database,STAGING_DATABASE);
  assert.equal(login.session_user,RUNTIME_LOGIN);
  for(const privilege of ['rolsuper','rolbypassrls','rolcreatedb','rolcreaterole'])assert.equal(login[privilege],false,`${privilege} must remain false`);

  await client.query('BEGIN');transactionOpen=true;
  await client.query('SET LOCAL ROLE jackyun_sync_runtime');
  const role=(await client.query('SELECT current_user,has_table_privilege(current_user,$1,$2) AS can_write,has_function_privilege(current_user,$3,$4) AS can_check_identity',
    ['public.sync_v5_records','INSERT','public.sync_identity_allowed()','EXECUTE'])).rows[0];
  assert.equal(role.current_user,'jackyun_sync_runtime');
  assert.equal(role.can_write,true);
  assert.equal(role.can_check_identity,true);

  const expectedPrimaryKeys={sync_v5_records:['user_id','scope','record_id'],sync_v5_heads:['user_id','scope'],
    sync_v5_changes:['user_id','scope','sequence'],sync_v5_receipts:['user_id','scope','operation_id'],sync_v5_projection_heads:['user_id']};
  const schema=(await client.query(`SELECT c.relname,c.relrowsecurity,
    pg_has_role(current_user,c.relowner,'MEMBER') AS owns_table,
    (SELECT array_agg(a.attname::text ORDER BY k.position) FROM pg_constraint p
      CROSS JOIN LATERAL unnest(p.conkey) WITH ORDINALITY k(attnum,position)
      JOIN pg_attribute a ON a.attrelid=p.conrelid AND a.attnum=k.attnum
      WHERE p.conrelid=c.oid AND p.contype='p') AS primary_key,
    EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname
      AND 'jackyun_sync_runtime'=ANY(p.roles) AND p.cmd='ALL'
      AND p.qual LIKE '%request.jwt.claim.sub%' AND p.with_check LIKE '%request.jwt.claim.sub%') AS owner_policy,
    EXISTS(SELECT 1 FROM pg_constraint p WHERE p.conrelid=c.oid AND p.contype='c' AND p.convalidated
      AND pg_get_constraintdef(p.oid) LIKE '%workspace%') AS workspace_constraint
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[Object.keys(expectedPrimaryKeys)])).rows;
  assert.equal(schema.length,5,'all v5 tables must exist');
  for(const table of schema){
    assert.equal(table.relrowsecurity,true,`${table.relname} must enable RLS`);
    assert.equal(table.owns_table,false,`runtime must not own ${table.relname}`);
    assert.equal(table.owner_policy,true,`${table.relname} must check the current subject for reads and writes`);
    assert.deepEqual(table.primary_key,expectedPrimaryKeys[table.relname]);
    if(table.relname!=='sync_v5_projection_heads')assert.equal(table.workspace_constraint,true,`${table.relname} must accept workspace`);
  }

  const syntheticSubject=randomUUID(),otherSubject=randomUUID(),deviceId=randomUUID(),operationId=randomUUID();
  console.error('[staging-v5] Schema, runtime role and RLS policies verified; checking account identity.');
  await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)`,
    [syntheticSubject,JSON.stringify({sub:syntheticSubject,role:'authenticated'})]);
  const eligible=(await client.query('SELECT public.sync_identity_allowed() AS allowed')).rows[0]?.allowed===true;
  assert.equal(eligible,false,'synthetic transaction subject must not be reported as an active user');
  await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)`,
    [testSubject,JSON.stringify({sub:testSubject,role:'authenticated'})]);
  const testAccountEligible=(await client.query('SELECT public.sync_identity_allowed() AS allowed')).rows[0]?.allowed===true;
  assert.equal(testAccountEligible,true,'dedicated staging test account must exist and be active before writes');
  const subject=testSubject;
  console.error('[staging-v5] Active staging identity verified; testing writes, receipts and hashes.');

  if(process.env.V5_STAGING_TEST_FOCUS==='writing'){
    verification={database:STAGING_DATABASE,runtimeLogin:RUNTIME_LOGIN,leastPrivilegeRole:role.current_user,
      schemaPrimaryKeysAndRlsVerified:true,workspaceConstraintsVerified:true,activeTestAccountVerified:true,
      writingCollections:await verifyStagingWritingCollections(client,subject)};
  }else{

  const recordId=legacyWorkspaceRecordId(`jackyun_ielts_staging_probe_${operationId}`);
  assert.ok(recordId);
  const value={fixture:'v5-staging-runtime',operationId,sequence:1,unicode:'隔离验收📚'};
  const operation={id:operationId,scope:'workspace',recordId,baseRevision:0,baseHash:null,value,deleted:false,clientUpdatedAt:new Date().toISOString()};
  const operationHash=createHash('sha256').update(canonicalJson(operation)).digest('hex');
  const valueHash=createHash('sha256').update(canonicalJson(value)).digest('hex');
  const call=(method,path,body)=>handleSyncV5({query:(...args)=>client.query(...args)},
    {sub:subject},method,new URL(`https://staging.invalid/api/sync/v5${path}`),body,['workspace']);

  const write=await call('POST','/operations',{scope:'workspace',deviceId,operations:[operation]});
  assert.equal(write.applied.length,1);
  assert.equal(write.applied[0].revision,1);
  assert.equal(write.applied[0].contentHash,valueHash);

  const retry=await call('POST','/operations',{scope:'workspace',deviceId,operations:[operation]});
  assert.equal(retry.applied[0].revision,1,'same operation ID must not advance a second revision');
  assert.equal(retry.head,write.head,'retry must not advance the existing account cursor');

  const receipts=await call('POST','/receipts',{scope:'workspace',operations:[{id:operationId,requestHash:operationHash}]});
  assert.equal(receipts.receipts[0].state,'confirmed');
  assert.equal(receipts.receipts[0].result.contentHash,valueHash);
  const records=await call('GET',`/records?scope=workspace&id=${encodeURIComponent(recordId)}`);
  assert.deepEqual(records.records[0].value,value);
  assert.equal(createHash('sha256').update(canonicalJson(records.records[0].value)).digest('hex'),valueHash);

  await assert.rejects(call('POST','/operations',{scope:'workspace',deviceId,operations:[{...operation,value:{...value,sequence:99}}]}),
    {code:'OPERATION_ID_REUSED'});
  const updatedValue={...value,sequence:2};
  const updatedHash=createHash('sha256').update(canonicalJson(updatedValue)).digest('hex');
  const update={...operation,id:randomUUID(),baseRevision:1,baseHash:valueHash,value:updatedValue};
  const updated=await call('POST','/operations',{scope:'workspace',deviceId,operations:[update]});
  assert.equal(updated.applied[0].revision,2);
  assert.equal(updated.applied[0].contentHash,updatedHash);
  const stale={...operation,id:randomUUID()};
  const conflict=await call('POST','/operations',{scope:'workspace',deviceId,operations:[stale]});
  assert.equal(conflict.applied.length,0);
  assert.equal(conflict.head,updated.head,'a rejected stale write must not advance the cursor');
  assert.equal(conflict.conflicts[0].revision,2);
  assert.deepEqual(conflict.conflicts[0].value,updatedValue);

  await client.query('SAVEPOINT atomic_rollback_probe');
  const rolledOperation={...update,id:randomUUID(),baseRevision:2,baseHash:updatedHash,value:{...updatedValue,sequence:3}};
  const temporary=await call('POST','/operations',{scope:'workspace',deviceId,operations:[rolledOperation]});
  assert.equal(temporary.applied[0].revision,3);
  await client.query('ROLLBACK TO SAVEPOINT atomic_rollback_probe');
  const afterRollback=await call('GET',`/records?scope=workspace&id=${encodeURIComponent(recordId)}`);
  assert.equal(afterRollback.records[0].revision,2);
  assert.equal(afterRollback.records[0].contentHash,updatedHash);
  const rolledReceipt=await call('POST','/receipts',{scope:'workspace',operations:[{
    id:rolledOperation.id,requestHash:createHash('sha256').update(canonicalJson(rolledOperation)).digest('hex'),
  }]});
  assert.equal(rolledReceipt.receipts[0].state,'unknown','rolled back resource and receipt must disappear together');
  const headAfterRollback=(await client.query('SELECT sequence FROM public.sync_v5_heads WHERE user_id=$1 AND scope=$2',[subject,'workspace'])).rows[0];
  assert.equal(Number(headAfterRollback.sequence),updated.head,'rollback must restore the resource cursor');

  process.env.SYNC_V4_USERS=subject;
  console.error('[staging-v5] CRUD, receipts, SHA-256 and atomic rollback verified; checking v4 compatibility.');
  process.env.SYNC_V5_USERS=subject;
  process.env.SYNC_V5_SCOPES='workspace';
  process.env.SYNC_V5_MODE='test-users';
  process.env.SYNC_V5_WRITE_PAUSE='false';
  const legacyKey=legacyWorkspaceKeyFromRecordId(recordId);
  assert.ok(legacyKey);
  const legacyHandle=createSyncApi({withUser:(_identity,work)=>work({query:(...args)=>client.query(...args)})});
  const legacyRead=()=>legacyHandle('GET',new URL(`https://staging.invalid/api/sync/v2?key=${encodeURIComponent(legacyKey)}`),null,{sub:subject});
  const legacyWrite=legacyOperation=>legacyHandle('POST',new URL('https://staging.invalid/api/sync/v4'),
    {syncProtocol:4,deviceId,operations:[legacyOperation]},{sub:subject});
  const projected=(await legacyRead()).records[0];
  assert.deepEqual(projected.value,updatedValue,'v4 must read the current v5 workspace projection');
  assert.equal(projected.contentHash,updatedHash);
  const legacyValue={...updatedValue,sequence:4};
  const legacyOperation={id:randomUUID(),key:legacyKey,baseRevision:projected.revision,baseHash:projected.contentHash,
    baseValue:updatedValue,value:legacyValue,deleted:false,clientUpdatedAt:new Date().toISOString()};
  const legacyApplied=await legacyWrite(legacyOperation);
  assert.equal(legacyApplied.applied.length,1);
  const reflected=(await call('GET',`/records?scope=workspace&id=${encodeURIComponent(recordId)}`)).records[0];
  assert.equal(reflected.revision,3);
  assert.deepEqual(reflected.value,legacyValue,'accepted v4 writes must appear in v5');
  const legacyRetry=await legacyWrite(legacyOperation);
  assert.equal(legacyRetry.applied[0].revision,legacyApplied.applied[0].revision);
  const staleLegacy=await legacyWrite({...legacyOperation,id:randomUUID(),value:{...legacyValue,sequence:99}});
  assert.equal(staleLegacy.conflicts.length,1);
  assert.deepEqual(staleLegacy.conflicts[0].remoteValue,legacyValue);

  process.env.SYNC_V5_MODE='disabled';
  const rollbackView=(await legacyRead()).records[0];
  assert.deepEqual(rollbackView.value,legacyValue,'disabling v5 must preserve the latest legacy read projection');
  assert.equal(rollbackView.contentHash,reflected.contentHash);
  const fallbackValue={...legacyValue,sequence:5};
  const fallback=await legacyWrite({...legacyOperation,id:randomUUID(),baseRevision:rollbackView.revision,
    baseHash:rollbackView.contentHash,baseValue:legacyValue,value:fallbackValue});
  assert.equal(fallback.applied.length,1);
  process.env.SYNC_V5_MODE='test-users';
  const restored=(await call('GET',`/records?scope=workspace&id=${encodeURIComponent(recordId)}`)).records[0];
  assert.equal(restored.revision,4);
  assert.deepEqual(restored.value,fallbackValue,'v4 writes made during rollback must remain visible when v5 resumes');

  const deletionId=randomUUID();
  const deletion={id:deletionId,scope:'workspace',recordId,baseRevision:restored.revision,baseHash:restored.contentHash,deleted:true,clientUpdatedAt:new Date().toISOString()};
  const tombstone=await call('POST','/operations',{scope:'workspace',deviceId,operations:[deletion]});
  const deletedHash=createHash('sha256').update('__deleted__').digest('hex');
  assert.equal(tombstone.applied[0].revision,5);
  assert.equal(tombstone.applied[0].contentHash,deletedHash);
  const deletionReceiptHash=createHash('sha256').update(canonicalJson(deletion)).digest('hex');
  const deletionReceipt=await call('POST','/receipts',{scope:'workspace',operations:[{id:deletionId,requestHash:deletionReceiptHash}]});
  assert.equal(deletionReceipt.receipts[0].state,'confirmed');
  const deleted=await call('GET',`/records?scope=workspace&id=${encodeURIComponent(recordId)}`);
  assert.equal(deleted.records[0].deleted,true);
  assert.equal(deleted.records[0].value,null);
  const resurrection=await legacyWrite({...legacyOperation,id:randomUUID(),value:legacyValue});
  assert.equal(resurrection.conflicts.length,1,'stale legacy snapshots must not resurrect a v5 tombstone');
  assert.equal(resurrection.conflicts[0].remoteDeleted,true);
  assert.equal((await call('GET',`/records?scope=workspace&id=${encodeURIComponent(recordId)}`)).records[0].deleted,true);

  // Consume actual page-emitted keys; all temporary mutations remain inside this savepoint.
  console.error('[staging-v5] Compatibility, safe rollback and tombstones verified; checking sampled keys.');
  const sampling=JSON.parse(await readFile(new URL('../../../docs/sync-v5-dynamic-runtime-20261027.json',import.meta.url),'utf8'));
  assert.equal(sampling.environment,'isolated local browser');
  assert.deepEqual(sampling.unmapped,[]);
  const sampledKeys=[...new Set(sampling.coverage.filter(row=>row.cloudEligible&&row.writeObserved).flatMap(row=>row.observedKeys))].filter(isSyncableStorageKey);
  assert.ok(sampledKeys.length>=8,'run the dynamic browser sampler before staging acceptance');
  const sampledIds=sampledKeys.map(key=>legacyWorkspaceRecordId(key));
  assert.ok(sampledIds.every(Boolean));
  assert.equal(new Set(sampledIds).size,sampledIds.length,'sampled keys must not alias the same resource');
  for(let index=0;index<sampledKeys.length;index++)assert.equal(legacyWorkspaceKeyFromRecordId(sampledIds[index]),sampledKeys[index]);
  const sampledPath='/records?scope=workspace&'+sampledIds.map(id=>`id=${encodeURIComponent(id)}`).join('&');
  const baseline=(await call('GET',sampledPath)).records;
  const baselineById=new Map(baseline.map(row=>[row.recordId,row]));
  const beforeSampleHead=(await client.query("SELECT sequence FROM public.sync_v5_heads WHERE user_id=$1 AND scope='workspace'",[subject])).rows[0].sequence;
  await client.query('SAVEPOINT dynamic_key_roundtrip');
  const sampledOperations=sampledIds.map((id,index)=>{
    const base=baselineById.get(id);
    return {id:randomUUID(),scope:'workspace',recordId:id,baseRevision:base?.revision??0,baseHash:base?.contentHash??null,
      value:{fixture:'dynamic-key-runtime',key:sampledKeys[index],nonce:operationId},deleted:false,clientUpdatedAt:new Date().toISOString()};
  });
  const sampledWrite=await call('POST','/operations',{scope:'workspace',deviceId,operations:sampledOperations});
  assert.equal(sampledWrite.conflicts.length,0);
  assert.equal(sampledWrite.applied.length,sampledOperations.length);
  const sampledReplay=await call('POST','/operations',{scope:'workspace',deviceId,operations:sampledOperations});
  assert.equal(sampledReplay.head,sampledWrite.head,'dynamic key retries must not advance the cursor');
  const sampledReceipts=await call('POST','/receipts',{scope:'workspace',operations:sampledOperations.map(operation=>({
    id:operation.id,requestHash:createHash('sha256').update(canonicalJson(operation)).digest('hex'),
  }))});
  assert.equal(sampledReceipts.receipts.length,sampledOperations.length);
  for(const receipt of sampledReceipts.receipts)assert.equal(receipt.state,'confirmed');
  const sampledRead=(await call('GET',sampledPath)).records;
  assert.equal(sampledRead.length,sampledOperations.length);
  for(const operation of sampledOperations){
    const row=sampledRead.find(row=>row.recordId===operation.recordId);
    assert.deepEqual(row.value,operation.value);
    assert.equal(row.contentHash,createHash('sha256').update(canonicalJson(operation.value)).digest('hex'));
  }
  await client.query('ROLLBACK TO SAVEPOINT dynamic_key_roundtrip');
  assert.deepEqual((await call('GET',sampledPath)).records,baseline,'dynamic sampling must restore pre-existing staging resources');
  const restoredSampleHead=(await client.query("SELECT sequence FROM public.sync_v5_heads WHERE user_id=$1 AND scope='workspace'",[subject])).rows[0].sequence;
  assert.equal(restoredSampleHead,beforeSampleHead);
  const rolledSampleReceipts=await call('POST','/receipts',{scope:'workspace',operations:sampledOperations.map(operation=>({
    id:operation.id,requestHash:createHash('sha256').update(canonicalJson(operation)).digest('hex'),
  }))});
  for(const receipt of rolledSampleReceipts.receipts)assert.equal(receipt.state,'unknown');

  console.error('[staging-v5] Sampled keys verified; checking browser queue handoff.');
  const workspaceHandoff=await verifyStagingWorkspaceHandoff(client,subject);
  console.error('[staging-v5] Queue handoff verified; checking writing collections.');
  const writingCollections=await verifyStagingWritingCollections(client,subject);
  console.error('[staging-v5] Writing collections verified; checking cross-identity isolation.');
  await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)`,
    [otherSubject,JSON.stringify({sub:otherSubject,role:'authenticated'})]);
  const hidden=(await client.query(`SELECT
    (SELECT count(*)::int FROM public.sync_v5_records WHERE user_id=$1 AND scope='workspace' AND record_id=$2) AS records,
    (SELECT count(*)::int FROM public.sync_v5_receipts WHERE user_id=$1 AND scope='workspace' AND operation_id=ANY($3::uuid[])) AS receipts`,
    [subject,recordId,[operationId,deletionId]])).rows[0];
  assert.equal(hidden.records,0,'another identity must not read the resource');
  assert.equal(hidden.receipts,0,'another identity must not read receipts');
  await client.query('SAVEPOINT rls_write_probe');
  await assert.rejects(client.query(`INSERT INTO public.sync_v5_records(user_id,scope,record_id,revision,content_hash,value)
    VALUES($1,'workspace',$2,1,$3,'{}'::jsonb)`,[subject,recordId,valueHash]),error=>error.code==='42501');
  await client.query('ROLLBACK TO SAVEPOINT rls_write_probe');

  verification={database:STAGING_DATABASE,runtimeLogin:RUNTIME_LOGIN,leastPrivilegeRole:role.current_user,
    schemaPrimaryKeysAndRlsVerified:true,workspaceConstraintsVerified:true,activeTestAccountVerified:true,
    syntheticSubjectDeniedByAccountGate:!eligible,writeHashVerified:true,idempotentRetryVerified:true,receiptVerified:true,
    readBackHashVerified:true,tombstoneVerified:true,otherIdentityReadDenied:true,otherIdentityWriteDenied:true,
    updateVerified:true,staleWriteConflictVerified:true,operationIdReuseRejected:true,recordReceiptCursorRollbackVerified:true,
    workspaceV5ToV4ProjectionVerified:true,workspaceV4ToV5WriteVerified:true,workspaceV4RetryVerified:true,
    workspaceRolloutDisableReadVerified:true,workspaceRollbackWriteAndResumeVerified:true,staleLegacyResurrectionRejected:true,
    dynamicKeysVerified:sampledKeys.length,dynamicKeyReceiptHashReplayAndRollbackVerified:true,
    workspaceHandoff,
    writingCollections,
    };
  }
}finally{
  try{
    if(transactionOpen)await client.query('ROLLBACK');
  }finally{
    client?.release();
    await pool.end();
    for(const [key,value] of previousRollout){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
}
console.log(JSON.stringify({...verification,transactionRolledBack:true}));
