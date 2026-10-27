import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import tls from 'node:tls';
import {createApiServer} from '../azure/backend/server.mjs';
import {createDatabase} from '../azure/backend/database.mjs';
import {createAuthenticator} from '../azure/backend/auth.mjs';
import {createAccountStateVerifier} from '../azure/backend/account-state.mjs';
import {canonicalJson} from '../src/lib/sync/hash.ts';
import {legacyWorkspaceRecordId,SYNC_V5_SCOPES} from '../src/lib/sync/resource-model.ts';

const target=process.env.V5_HTTP_TARGET??'staging';
assert.ok(['staging','production'].includes(target),'Unknown HTTP acceptance target');
const production=target==='production';
if(!production){
  assert.equal(process.env.PGHOST,'jackyunasia.postgres.database.azure.com');
  assert.equal(process.env.PGDATABASE,'jackyun_v5_stage_20261026');
  assert.equal(process.env.PGUSER,'jackyun_sync_login');
}else{
  assert.equal(process.env.V5_HTTP_WRITE_TEST,'true','Production writes require the explicit acceptance flag');
  assert.equal(process.env.V5_TEST_SUBJECT,'41a658d6-ded8-4408-83f0-45780b3121b5','Production acceptance is restricted to the authorized test account');
}
for(const key of [...(production?[]:['PGPASSWORD']),'SUPABASE_PUBLISHABLE_KEY','AZURE_TEST_EMAIL','AZURE_TEST_PASSWORD','V5_TEST_SUBJECT'])
  assert.ok(process.env[key],`Missing ${key}; no database opened`);
const authOrigin='https://gdcwwlnzylrzrqhaaljq.supabase.co';
const subject=process.env.V5_TEST_SUBJECT,apiKey=process.env.SUPABASE_PUBLISHABLE_KEY;
const hash=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
const deletedHash=createHash('sha256').update('__deleted__').digest('hex');
const fields={timetable:'timetable',learning:'manualTasks',cue:'cues',practice:'examDiagnoses',timer:'practiceSessions',settings:'studyReports',workspace:'legacyIELTS'};
const nonce=randomUUID(),deviceA=randomUUID(),deviceB=randomUUID(),trace=[],outcomes=[];
const priorFlags=new Map(['SYNC_V5_MODE','SYNC_V5_USERS','SYNC_V5_SCOPES','SYNC_V5_WRITE_PAUSE'].map(key=>[key,process.env[key]]));
let token,database,server,origin,tempDirectory,failure;
const cleanupFailures=[];
const report={environment:production?'production Azure Functions HTTP':'local candidate HTTP with real Azure staging PostgreSQL',capturedAt:new Date().toISOString(),
  database:production?undefined:process.env.PGDATABASE,realBearerAuthentication:false,physicalPhoneTested:false,businessUiTested:false,scopes:outcomes,trace};
