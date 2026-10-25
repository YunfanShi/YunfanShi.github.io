import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory,IDBKeyRange,IDBObjectStore} from 'fake-indexeddb';
import {randomUUID} from 'node:crypto';
import * as store from '../src/lib/sync/outbox.ts';
import {recoveryDelay,retryAfterMilliseconds,runScheduledSync} from '../src/lib/sync/scheduler.ts';
import {createWorkspaceSync} from '../src/lib/sync/engine.ts';
import {device,server,remote,key} from './sync-engine-fixture.mts';

Object.assign(globalThis,{indexedDB:new IDBFactory(),IDBKeyRange});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});

test('document and upload intent commit atomically, including deletion',async()=>{
  await store.bindSyncUser(randomUUID());
  await store.persistDocument('study','{"answer":1}');
  assert.equal((await store.getDocuments())[0].value,'{"answer":1}');
  assert.deepEqual((await store.getOutbox())[0].value,{answer:1});
  await store.persistDocument('study',null);
  assert.equal((await store.getDocuments())[0].value,null);
  assert.equal((await store.getOutbox())[0].deleted,true);
});

test('quota failure aborts the document as well as the queued operation',async()=>{
  await store.bindSyncUser(randomUUID());
  const original=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args:Parameters<typeof original>){
    if(this.name==='outbox')throw new DOMException('quota','QuotaExceededError');
    return original.apply(this,args);
  };
  try{await assert.rejects(store.persistDocument('study','draft'),{name:'QuotaExceededError'});}
  finally{IDBObjectStore.prototype.put=original;}
  assert.equal((await store.getDocuments()).length,0);
  assert.equal((await store.getOutbox()).length,0);
});

test('account namespaces retain each account queue across switches',async()=>{
  const alice=randomUUID(),bob=randomUUID();
  await store.bindSyncUser(alice);await store.persistDocument('study','alice');
  await store.bindSyncUser(bob);assert.equal((await store.getDocuments()).length,0);
  await store.persistDocument('study','bob');
  await store.bindSyncUser(alice);assert.equal((await store.getDocuments())[0].value,'alice');
  assert.equal((await store.getOutbox())[0].value,'alice');
});
test('a bound worker cannot write into a newly selected account',async()=>{
  const alice=randomUUID(),bob=randomUUID();await store.bindSyncUser(alice);
  const worker=store.accountSyncStore(alice);await store.bindSyncUser(bob);
  await worker.queueOperation({id:randomUUID(),key:'study',baseRevision:0,baseHash:null,baseValue:null,value:'alice',deleted:false,clientUpdatedAt:new Date().toISOString()});
  assert.equal((await store.getOutbox()).length,0);assert.equal((await worker.getOutbox())[0].value,'alice');
});

test('same-field concurrent local edit fails without deleting either saved intent',async()=>{
  await store.bindSyncUser(randomUUID());
  await store.persistDocument('study','{"text":"base"}');
  await store.persistDocument('study','{"text":"first"}',true,'{"text":"base"}');
  await assert.rejects(store.persistDocument('study','{"text":"second"}',true,'{"text":"base"}'),/冲突/);
  assert.equal((await store.getDocuments())[0].value,'{"text":"first"}');
  assert.deepEqual((await store.getOutbox())[0].value,{text:'first'});
});

test('independent local fields merge and stale remote application cannot overwrite an edit',async()=>{
  await store.bindSyncUser(randomUUID());
  await store.persistDocument('study','{"a":0,"b":0}');
  await store.persistDocument('study','{"a":1,"b":0}',true,'{"a":0,"b":0}');
  await store.persistDocument('study','{"a":0,"b":2}',true,'{"a":0,"b":0}');
  assert.deepEqual(JSON.parse((await store.getDocuments())[0].value!),{a:1,b:2});
  assert.equal(await store.persistDocument('study','remote',false,'old'),false);
});

test('checkpoint advancement and clearing staged page use one transaction',async()=>{
  await store.bindSyncUser(randomUUID());
  await store.setSetting('v4StagedPage',{records:[{key:'study'}]});
  await store.commitPullPage({mode:'changes',cursor:17});
  assert.equal(await store.getSetting('v4StagedPage'),null);
  assert.deepEqual(await store.getSetting('v4Checkpoint'),{mode:'changes',cursor:17});
});

test('fallback leases permit only one worker and a later owner receives a higher token',async()=>{
  await store.bindSyncUser(randomUUID());let release!:()=>void,entered!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;});
  const first=store.withSyncLease('test',async()=>{entered();await new Promise<void>(resolve=>{release=resolve;});return 'first';});
  await started;assert.equal(await store.withSyncLease('test',async()=> 'second'),undefined);
  release();assert.equal(await first,'first');assert.equal(await store.withSyncLease('test',async()=> 'third'),'third');
});
test('concurrent device initialization returns one persisted device ID',async()=>{
  await store.bindSyncUser(randomUUID());const [a,b]=await Promise.all([store.getOrCreateDeviceId(),store.getOrCreateDeviceId()]);assert.equal(a,b);
});

