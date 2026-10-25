import assert from 'node:assert/strict';
import test from 'node:test';
import {checksum,device,remote,server} from './sync-engine-fixture.mts';
import {SyncProtocolError} from '../src/lib/sync/engine.ts';
import {syncFailureStatus} from '../src/lib/sync/service-error.ts';
import {threeWayMerge} from '../src/lib/sync/merge.ts';
import {splitSyncBody} from '../src/lib/sync/transfer.ts';
import {fetchSyncWithTimeout} from '../src/lib/request-timeout.ts';

test('real protocol errors defer transient failures, but keep auth and validation actionable',()=>{
  for(const status of [408,429,500,502,503,504]) {
    assert.equal(syncFailureStatus(new SyncProtocolError('unavailable',status),true,1),'offline_pending');
    assert.equal(syncFailureStatus(new SyncProtocolError('unavailable',status),true,3),'server_unavailable');
  }
  assert.equal(syncFailureStatus(new SyncProtocolError('login',401),true,1),'auth_required');
  assert.equal(syncFailureStatus(new SyncProtocolError('disabled',403),true,1),'access_denied');
  for(const status of [400,409,426])assert.equal(syncFailureStatus(new SyncProtocolError('blocked',status),true,1),'error');
});

test('one failed read retries with jitter and recovers without a conflict',async()=>{
  const cloud=server(remote({text:'cloud'})),d=device(cloud);let calls=0;
  d.environment.wait=async ms=>{assert.ok(ms>=500&&ms<1000);};
  d.environment.request=async(url,init)=>++calls===1?Response.json({ok:false,error:{code:'TIMEOUT'}},{status:503}):cloud.request(url,init);
  await d.engine.synchronize();assert.deepEqual(d.value,{text:'cloud'});assert.equal((await d.store.getConflicts()).length,0);
});

test('a timeout while reading the response body retries, but cancellation never retries',async()=>{
  const cloud=server(remote({text:'cloud'})),d=device(cloud);let calls=0;
  d.environment.wait=async()=>{};
  d.environment.request=async(url,init)=>{
    if(++calls===1)return new Response(new ReadableStream({start(controller){controller.error(new DOMException('body timeout','TimeoutError'));}}));
    return cloud.request(url,init);
  };
  await d.engine.pull();assert.deepEqual(d.value,{text:'cloud'});
  let cancelled=false;calls=0;d.environment.cancelled=()=>cancelled;
  d.environment.request=async()=>{calls++;cancelled=true;throw new DOMException('cancelled','AbortError');};
  await assert.rejects(d.engine.synchronize(),error=>error instanceof DOMException&&error.name==='AbortError');assert.equal(calls,1);
});

test('failed manifest does not block durable uploads or falsely report successful sync',async()=>{
  const cloud=server(),d=device(cloud);d.set({text:'local'});d.environment.wait=async()=>{};
  d.environment.request=async(url,init)=>url.includes('/v3')?Response.json({ok:false},{status:503}):cloud.request(url,init);
  await assert.rejects(d.engine.synchronize(),error=>error instanceof SyncProtocolError&&error.status===503);
  assert.deepEqual(cloud.cloud!.value,{text:'local'});assert.equal((await d.store.getOutbox()).length,0);
});

test('auth failure is neither retried nor followed by an upload',async()=>{
  const cloud=server(),d=device(cloud);d.set({text:'pending'});let calls=0;
  d.environment.request=async()=>{calls++;return Response.json({ok:false},{status:401});};
  await assert.rejects(d.engine.synchronize(),error=>error instanceof SyncProtocolError&&error.status===401);
  assert.equal(calls,1);assert.equal(cloud.writes,0);
});

test('one timed-out record preserves other downloads and retries only the missing record next cycle',async()=>{
  const cloud=server(),d=device(cloud);d.environment.wait=async()=>{};
  const rows=[{...remote({text:'healthy'}),key:'jackyun_a'},{...remote({text:'retry'}),key:'jackyun_b'}];
  let failed=true;const reads=new Map<string,number>();
  d.environment.request=async url=>{
    if(url.includes('/v3'))return Response.json({ok:true,syncProtocol:3,records:rows,next:null});
    const requested=new URL(url,'https://test').searchParams.get('key')!;
    reads.set(requested,(reads.get(requested)??0)+1);
    if(requested==='jackyun_b'&&failed)throw new DOMException('timeout','TimeoutError');
    return Response.json({ok:true,records:[rows.find(r=>r.key===requested)]});
  };
  await assert.rejects(d.engine.pull(),/timeout/);
  assert.deepEqual(JSON.parse(d.values.get('jackyun_a')!),{text:'healthy'});
  assert.equal((await d.store.getMetadata()).length,1);failed=false;
  await d.engine.pull();assert.equal(reads.get('jackyun_a'),1);assert.equal(reads.get('jackyun_b'),3);
});