async function request(method,path,body,status=200,headers={}){
  const started=performance.now();
  const response=await fetch(origin+path,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{}),...headers},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});
  const data=await response.json();
  trace.push({method,path:path.split('?')[0],status:response.status,requestId:response.headers.get('x-request-id'),
    durationMs:Math.round(performance.now()-started),requestBytes:body?Buffer.byteLength(JSON.stringify(body)):0});
  assert.equal(response.status,status,`${method} ${path.split('?')[0]}: ${data.code??'unexpected status'}`);
  return data;
}
try{
  const login=await fetch(authOrigin+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:apiKey,'Content-Type':'application/json'},
    body:JSON.stringify({email:process.env.AZURE_TEST_EMAIL,password:process.env.AZURE_TEST_PASSWORD}),signal:AbortSignal.timeout(20000)});
  const session=await login.json();
  assert.equal(login.status,200,'Dedicated test account sign-in failed');
  token=session.access_token;
  assert.equal(session.user?.id,subject,'Dedicated test account UUID mismatch');
  const verified=await fetch(authOrigin+'/auth/v1/user',{headers:{apikey:apiKey,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
  assert.equal(verified.status,200);assert.equal((await verified.json()).id,subject);
  if(production){origin='https://jackyun-sync-9d26b2cc.azurewebsites.net';}else{
  tempDirectory=await mkdtemp(join(tmpdir(),'jackyun-v5-http-'));
  const caPath=join(tempDirectory,'ca.pem');await writeFile(caPath,tls.rootCertificates.join('\n'));
  database=createDatabase({host:process.env.PGHOST,database:process.env.PGDATABASE,user:process.env.PGUSER,password:process.env.PGPASSWORD,caPath});
  Object.assign(process.env,{SYNC_V5_MODE:'test-users',SYNC_V5_USERS:subject,SYNC_V5_SCOPES:SYNC_V5_SCOPES.join(','),SYNC_V5_WRITE_PAUSE:'false'});
  const authenticate=createAuthenticator({supabaseUrl:authOrigin,publishableKey:apiKey,
    verifyAccount:createAccountStateVerifier({supabaseUrl:authOrigin,publishableKey:apiKey})});
  const {createSyncApi}=await import('../azure/backend/sync-api.mjs');
  server=createApiServer({authenticate,handle:createSyncApi(database),logger:{info(){},error(){}}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  origin=`http://127.0.0.1:${server.address().port}`;
  }
  const capabilities=await request('GET','/api/sync/v5');
  assert.deepEqual([...capabilities.scopes].sort(),[...SYNC_V5_SCOPES].sort());
  report.realBearerAuthentication=true;
  await request('GET','/api/sync/v5',undefined,401,{Authorization:'Bearer invalid.token.signature'});
  await request('GET','/api/sync/v5',undefined,403,{'X-Sync-Account':randomUUID()});
  report.invalidTokenRejected=true;report.accountMismatchRejected=true;
  for(const scope of SYNC_V5_SCOPES){
    console.error(`[staging-http] ${scope}: authenticating and checking CRUD, replay, conflict and recovery`);
    const field=fields[scope],recordId=scope==='workspace'?legacyWorkspaceRecordId(`jackyun_ielts_http_probe_${nonce}`)
      :scope==='timetable'?'timetable:$value':`${field}:v5-http-probe-${nonce}`;
    const path=`/api/sync/v5/records?scope=${scope}&id=${encodeURIComponent(recordId)}`;
    const read=async()=>(await request('GET',path)).records[0];
    const post=(operation,deviceId=deviceA)=>request('POST','/api/sync/v5/operations',{scope,deviceId,operations:[operation]});
    const receipt=operation=>request('POST','/api/sync/v5/receipts',{scope,operations:[{id:operation.id,requestHash:hash(operation)}]});
    const baseline=await read();let touched=false,latestRevision=baseline?.revision??0;
    try{
      const value={id:`v5-http-probe-${nonce}`,fixture:'jackyun-v5-staging-http',nonce,title:'Temporary staging acceptance probe',sequence:1};
      const operation={id:randomUUID(),scope,recordId,baseRevision:baseline?.revision??0,baseHash:baseline?.contentHash??null,value,deleted:false,clientUpdatedAt:new Date().toISOString()};
      touched=true;
      const concurrent=await Promise.all([post(operation),post(operation,deviceB)]);
      latestRevision=operation.baseRevision+1;
      for(const response of concurrent){assert.equal(response.applied.length,1);assert.equal(response.applied[0].revision,latestRevision);assert.equal(response.applied[0].contentHash,hash(value));}
      assert.equal(concurrent[0].head,concurrent[1].head,'Concurrent duplicate must advance the cursor only once');
      assert.equal((await receipt(operation)).receipts[0].state,'confirmed');
      const record=await read();assert.deepEqual(record.value,value);assert.equal(record.contentHash,hash(value));
      const manifest=await request('GET',`/api/sync/v5/manifest?scope=${scope}&field=${field}`);
      assert.ok(manifest.records.some(row=>row.recordId===recordId));
      const edit={...operation,id:randomUUID(),baseRevision:latestRevision,baseHash:hash(value),value:{...value,sequence:2}};
      const updated=await post(edit,deviceB);latestRevision++;
      assert.equal(updated.applied[0].revision,latestRevision);assert.equal(updated.applied[0].contentHash,hash(edit.value));
      const conflict=await post({...operation,id:randomUUID()});assert.equal(conflict.applied.length,0);assert.equal(conflict.conflicts[0].revision,latestRevision);
      await request('POST','/api/sync/v5/operations',{scope,deviceId:deviceA,operations:[{...operation,value:edit.value}]},409);
      const afterConflict=await read();assert.deepEqual(afterConflict.value,edit.value);assert.equal(afterConflict.contentHash,hash(edit.value));
      const deletion={id:randomUUID(),scope,recordId,baseRevision:latestRevision,baseHash:hash(edit.value),deleted:true,clientUpdatedAt:new Date().toISOString()};
      const removed=await post(deletion);latestRevision++;
      assert.equal(removed.applied[0].contentHash,deletedHash);assert.equal((await read()).deleted,true);
      assert.equal((await receipt(deletion)).receipts[0].state,'confirmed');
      const restore={...operation,id:randomUUID(),baseRevision:latestRevision,baseHash:deletedHash,value:{...value,sequence:3}};
      const recovered=await post(restore);latestRevision++;
      assert.equal(recovered.applied[0].revision,latestRevision);assert.deepEqual((await read()).value,restore.value);
      outcomes.push({scope,status:'PASS',crud:true,sha256:true,receipts:true,concurrentDuplicate:true,staleWriteConflict:true,
        operationIdReuseRejected:true,deletionRecovery:true,manifest:true,logicalBaselineRestored:false});
    }finally{
      if(touched){
        try{
          const current=await read();
          assert.ok(current&&(current.deleted||current.value?.nonce===nonce),'Probe changed externally; preserve it for review');
          const restore={id:randomUUID(),scope,recordId,baseRevision:current.revision,baseHash:current.contentHash,
            ...(baseline&&!baseline.deleted?{value:baseline.value,deleted:false}:{deleted:true}),clientUpdatedAt:new Date().toISOString()};
          assert.equal((await post(restore)).applied.length,1);
          const final=await read();
          if(baseline&&!baseline.deleted){assert.deepEqual(final.value,baseline.value);assert.equal(final.contentHash,baseline.contentHash);}
          else {assert.equal(final.deleted,true);assert.equal(final.value,null);}
          const outcome=outcomes.find(row=>row.scope===scope);if(outcome)outcome.logicalBaselineRestored=true;
        }catch(error){cleanupFailures.push({scope,code:error.code??'CLEANUP_FAILED'});throw error;}
      }
    }
  }
}catch(error){
  failure={code:error.code??'HTTP_ACCEPTANCE_FAILED',assertion:error.code==='ERR_ASSERTION'?error.message.split('\n')[0]:undefined};
  process.exitCode=1;
}finally{
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  await database?.close();
  if(token){const logout=await fetch(authOrigin+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:apiKey,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)}).catch(()=>null);report.testSessionRevoked=logout?.ok===true;}
  if(tempDirectory)await rm(tempDirectory,{recursive:true,force:true});
  for(const [key,value] of priorFlags){if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
Object.assign(report,{ok:!failure&&outcomes.length===SYNC_V5_SCOPES.length&&cleanupFailures.length===0,failure,cleanupFailures});
await writeFile(process.env.V5_HTTP_REPORT_PATH??`docs/sync-v5-final-${production?'production':'staging'}-http-20261027.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