test('jitter is bounded and Retry-After accepts both seconds and HTTP dates',()=>{
  assert.equal(recoveryDelay(1,1),2000);assert.equal(recoveryDelay(20,1),120000);
  assert.equal(retryAfterMilliseconds('7'),7000);
  assert.equal(retryAfterMilliseconds('Thu, 01 Jan 1970 00:00:12 GMT',10000),2000);
  assert.equal(retryAfterMilliseconds('invalid'),0);
});

test('circuit state persists, blocks ordinary attempts, and permits one manual probe',async()=>{
  const user=randomUUID();await store.bindSyncUser(user);let attempts=0;
  const fail=async()=>{attempts++;throw Object.assign(Error('offline'),{status:503});};
  for(let n=0;n<5;n++)await assert.rejects(runScheduledSync('workspace',user,fail,true));
  assert.equal(await runScheduledSync('workspace',user,fail),false);assert.equal(attempts,5);
  assert.equal(await runScheduledSync('workspace',user,async()=>{},true),true);
  const state=await store.getSetting<{failures:number}>(`recovery:${user}:workspace`);assert.equal(state?.failures,0);
});

test('v4 recovers a lost committed response from receipts without another write',async()=>{
  const initial=remote({text:'base'}),cloud=server(initial),d=device(cloud,initial);
  const settings=new Map<string,unknown>();
  Object.assign(d.store,{getSetting:async(k:string)=>settings.get(k)??null,setSetting:async(k:string,v:unknown)=>{settings.set(k,v);}});
  let receipt:Record<string,unknown>|undefined,pushes=0,lost=true;
  d.environment.request=async(url,init)=>{
    if(url==='/api/sync/v4'&&!init?.method)return Response.json({ok:true,syncProtocol:4,capabilities:{v4:true}});
    const body=init?.body?JSON.parse(String(init.body)):null;
    if(body?.action==='receipts')return Response.json({ok:true,receipts:[{operationId:body.operations[0].id,key,state:'confirmed',result:receipt}]});
    if(url==='/api/sync/v4'&&init?.method==='POST'){
      pushes++;const response=await cloud.request('/api/sync/v2',{...init,body:JSON.stringify({...body,syncProtocol:3})});
      const payload=await response.json();receipt={status:'applied',...payload.applied[0]};
      if(lost){lost=false;throw new TypeError('response lost');}return Response.json(payload);
    }
    return cloud.request(url,init);
  };
  d.set({text:'new'});await assert.rejects(d.restart().flush(),/lost/);
  await d.restart().flush();assert.equal(pushes,1);assert.equal((await d.store.getOutbox()).length,0);
});

test('v4 staged page replays after failure and cursor advances only after successful apply',async()=>{
  const initial=remote({text:'base'}),changed=remote({text:'new'},2),cloud=server(changed),d=device(cloud,initial);
  const settings=new Map<string,unknown>([['v4Checkpoint',{mode:'changes',cursor:2}]]);
  Object.assign(d.store,{getSetting:async(k:string)=>settings.get(k)??null,setSetting:async(k:string,v:unknown)=>{settings.set(k,v);}});
  let fail=true;
  d.environment.request=async(url,init)=>{
    if(url==='/api/sync/v4')return Response.json({ok:true,syncProtocol:4,capabilities:{v4:true}});
    if(url.startsWith('/api/sync/v4?'))return Response.json({ok:true,syncProtocol:4,records:[changed],cursor:3,until:3,hasMore:false});
    if(fail)throw new TypeError('network down');return cloud.request(url,init);
  };
  await assert.rejects(createWorkspaceSync(d.environment).pull());
  assert.deepEqual(settings.get('v4Checkpoint'),{mode:'changes',cursor:2});assert.ok(settings.get('v4StagedPage'));
  fail=false;await createWorkspaceSync(d.environment).pull();
  assert.deepEqual(settings.get('v4Checkpoint'),{mode:'changes',cursor:3});assert.equal(settings.get('v4StagedPage'),null);
});
test('a failed key holds the durable checkpoint while later pages still apply',async()=>{
  const cloud=server(),d=device(cloud),settings=new Map<string,unknown>([['v4Checkpoint',{mode:'changes',cursor:0}]]);
  Object.assign(d.store,{getSetting:async(k:string)=>settings.get(k)??null,setSetting:async(k:string,v:unknown)=>{settings.set(k,v);}});
  const a={...remote({text:'bad'}),key:'a'},b={...remote({text:'good'}),key:'b'};
  d.environment.request=async(url)=>{
    if(url==='/api/sync/v4')return Response.json({ok:true,syncProtocol:4,capabilities:{v4:true}});
    if(url.includes('mode=changes')){const cursor=Number(new URL(url,'https://test').searchParams.get('cursor'));
      return Response.json({ok:true,syncProtocol:4,records:cursor===0?[a]:cursor===1?[b]:[],cursor:cursor===0?1:2,until:2,hasMore:cursor===0});}
    if(url.includes('key=a'))throw new TypeError('one key failed');
    return Response.json({ok:true,records:[b]});
  };
  await assert.rejects(createWorkspaceSync(d.environment).pull(),/one key failed/);
  assert.deepEqual(JSON.parse(d.environment.read('b')!),{text:'good'});
  assert.deepEqual(settings.get('v4Checkpoint'),{mode:'changes',cursor:0});
  assert.ok(settings.get('v4StagedPage'));
});