test('failed chunk resumes in the same tab; a new revision discards cached fragments',async()=>{
  for(const changeRevision of [false,true]) {
    const cloud=server(),d=device(cloud);d.environment.wait=async()=>{};
    let value={text:'中文📚'.repeat(40000)},row=remote(value,1),parts=splitSyncBody(JSON.stringify(value));
    const reads=new Map<string,number>();let failed=true;
    d.environment.request=async url=>{
      if(url.includes('/v3'))return Response.json({ok:true,syncProtocol:3,records:[row],next:null});
      if(!url.includes('/large'))return Response.json({ok:true,records:[{...row,value:null,large:true}]});
      const part=Number(new URL(url,'https://test').searchParams.get('part')),id=`${row.revision}:${part}`;
      reads.set(id,(reads.get(id)??0)+1);
      if(part===1&&failed)throw new DOMException('timeout','TimeoutError');
      return Response.json({ok:true,revision:row.revision,part,count:parts.length,data:parts[part]});
    };
    await assert.rejects(d.engine.pull(),/timeout/);assert.equal(d.value,undefined);
    assert.equal((await d.store.getMetadata()).length,0);failed=false;
    if(changeRevision){value={text:'新内容📚'.repeat(40000)};row=remote(value,2);parts=splitSyncBody(JSON.stringify(value));}
    await d.engine.pull();assert.deepEqual(d.value,value);
    assert.equal(reads.get('1:0'),1);
    assert.equal(reads.get(changeRevision?'2:0':'1:1'),changeRevision?1:3);
    if(!changeRevision)assert.equal(reads.get('1:2'),1);
  }
});

test('nested record/chunk downloads share four request slots',async()=>{
  const cloud=server(),d=device(cloud),value={text:'x'.repeat(180000)},parts=splitSyncBody(JSON.stringify(value));
  const rows=Array.from({length:4},(_,i)=>({...remote(value),key:`jackyun_chunk_${i}`}));
  let active=0,maximum=0;
  d.environment.request=async url=>{
    active++;maximum=Math.max(maximum,active);
    await new Promise(resolve=>setTimeout(resolve,2));active--;
    if(url.includes('/v3'))return Response.json({ok:true,syncProtocol:3,records:rows,next:null});
    const parsed=new URL(url,'https://test'),requested=parsed.searchParams.get('key'),row=rows.find(r=>r.key===requested)!;
    if(!url.includes('/large'))return Response.json({ok:true,records:[{...row,value:null,large:true}]});
    const part=Number(parsed.searchParams.get('part'));
    return Response.json({ok:true,revision:row.revision,part,count:parts.length,data:parts[part]});
  };
  await d.engine.pull();assert.equal(maximum,4);assert.equal((await d.store.getMetadata()).length,4);
});

test('independent Chinese and emoji text edits merge on both devices while overlaps remain conflicts',async()=>{
  const base='第一段：原文📚\n第二段：原文\n第三段：原文',a=base.replace('第一段：原文','第一段：改好'),b=base.replace('第三段：原文','第三段：补充');
  const expected=base.replace('第一段：原文','第一段：改好').replace('第三段：原文','第三段：补充');
  assert.deepEqual(threeWayMerge(base,a,b),{merged:expected,conflicts:[]});
  assert.deepEqual(threeWayMerge(base,b,a),threeWayMerge(base,a,b));
  assert.ok(threeWayMerge(base,a,base.replace('第一段：原文','第一段：别的')).conflicts.length);
  assert.ok(threeWayMerge('abc','aXbc','aYbc').conflicts.length);
  assert.ok(threeWayMerge('abc123','Xbc123','abc12Y').conflicts.length);
  const original=remote({text:base}),cloud=server(original),left=device(cloud,original),right=device(cloud,original);
  left.set({text:a});right.set({text:b});await left.engine.synchronize();await right.engine.synchronize();await left.engine.synchronize();
  assert.deepEqual(left.value,{text:expected});assert.deepEqual(left.value,right.value);
  assert.equal((await right.store.getConflicts()).length,0);assert.equal(cloud.cloud!.contentHash,checksum({text:expected}));
});

test('background transport suppresses premature global errors while explicit transport reports them',async()=>{
  const originalFetch=globalThis.fetch,originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  const events:string[]=[];Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:(event:Event)=>events.push(event.type)}});
  globalThis.fetch=async()=>Response.json({ok:false},{status:503});
  try {
    await fetchSyncWithTimeout('https://test',undefined,false);assert.deepEqual(events,[]);
    await fetchSyncWithTimeout('https://test');assert.deepEqual(events,['jackyun-service-error']);
  } finally {
    globalThis.fetch=originalFetch;
    if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else Reflect.deleteProperty(globalThis,'window');
  }
});
