import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {device,remote,server,key,checksum} from './sync-engine-fixture.mts';
import {compactSyncOperations} from '../src/lib/sync/batch.ts';
import {reconcileAcknowledgment} from '../src/lib/sync/acknowledgment.ts';
import {splitSyncBody} from '../src/lib/sync/transfer.ts';
import {mergeWorkspaceValues} from '../src/lib/sync/merge-policy.ts';
import {canonicalJson} from '../src/lib/sync/hash.ts';
import {threeWayMerge} from '../src/lib/sync/merge.ts';
import {isSyncableStorageKey} from '../src/lib/local-workspace.ts';
import {compareSyncValues} from '../src/lib/sync/comparison.ts';
import type * as Outbox from '../src/lib/sync/outbox.ts';

function persistentStores() {
  const indexedDB=new IDBFactory();
  function open() {
    const exports={} as typeof Outbox;
    const require=(name:string)=>name.includes('/batch')?{compactSyncOperations}:name.includes('/hash')?{canonicalJson}:name.includes('/merge')?{threeWayMerge}:name.includes('local-workspace')?{isSyncableStorageKey}:{reconcileAcknowledgment};
    const compiled=ts.transpileModule(readFileSync(new URL('../src/lib/sync/outbox.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(compiled,{exports,require,indexedDB,IDBKeyRange,crypto,TextEncoder,setInterval,clearInterval});return exports;
  }
  return {open};
}

test('an actual IndexedDB journal survives a new module and rebases newer edits after a lost receipt',async()=>{
  const initial=remote({text:'base',other:0}),cloud=server(initial),d=device(cloud,initial),stores=persistentStores();
  let store=stores.open();await store.bindSyncUser('alice');await store.saveMetadata(initial);d.environment.store=store;
  const bodies:string[]=[];d.environment.request=async(url,init)=>{if(init?.method==='POST')bodies.push(String(init.body));return cloud.request(url,init);};
  d.set({text:'first',other:0});cloud.loseNextReply();await assert.rejects(d.restart().flush(),/response lost/);
  assert.ok(await store.getSubmission());d.set({text:'second',other:0});
  // Another device changes an independent field after our first write committed.
  cloud.cloud=remote({text:'first',other:7},3);
  store=stores.open();await store.bindSyncUser('alice');d.environment.store=store;
  await d.restart().synchronize();assert.equal(bodies[0],bodies[1]);
  assert.deepEqual(d.value,{text:'second',other:7});assert.deepEqual(cloud.cloud!.value,d.value);
  assert.equal((await store.getConflicts()).length,0);assert.equal(await store.getSubmission(),null);assert.equal((await store.getOutbox()).length,0);
});

test('a failed durable send-record write prevents the network mutation',async()=>{
  const cloud=server(),d=device(cloud);d.set({text:'kept'});
  d.store.saveSubmission=async()=>{throw Error('disk full');};
  await assert.rejects(d.engine.flush(),/disk full/);assert.equal(cloud.writes,0);assert.equal((await d.store.getOutbox()).length,1);
});

test('an invalid receipt retains immutable intent and a later valid receipt confirms without duplicate writes',async()=>{
  const cloud=server(),d=device(cloud);d.set({text:'once'});let corrupt=true;
  d.environment.request=async(url,init)=>{
    const response=await cloud.request(url,init);
    if(init?.method==='POST'&&corrupt){corrupt=false;const body=await response.json();body.applied[0].contentHash='f'.repeat(64);return Response.json(body);}
    return response;
  };
  await assert.rejects(d.engine.flush(),/确认/);assert.ok(await d.store.getSubmission());
  await d.restart().synchronize();assert.equal(cloud.writes,1);assert.equal(await d.store.getSubmission(),null);
});

test('a crash between saving metadata and acknowledging the outbox recovers without losing later edits',async()=>{
  const cloud=server(),d=device(cloud);d.set({text:'first'});const acknowledge=d.store.acknowledgeOperation;let crash=true;
  d.store.acknowledgeOperation=async(...args)=>{if(crash){crash=false;throw Error('simulated crash');}return acknowledge(...args);};
  await assert.rejects(d.engine.flush(),/crash/);d.set({text:'after crash'});
  await d.restart().synchronize();assert.deepEqual(cloud.cloud!.value,{text:'after crash'});assert.equal(cloud.writes,2);
  assert.equal((await d.store.getConflicts()).length,0);
});

test('a timed-out download resumes saved IndexedDB fragments after a fresh engine and module',async()=>{
  const value={text:'中文📚'.repeat(50000)},record=remote(value,3),cloud=server(record),d=device(cloud),stores=persistentStores();
  d.environment.store=stores.open();d.environment.wait=async()=>{};
  const parts=splitSyncBody(JSON.stringify(value)),reads=new Map<number,number>();let failing=true;
  d.environment.request=async(url,init)=>{
    if(url.includes('/large')){const index=Number(new URL(url,'https://test').searchParams.get('part'));reads.set(index,(reads.get(index)??0)+1);
      if(index===2&&failing)throw new DOMException('timeout','TimeoutError');
      return Response.json({ok:true,revision:3,part:index,count:parts.length,data:parts[index]});}
    if(url.includes('/v2?'))return Response.json({ok:true,records:[{...record,value:null,large:true}]});
    return cloud.request(url,init);
  };
  await assert.rejects(d.restart().pull(),/timeout/);assert.equal(d.value,undefined);failing=false;
  d.environment.store=stores.open();await d.restart().pull();
  assert.deepEqual(d.value,value);assert.equal(reads.get(0),1);assert.equal(reads.get(1),1);assert.equal(reads.get(2),2);
  assert.equal((await d.environment.store.getDownloadParts(key,3,record.contentHash)).length,0);
});

test('corrupt persisted fragments cannot be applied and are discarded before retry',async()=>{
  const value={text:'verified'},record=remote(value,2),cloud=server(record),d=device(cloud),parts=splitSyncBody(JSON.stringify(value));
  await d.store.saveDownloadPart({key,revision:2,hash:record.contentHash,index:0,count:1,data:btoa('{"text":"wrong"}'),receivedAt:d.environment.now()});
  d.environment.request=async(url,init)=>url.includes('/large')?Response.json({ok:true,revision:2,part:0,count:1,data:parts[0]}):url.includes('/v2?')?Response.json({ok:true,records:[{...record,value:null,large:true}]}):cloud.request(url,init);
  await assert.rejects(d.restart().pull(),/校验/);assert.equal(d.value,undefined);assert.equal((await d.store.getMetadata()).length,0);
  await d.restart().pull();assert.deepEqual(d.value,value);
});

test('a cache write failure falls back to verified memory download without blocking sync',async()=>{
  const value={text:'cache optional'},record=remote(value),cloud=server(record),d=device(cloud),parts=splitSyncBody(JSON.stringify(value));
  d.store.saveDownloadPart=async()=>{throw Error('cache quota');};
  d.environment.request=async(url,init)=>url.includes('/large')?Response.json({ok:true,revision:1,part:0,count:1,data:parts[0]}):url.includes('/v2?')?Response.json({ok:true,records:[{...record,value:null,large:true}]}):cloud.request(url,init);
  await d.engine.pull();assert.deepEqual(d.value,value);
});

test('cache rows are revision-bound, concurrent part writes survive, and cleanup preserves the send journal',async()=>{
  const store=persistentStores().open(),submission={body:'immutable',operations:[],compressed:false};await store.saveSubmission(submission);
  await Promise.all(Array.from({length:8},(_,index)=>store.saveDownloadPart({key,revision:1,hash:'a'.repeat(64),index,count:8,data:btoa(String(index)),receivedAt:1})));
  assert.equal((await store.getDownloadParts(key,1,'a'.repeat(64))).length,8);
  assert.equal((await store.getDownloadParts(key,2,'a'.repeat(64))).length,0);
  await store.clearDownload(key);assert.equal((await store.getDownloadParts(key,1,'a'.repeat(64))).length,0);
  assert.equal((await store.getSubmission())!.body,'immutable');assert.equal(await store.getSetting('syncDownloadCharacters'),0);
});

test('metadata-only divergence no longer blocks independently edited Cue content',async()=>{
  const base=remote({cues:[{id:'a',prompt:'base',answer:'base',updatedAt:'2026-01-01T00:00:00Z'}]}),cloud=server(base),d=device(cloud,base);
  d.set({cues:[{id:'a',prompt:'local prompt',answer:'base',updatedAt:'2026-02-01T00:00:00Z'}]});
  cloud.cloud=remote({cues:[{id:'a',prompt:'base',answer:'cloud answer',updatedAt:'2999-01-01T00:00:00Z'}]},2);
  await d.engine.synchronize();assert.equal((await d.store.getConflicts()).length,0);
  assert.deepEqual(d.value,{cues:[{id:'a',prompt:'local prompt',answer:'cloud answer',updatedAt:'2999-01-01T00:00:00Z'}]});
});

test('metadata policy never chooses content, learning outcomes, unknown schemas or invalid clock values',()=>{
  const base={cues:[{id:'a',prompt:'base',status:'stable',updatedAt:'2026-01-01T00:00:00Z'}]},local={cues:[{id:'a',prompt:'A',status:'partial',updatedAt:'2026-02-01T00:00:00Z'}]},remote={cues:[{id:'a',prompt:'B',status:'unclear',updatedAt:'2999-01-01T00:00:00Z'}]};
  const merged=mergeWorkspaceValues(key,base,local,remote);assert.deepEqual(merged.conflicts,['$.cues[a].prompt','$.cues[a].status']);
  assert.equal((merged.merged as typeof local).cues[0].prompt,'A');
  assert.ok(mergeWorkspaceValues('unknown',base,local,remote).conflicts.includes('$.cues[a].updatedAt'));
  assert.ok(mergeWorkspaceValues(key,base,{cues:[{...local.cues[0],updatedAt:'bad'}]},remote).conflicts.includes('$.cues[a].updatedAt'));
});

test('a same-revision hash change is an integrity failure, never an automatic merge',async()=>{
  const original=remote({text:'original'},5),cloud=server(original),d=device(cloud,original);cloud.cloud=remote({text:'rewritten without revision'},5);
  await assert.rejects(d.engine.synchronize(),/相同云端版本/);assert.deepEqual(d.value,original.value);assert.equal(cloud.writes,0);
});

test('real conflicts after 240 automatic differences remain visible and counted',()=>{
  const base=Object.fromEntries(Array.from({length:240},(_,i)=>[`f${i}`,0]));
  const local={...base,answer:'local'},remote={...Object.fromEntries(Object.keys(base).map(k=>[k,1])),answer:'cloud'};
  const result=compareSyncValues({...base,answer:'base'},local,remote);
  assert.equal(result.total,241);assert.equal(result.conflictCount,1);assert.equal(result.rows[0].label,'答案');assert.equal(result.rows[0].conflict,true);
});

test('two-device deterministic fault sequence converges despite lost replies, new edits and restarts',async()=>{
  const original=remote({a:0,b:0}),cloud=server(original),a=device(cloud,original),b=device(cloud,original);let expectedA=0,expectedB=0;
  for(let step=1;step<=24;step++) {
    const d=step%2?a:b,field=step%2?'a':'b';
    const value={...(d.value as {a:number;b:number}),[field]:step};d.set(value);
    if(field==='a')expectedA=step;else expectedB=step;
    if(step%3===0){cloud.loseNextReply();await assert.rejects(d.restart().flush());d.set({...value,[field]:step+100});if(field==='a')expectedA=step+100;else expectedB=step+100;}
    await d.restart().synchronize();await a.restart().synchronize();await b.restart().synchronize();
    assert.equal((await a.store.getConflicts()).length,0);assert.equal((await b.store.getConflicts()).length,0);
    assert.deepEqual(cloud.cloud!.value,{a:expectedA,b:expectedB});assert.equal(cloud.cloud!.contentHash,checksum(cloud.cloud!.value));
  }
});

test('settings stamp conflicts use server metadata while content and unknown timestamps stay protected',()=>{
 const base='2026-10-22T14:25:50.000Z',local='2099-01-01T00:00:00.000Z',remote='2026-10-22T14:25:51.862Z';
 assert.deepEqual(mergeWorkspaceValues('jackyun_settings_appearance_preferences__updated_at',base,local,remote),{merged:remote,conflicts:[]});
 assert.ok(mergeWorkspaceValues('jackyun_settings_appearance_preferences',base,local,remote).conflicts.length);
 assert.ok(mergeWorkspaceValues('study__updated_at',base,local,remote).conflicts.length);
 assert.ok(mergeWorkspaceValues('jackyun_settings_appearance_preferences__updated_at',base,'not a timestamp',remote).conflicts.length);
});
