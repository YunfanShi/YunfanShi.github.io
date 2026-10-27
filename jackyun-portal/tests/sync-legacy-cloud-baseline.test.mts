import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {accountSyncStore,getDocuments,getOutbox,getSetting,getV5Conflicts,getV5Outbox,openDatabase,replaceLegacyFromCloud} from '../src/lib/sync/outbox.ts';
import {createWorkspaceSync} from '../src/lib/sync/engine.ts';
import {canonicalJson} from '../src/lib/sync/hash.ts';
import type {SyncRecord} from '../src/types/sync.ts';
Object.assign(globalThis,{indexedDB:new IDBFactory()});
const schedule='jackyun_schedule_control_v1';
const id=()=>`cloud-baseline-${crypto.randomUUID()}`;
const cloud=(key:string,value:unknown):SyncRecord=>({key,value,revision:8,contentHash:createHash('sha256').update(canonicalJson(value)).digest('hex'),deleted:false,updatedAt:'2026-10-27T10:00:00.000Z'});
async function seed(scope:string,work:(tx:IDBTransaction)=>void){
  const db=await openDatabase(scope);try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['documents','metadata','outbox','conflicts','settings','v5Outbox','v5Conflicts'],'readwrite');work(tx);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
const operation=(key:string)=>({id:crypto.randomUUID(),key,baseRevision:1,baseHash:'a'.repeat(64),baseValue:{old:true},baseDeleted:false,value:{oldLocal:true},deleted:false,clientUpdatedAt:'old',sequence:1});

test('cloud replacement repairs an invalid legacy Schedule while retaining every v5 intent',async()=>{
  const scope=id(),raw='["old incompatible data"]',old=operation(schedule),unrelated=operation('unrelated');
  const pending={id:crypto.randomUUID(),scope:'cue' as const,recordId:'cues:pending',baseRevision:0,baseHash:null,value:{id:'pending',prompt:'unconfirmed'},deleted:false,clientUpdatedAt:'now'};
  const conflict={operationId:crypto.randomUUID(),scope:'cue' as const,recordId:'cues:conflicted',baseRevision:1,baseHash:'b'.repeat(64),localValue:{id:'conflicted',prompt:'keep local side'},localDeleted:false,remoteValue:{id:'conflicted',prompt:'cloud side'},remoteDeleted:false,remoteRevision:2,remoteHash:'c'.repeat(64),createdAt:'now'};
  const remote=cloud(schedule,{schemaVersion:1,cues:[{id:'cloud',prompt:'newest server'},{id:'conflicted',prompt:'cloud side'}]});
  await seed(scope,tx=>{
    tx.objectStore('documents').put({key:schedule,value:raw,updatedAt:1});
    tx.objectStore('outbox').put(old);tx.objectStore('outbox').put(unrelated);
    tx.objectStore('v5Outbox').put(pending);tx.objectStore('v5Conflicts').put(conflict);
    tx.objectStore('settings').put({key:'syncSubmission',value:{body:'frozen legacy body',operations:[old,unrelated],protocol:4,compressed:false}});
  });
  const result=await replaceLegacyFromCloud(remote,raw,scope);
  assert.equal(result.applied,true);
  const value=JSON.parse(result.value!);
  assert.deepEqual(new Set(value.cues.map((row:{id:string})=>row.id)),new Set(['cloud','conflicted','pending']));
  assert.equal(value.cues.find((row:{id:string})=>row.id==='conflicted').prompt,'keep local side');
  assert.deepEqual(await getV5Outbox('cue',scope),[pending]);assert.deepEqual(await getV5Conflicts(scope),[conflict]);
  assert.deepEqual((await getOutbox(scope)).map(row=>row.id),[unrelated.id]);
  assert.equal((await getSetting<{document:{value:string}}>(`legacyCloudArchive:v1:${schedule}`,scope))?.document.value,raw);
  assert.ok(await getSetting(`legacyCloudComplete:v1:${schedule}`,scope));
  assert.equal(await getSetting('syncSubmission',scope),null);
  assert.ok(await getSetting('legacyCloudSubmissionArchive:v1',scope));
});

test('bad hashes, invalid remote Schedule and concurrent edits never replace local content',async()=>{
  const scope=id(),key=schedule,raw='"legacy"',remote=cloud(key,{schemaVersion:1,cues:[]});
  await seed(scope,tx=>tx.objectStore('documents').put({key,value:raw,updatedAt:1}));
  await assert.rejects(replaceLegacyFromCloud({...remote,contentHash:'f'.repeat(64)},raw,scope),/SHA-256/);
  await assert.rejects(replaceLegacyFromCloud(cloud(key,[]),raw,scope),/Schedule/);
  assert.equal((await replaceLegacyFromCloud(remote,'different snapshot',scope)).applied,false);
  assert.equal((await getDocuments(scope))[0].value,raw);
  assert.equal(await getSetting(`legacyCloudComplete:v1:${key}`,scope),null);
});

