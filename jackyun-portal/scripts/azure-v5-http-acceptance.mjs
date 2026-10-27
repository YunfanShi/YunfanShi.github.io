import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {canonicalJson} from '../src/lib/sync/hash.ts';
import {legacyWorkspaceRecordId} from '../src/lib/sync/resource-model.ts';

const auth='https://gdcwwlnzylrzrqhaaljq.supabase.co/auth/v1';
const backend='https://jackyun-sync-9d26b2cc.azurewebsites.net';
const apiKey=process.env.SUPABASE_PUBLISHABLE_KEY;
const expectedSubject=process.env.V5_TEST_SUBJECT;
const scope=process.env.V5_TEST_SCOPE??'cue';
assert.ok(apiKey&&expectedSubject&&process.env.AZURE_TEST_EMAIL&&process.env.AZURE_TEST_PASSWORD,'Test account and public API configuration required');
assert.ok(['cue','workspace'].includes(scope),'Unsupported acceptance scope');
const hash=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
const nonce=randomUUID(),deviceId=randomUUID();
const recordId=scope==='cue'?`cues:v5-http-probe-${nonce}`:legacyWorkspaceRecordId(`jackyun_ielts_http_probe_${nonce}`);
assert.ok(recordId);
const trace=[];
let token,created=false,tombstoned=false,report;
async function request(method,path,body,expectedStatus=200){
  const started=performance.now();
  const response=await fetch(backend+path,{method,headers:{Authorization:`Bearer ${token}`,
    ...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),
    redirect:'error',signal:AbortSignal.timeout(30_000)});
  const data=await response.json();
  trace.push({method,path,status:response.status,requestId:response.headers.get('x-request-id')??data.requestId,
    durationMs:Math.round(performance.now()-started),requestBytes:body?Buffer.byteLength(JSON.stringify(body)):0});
  assert.equal(response.status,expectedStatus,`${method} ${path}: ${data.code??'unexpected status'}`);
  return data;
}
const operations=operation=>request('POST','/api/sync/v5/operations',{scope,deviceId,operations:[operation]});
const receipts=operation=>request('POST','/api/sync/v5/receipts',{scope,operations:[{id:operation.id,requestHash:hash(operation)}]});
const read=()=>request('GET',`/api/sync/v5/records?scope=${scope}&id=${encodeURIComponent(recordId)}`);
try{
  const login=await fetch(`${auth}/token?grant_type=password`,{method:'POST',headers:{apikey:apiKey,'Content-Type':'application/json'},
    body:JSON.stringify({email:process.env.AZURE_TEST_EMAIL,password:process.env.AZURE_TEST_PASSWORD}),
    redirect:'error',signal:AbortSignal.timeout(20_000)});
  const session=await login.json();
  assert.equal(login.status,200,'Test account sign-in failed');
  assert.equal(session.user?.id,expectedSubject,'Test account mismatch');
  assert.ok(session.access_token,'Sign-in did not issue a session');
  token=session.access_token;
  const verified=await fetch(`${auth}/user`,{headers:{apikey:apiKey,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20_000)});
  assert.equal(verified.status,200);
  assert.equal((await verified.json()).id,expectedSubject);
  const capabilities=await request('GET','/api/sync/v5');
  assert.equal(capabilities.capabilities?.v5,true);
  report={capturedAt:new Date().toISOString(),environment:'production',realLoginVerified:true,capabilitiesVerified:true,
    scopes:capabilities.scopes,rolloutMode:capabilities.rolloutMode,writePaused:capabilities.writePaused,scope,trace,writesPerformed:false};
  if(process.env.V5_HTTP_WRITE_TEST==='true'){
    assert.ok(capabilities.scopes.includes(scope),'Test scope must already be enabled for this account');
    const value={id:`v5-http-probe-${nonce}`,fixture:'jackyun-v5-http-acceptance',nonce,prompt:'Temporary synchronization acceptance probe',sequence:1};
    const operation={id:randomUUID(),scope,recordId,baseRevision:0,baseHash:null,value,deleted:false,clientUpdatedAt:new Date().toISOString()};
    // Mark before sending: a lost response still requires cleanup of this unique test record.
    created=true;
    const write=await operations(operation);
    assert.equal(write.applied.length,1);
    assert.equal(write.applied[0].revision,1);
    assert.equal(write.applied[0].contentHash,hash(value));
    const receipt=await receipts(operation);
    assert.equal(receipt.receipts[0].state,'confirmed');
    assert.equal(receipt.receipts[0].result.contentHash,hash(value));
    const replay=await operations(operation);
    assert.equal(replay.applied[0].revision,1);
    assert.equal(replay.applied[0].contentHash,hash(value));
    const original=await read();
    assert.deepEqual(original.records[0].value,value);
    assert.equal(hash(original.records[0].value),original.records[0].contentHash);

    const updatedValue={...value,sequence:2};
    const update={...operation,id:randomUUID(),baseRevision:1,baseHash:hash(value),value:updatedValue};
    const updated=await operations(update);
    assert.equal(updated.applied[0].revision,2);
    assert.equal(updated.applied[0].contentHash,hash(updatedValue));
    const stale=await operations({...operation,id:randomUUID()});
    assert.equal(stale.applied.length,0);
    assert.equal(stale.conflicts[0].revision,2);
    assert.deepEqual(stale.conflicts[0].value,updatedValue);
    const reused=await request('POST','/api/sync/v5/operations',{scope,deviceId,operations:[{...operation,value:updatedValue}]},409);
    assert.equal(reused.code,'OPERATION_ID_REUSED');
    const afterConflict=await read();
    assert.equal(afterConflict.records[0].contentHash,hash(updatedValue));

    const deletion={id:randomUUID(),scope,recordId,baseRevision:2,baseHash:hash(updatedValue),deleted:true,clientUpdatedAt:new Date().toISOString()};
    const removed=await operations(deletion);
    assert.equal(removed.applied[0].revision,3);
    assert.equal(removed.applied[0].contentHash,createHash('sha256').update('__deleted__').digest('hex'));
    const deleted=await read();
    assert.equal(deleted.records[0].deleted,true);
    assert.equal(deleted.records[0].value,null);
    const deletionReceipt=await receipts(deletion);
    assert.equal(deletionReceipt.receipts[0].state,'confirmed');
    tombstoned=true;
    report={...report,writesPerformed:true,testRecordId:recordId,writeHashVerified:true,receiptVerified:true,
      idempotentRetryVerified:true,readBackHashVerified:true,updateVerified:true,staleWriteConflictVerified:true,
      operationIdReuseRejected:true,tombstoneVerified:true,testRecordCleanupVerified:true};
  }
}catch(error){
  report={capturedAt:new Date().toISOString(),environment:'production',ok:false,code:'V5_HTTP_ACCEPTANCE_FAILED',
    failedAssertion:error.code==='ERR_ASSERTION'?error.message.split('\n')[0]:undefined,
    trace,writesPerformed:created};
  process.exitCode=1;
}finally{
  if(token&&created&&!tombstoned){
    try{
      const current=(await read()).records[0];
      if(current&&!current.deleted){
        assert.equal(current.value?.fixture,'jackyun-v5-http-acceptance');
        assert.equal(current.value?.nonce,nonce);
        await operations({id:randomUUID(),scope,recordId,baseRevision:current.revision,baseHash:current.contentHash,
          deleted:true,clientUpdatedAt:new Date().toISOString()});
      }
      report.testRecordCleanupVerified=true;
    }catch{report.testRecordCleanupVerified=false;report.testRecordId=recordId;}
  }
  if(token){
    const logout=await fetch(`${auth}/logout?scope=local`,{method:'POST',headers:{apikey:apiKey,Authorization:`Bearer ${token}`},
      signal:AbortSignal.timeout(10_000)}).catch(()=>null);
    report.testSessionRevoked=logout?.ok===true;
    token=undefined;
  }
}
report.ok=process.exitCode!==1;
if(process.env.V5_HTTP_REPORT_PATH)await writeFile(process.env.V5_HTTP_REPORT_PATH,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
