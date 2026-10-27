import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {handleSyncV5} from '../sync-v5.mjs';
import {createV5ResourceSync} from '../../../src/lib/sync/resource-engine.ts';
import {getDocuments,getOutbox,getV5Outbox,openDatabase,persistDocument,prepareV5WorkspaceAuthority,setV5Cursor} from '../../../src/lib/sync/outbox.ts';
import {canonicalJson} from '../../../src/lib/sync/hash.ts';
import {legacyWorkspaceRecordId} from '../../../src/lib/sync/resource-model.ts';

/** Actual PostgreSQL handler plus simulated browser storage; caller owns the rollback transaction. */
export async function verifyStagingWorkspaceHandoff(client,subject){
  const previous=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');
  const originalDelete=IDBObjectStore.prototype.delete;
  Object.defineProperty(globalThis,'indexedDB',{value:new IDBFactory(),configurable:true,writable:true});
  const databaseScope=`staging-handoff-${randomUUID()}`,siteId=randomUUID(),deviceId=randomUUID();
  const key=`jackyun_personal_site_v1:${siteId}`,recordId=legacyWorkspaceRecordId(key),field='legacyPersonalSites';
  const value={id:siteId,name:'Staging imported site',schemaVersion:1,theme:'light',blocks:[{id:'block-1',type:'heading',text:'Synthetic staging fixture'}],updatedAt:new Date().toISOString()};
  const expectedHash=createHash('sha256').update(canonicalJson(value)).digest('hex');
  let operationPosts=0,loseResponse=true;
  const invoke=(method,url,body)=>handleSyncV5({query:(...args)=>client.query(...args)},{sub:subject},method,new URL(url,'https://staging.invalid'),body,['workspace']);
  const engine=()=>createV5ResourceSync({databaseScope,deviceId:async()=>deviceId,uuid:randomUUID,
    readSchedule:()=>null,projectSchedule:async()=>{},readWorkspace:()=>getDocuments(databaseScope),projectWorkspaceRecord:async()=>{},setAuthority:()=>{},
    request:async(url,init)=>{
      const body=init?.body?JSON.parse(String(init.body)):null;
      const result=await invoke(init?.method??'GET',url,body);
      if(new URL(url,'https://staging.invalid').pathname==='/api/sync/v5/operations'){
        operationPosts++;
        if(loseResponse){loseResponse=false;throw Error('Injected response loss after PostgreSQL commit work');}
      }
      return Response.json(result);
    },
  });
  try{
    console.error('[staging-v5:handoff] Preparing isolated browser database.');
    const head=Number((await client.query("SELECT sequence FROM public.sync_v5_heads WHERE user_id=$1 AND scope='workspace'",[subject])).rows[0].sequence);
    await setV5Cursor('workspace',{scope:'workspace',field,mode:'changes',after:'',cursor:head,head},databaseScope,field);
    assert.equal(await persistDocument(key,JSON.stringify(value),true,undefined,{onlyIfMissing:true,databaseScope}),true);
    const legacy=(await getOutbox(databaseScope))[0];
    assert.equal(legacy.key,key);
    const db=await openDatabase(databaseScope);
    const submission=async(value)=>new Promise((resolve,reject)=>{
      const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({key:'syncSubmission',value});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    try{
      await submission({operations:[legacy]});
      const frozen=await prepareV5WorkspaceAuthority([field],databaseScope);
      assert.deepEqual(frozen.migratedOperationIds,[]);
      assert.ok(frozen.deferredKeys.some(row=>row.key===key&&row.reason==='submission'));
      assert.equal((await getOutbox(databaseScope)).length,1);
      await submission(null);
    }finally{db.close();}

    console.error('[staging-v5:handoff] Frozen submission verified; checking handoff failure recovery.');
    IDBObjectStore.prototype.delete=function(id){
      if(this.name==='outbox'&&id===legacy.id)throw Error('Injected staging handoff delete failure');
      return originalDelete.call(this,id);
    };
    await assert.rejects(prepareV5WorkspaceAuthority([field],databaseScope),/Injected staging handoff delete failure/);
    IDBObjectStore.prototype.delete=originalDelete;
    assert.deepEqual((await getOutbox(databaseScope)).map(row=>row.id),[legacy.id]);
    assert.deepEqual(await getV5Outbox('workspace',databaseScope),[]);
    const transferred=await prepareV5WorkspaceAuthority([field],databaseScope);
    assert.deepEqual(transferred.migratedOperationIds,[legacy.id]);
    assert.deepEqual(await getOutbox(databaseScope),[]);
    assert.equal((await getV5Outbox('workspace',databaseScope))[0].id,legacy.id);

    console.error('[staging-v5:handoff] Atomic queue transfer verified; checking lost server response.');
    await assert.rejects(engine().synchronize([{scope:'workspace',field}]),/Injected response loss/);
    assert.equal((await getV5Outbox('workspace',databaseScope))[0].id,legacy.id,'lost response must retain the original operation');
    const read=()=>invoke('GET',`/api/sync/v5/records?scope=workspace&id=${encodeURIComponent(recordId)}`,null);
    assert.equal((await read()).records[0].revision,1);
    IDBObjectStore.prototype.delete=function(id){
      if(this.name==='v5Outbox'&&id===legacy.id)throw Error('Injected staging receipt persistence failure');
      return originalDelete.call(this,id);
    };
    await assert.rejects(engine().synchronize([{scope:'workspace',field}]),/Injected staging receipt persistence failure/);
    IDBObjectStore.prototype.delete=originalDelete;
    assert.equal((await getV5Outbox('workspace',databaseScope))[0].id,legacy.id);
    console.error('[staging-v5:handoff] Receipt failure retained the queue; checking worker recovery.');
    await engine().synchronize([{scope:'workspace',field}]);
    assert.equal(operationPosts,1,'reloaded worker must recover from a receipt without resending the mutation');
    assert.deepEqual(await getV5Outbox('workspace',databaseScope),[]);
    assert.deepEqual(await getOutbox(databaseScope),[]);
    assert.equal((await getDocuments(databaseScope)).find(row=>row.key===key).value,JSON.stringify(value));
    const row=(await read()).records[0];
    assert.equal(row.revision,1);assert.equal(row.contentHash,expectedHash);assert.deepEqual(row.value,value);
    const counts=(await client.query("SELECT count(*)::int AS count FROM public.sync_v5_receipts WHERE user_id=$1 AND scope='workspace' AND operation_id=$2",[subject,legacy.id])).rows[0];
    assert.equal(counts.count,1);
    return {frozenSubmissionDeferred:true,atomicHandoffFailureRetried:true,stableOperationIdPreserved:true,
      serverAcceptedLostResponseRecovered:true,localReceiptFailureRetried:true,serverMutationPosts:operationPosts,
      singleSqlReceiptAndRevisionVerified:true,readBackHashVerified:true,
      storageEnvironment:'fake-indexeddb',serverEnvironment:'actual restricted PostgreSQL transaction',bearerHttpAuthenticationTested:false};
  }finally{
    IDBObjectStore.prototype.delete=originalDelete;
    if(previous)Object.defineProperty(globalThis,'indexedDB',previous);else delete globalThis.indexedDB;
  }
}