test('replacement failure rolls back the document, retired queue and completion stamp together',async()=>{
  const scope=id(),key='legacy-collection',raw='{"local":true}',old=operation(key);
  await seed(scope,tx=>{tx.objectStore('documents').put({key,value:raw,updatedAt:1});tx.objectStore('outbox').put(old);});
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args:Parameters<typeof put>){if(this.name==='documents')throw Error('injected cloud baseline disk failure');return put.apply(this,args);};
  try{await assert.rejects(replaceLegacyFromCloud(cloud(key,{cloud:true}),raw,scope),/injected/);}finally{IDBObjectStore.prototype.put=put;}
  assert.equal((await getDocuments(scope))[0].value,raw);assert.deepEqual(await getOutbox(scope),[old]);
  assert.equal(await getSetting(`legacyCloudComplete:v1:${key}`,scope),null);
  assert.equal(await getSetting(`legacyCloudArchive:v1:${key}`,scope),null);
});

test('a v5-owned workspace key is excluded even if a legacy replacement is requested',async()=>{
  const scope=id(),key='jackyun_ielts_goal_v1',raw='{"local":true}';
  await seed(scope,tx=>{tx.objectStore('documents').put({key,value:raw});tx.objectStore('settings').put({key:'v5WorkspaceAuthorityKeys',value:[key]});});
  assert.equal((await replaceLegacyFromCloud(cloud(key,{cloud:true}),raw,scope)).applied,false);
  assert.equal((await getDocuments(scope))[0].value,raw);
});

test('legacy refresh downloads once, performs no old uploads, and leaves later local edits alone',async()=>{
  const user=id(),store=accountSyncStore(user),values=new Map<string,string>([['legacy-setting','old']]),requests:string[]=[];
  let failRead=true;
  await seed(store.databaseScope,tx=>{tx.objectStore('documents').put({key:'legacy-setting',value:'old'});tx.objectStore('outbox').put(operation('legacy-setting'));});
  const engine=createWorkspaceSync({store,snapshot:()=>Object.fromEntries(values),read:key=>values.get(key)??null,write:()=>{},backup:async()=>{},changed:()=>{},
    request:async(url,init)=>{assert.ok(!init?.method||init.method==='GET');requests.push(url);if(failRead)throw Object.assign(Error('network unavailable'),{status:503});return Response.json({ok:true,records:[cloud('legacy-setting','{"latest":"cloud"}')]});},
    progress:()=>{},deviceId:async()=>crypto.randomUUID(),device:()=>({name:'test',platform:'web'}),cancelled:()=>false,now:Date.now,uuid:()=>crypto.randomUUID(),
    projectLegacyBaseline:async(key,value)=>{if(value===null)values.delete(key);else values.set(key,value);}});
  await assert.rejects(engine.refreshLegacyCloudBaselines(),/network unavailable/);
  assert.equal(values.get('legacy-setting'),'old');assert.equal((await store.getOutbox()).length,1);
  assert.equal(await store.getSetting('legacyCloudComplete:v1:legacy-setting'),null);
  failRead=false;
  await engine.refreshLegacyCloudBaselines();
  assert.equal(values.get('legacy-setting'),'{"latest":"cloud"}');assert.deepEqual(await store.getOutbox(),[]);
  await engine.capture();assert.deepEqual(await store.getOutbox(),[],'an unchanged cloud string that looks like JSON must not become a new upload');
  values.set('newly-created-after-migration','new offline intent');
  await engine.refreshLegacyCloudBaselines();
  assert.equal(requests.length,2);assert.equal(values.get('newly-created-after-migration'),'new offline intent');
});

test('a local edit made during the forced download is retained instead of being replaced',async()=>{
  const user=id(),store=accountSyncStore(user),values=new Map([['legacy-edit','old']]);let requests=0;
  await seed(store.databaseScope,tx=>tx.objectStore('documents').put({key:'legacy-edit',value:'old'}));
  const engine=createWorkspaceSync({store,snapshot:()=>Object.fromEntries(values),read:key=>values.get(key)??null,write:()=>{},backup:async()=>{},changed:()=>{},
    request:async()=>{requests++;values.set('legacy-edit','new edit while downloading');await seed(store.databaseScope,tx=>tx.objectStore('documents').put({key:'legacy-edit',value:'new edit while downloading'}));return Response.json({ok:true,records:[cloud('legacy-edit','server')]});},
    progress:()=>{},deviceId:async()=>crypto.randomUUID(),device:()=>({name:'test',platform:'web'}),cancelled:()=>false,now:Date.now,uuid:()=>crypto.randomUUID(),projectLegacyBaseline:async()=>{throw Error('new edit must not be projected over');}});
  await engine.refreshLegacyCloudBaselines();await engine.refreshLegacyCloudBaselines();
  assert.equal(requests,1);assert.equal(values.get('legacy-edit'),'new edit while downloading');
  assert.equal(await store.getSetting('legacyCloudComplete:v1:legacy-edit'),null);
});
