type Page={cues:Array<{id:string;text?:string}>};
import assert from 'node:assert/strict';
import test from 'node:test';
import {device,key,remote,server} from './sync-engine-fixture.mts';
import {createRecordDelta,applyRecordDelta} from '../src/lib/sync/delta.ts';
import {threeWayMerge} from '../src/lib/sync/merge.ts';

test('concurrent field edits preserve insertion anchors on either device',()=>{
 const base=[{id:'a',x:0},{id:'b',x:0}];
 for(const inserted of [[{id:'x',x:0},...base],[base[0],{id:'x',x:0},base[1]],[...base,{id:'x',x:0}]]) {
  const edited=[base[0],{...base[1],x:1}];
  for(const [local,remote] of [[inserted,edited],[edited,inserted]]) {
   const result=threeWayMerge(base,local,remote);
   assert.deepEqual((result.merged as typeof base).map(row=>row.id),inserted.map(row=>row.id));
   assert.equal((result.merged as typeof base).find(row=>row.id==='b')?.x,1);assert.deepEqual(result.conflicts,[]);
  }
 }
});
import {persistLocalEdit,createLocalEditWriter,parseLocalValue,LOCAL_CONFLICT_PREFIX,LocalEditConflict} from '../src/lib/sync/local-edit.ts';

test('stale device with year 2999 clock retains additions on both devices',async()=>{
  const base=remote({cues:[{id:'a',text:'base'}]}),cloud=server(base),a=device(cloud,base),b=device(cloud,base);
  a.set({cues:[{id:'a',text:'base'},{id:'new-a',text:'A'}]});await a.engine.flush();
  b.set({cues:[{id:'a',text:'base'},{id:'new-b',text:'B'}]});await b.engine.pull();await b.engine.flush();await a.engine.pull();
  assert.deepEqual(new Set((a.value as Page).cues.map(r=>r.id)),new Set(['a','new-a','new-b']));
  assert.deepEqual(a.value,b.value);assert.equal((await b.store.getOutbox()).length,0);
});
test('same field changes persist both copies across restart and stop automatic writes',async()=>{
  const base=remote({cues:[{id:'a',text:'base'}]}),cloud=server(base),d=device(cloud,base);
  d.set({cues:[{id:'a',text:'local'}]});cloud.cloud=remote({cues:[{id:'a',text:'remote'},{id:'b',text:'unique'}]},2);
  await d.engine.pull();const conflicts=await d.store.getConflicts();assert.equal(conflicts.length,1);
  assert.equal((d.value as Page).cues[0].text,'local');await d.restart().flush();assert.equal(cloud.writes,0);
  assert.equal((conflicts[0].remoteValue as Page).cues[0].text,'remote');
  await d.engine.resolve(conflicts[0].operationId,'local');await d.engine.flush();
  assert.deepEqual((cloud.cloud!.value as Page).cues,[{id:'a',text:'local'},{id:'b',text:'unique'}]);assert.ok(d.backups>0);
});
test('resolve rechecks a newer cloud version and refuses to overwrite it',async()=>{
  const base=remote({cues:[{id:'a',text:'base'}]}),cloud=server(base),d=device(cloud,base);
  d.set({cues:[{id:'a',text:'local'}]});cloud.cloud=remote({cues:[{id:'a',text:'remote'}]},2);await d.engine.pull();
  const conflict=(await d.store.getConflicts())[0];cloud.cloud=remote({cues:[{id:'a',text:'newer'}]},3);
  await assert.rejects(d.engine.resolve(conflict.operationId,'local'),/又有变化/);assert.equal(cloud.writes,0);assert.equal((d.value as Page).cues[0].text,'local');
});
test('delete versus edit conflicts without resurrecting or deleting silently',async()=>{
  const base=remote({cues:[{id:'a',text:'base'}]}),cloud=server(base),d=device(cloud,base);
  d.set({cues:[]});cloud.cloud=remote({cues:[{id:'a',text:'edited'}]},2);await d.engine.pull();await d.engine.flush();
  assert.equal((await d.store.getConflicts()).length,1);assert.deepEqual(d.value,{cues:[]});assert.equal(cloud.writes,0);
});
test('lost post-commit response is retried with immutable operation ID once',async()=>{
  const cloud=server(),d=device(cloud);d.set({cues:[{id:'a',text:'new'}]});cloud.loseNextReply();
  await assert.rejects(d.engine.flush(),/response lost/);const id=(await d.store.getOutbox())[0].id;
  await d.restart().flush();assert.equal(cloud.writes,1);assert.equal((await d.store.getOutbox()).length,0);assert.ok(id);
});
test('edit after lost commit gets a new operation ID and is safely reconciled',async()=>{
  const base=remote({cues:[{id:'a',text:'base'}]}),cloud=server(base),d=device(cloud,base);d.set({cues:[{id:'a',text:'first'}]});cloud.loseNextReply();
  await assert.rejects(d.engine.flush());const id=(await d.store.getOutbox())[0].id;d.set({cues:[{id:'a',text:'second'}]});await d.engine.capture();assert.notEqual((await d.store.getOutbox())[0].id,id);
  await d.engine.pull();assert.equal((await d.store.getConflicts()).length,1);assert.equal((d.value as Page).cues[0].text,'second');
});
test('backup failure prevents cloud replacement and keeps the old local value',async()=>{
  const base=remote({cues:[{id:'a',text:'old'}]}),cloud=server(base),d=device(cloud,base);cloud.cloud=remote({cues:[{id:'a',text:'new'}]},2);d.failBackup=true;
  await assert.rejects(d.engine.pull(),/backup failed/);assert.deepEqual(d.value,base.value);
});
test('metadata without startup data rehydrates instead of uploading a deletion',async()=>{
  const row=remote({cues:[{id:'a'}]}),cloud=server(row),d=device(cloud,row);d.values.delete(key);const restarted=d.restart();
  await restarted.capture();assert.equal((await d.store.getOutbox()).length,0);await restarted.pull();assert.deepEqual(d.value,row.value);
});
test('unchanged full records are downloaded and notified only once for 100 pulls',async()=>{
  const row=remote({cues:[{id:'a',text:'学习'.repeat(10000)}]}),cloud=server(row),d=device(cloud);
  for(let i=0;i<100;i++)await d.engine.pull();assert.equal(cloud.calls,101);assert.equal(d.changes,1);assert.equal(cloud.writes,0);
});
test('JSON null is distinct from a tombstone when recreating deleted state',async()=>{
  const deleted=remote(null,2,true),cloud=server(deleted),d=device(cloud,deleted);d.set(null);await d.engine.flush();assert.equal(cloud.cloud!.deleted,false);assert.equal(cloud.cloud!.value,null);
});
test('delta addresses IDs, handles deletion/reordering and blocks prototype pollution',()=>{
  const base={rows:[{id:'a',text:'a'},{id:'b',text:'b'}]},next={rows:[{id:'b',text:'edited'},{id:'c',text:'new'}]};
  const patch=createRecordDelta(base,next);assert.deepEqual(applyRecordDelta(base,patch),next);assert.equal(JSON.stringify(patch).includes('"id":"b"'),true);
  const dangerous=JSON.parse('{"__proto__":{"polluted":true}}');assert.deepEqual(applyRecordDelta({},createRecordDelta({},dangerous)),dangerous);assert.equal(({} as {polluted?:boolean}).polluted,undefined);
  assert.throws(()=>applyRecordDelta(base,[{kind:'set',path:['rows',{id:'a'}],value:{id:'wrong'}}]));
  assert.throws(()=>applyRecordDelta(base,[{kind:'order',path:['rows'],ids:['a','a']}]));
});
test('independent field edits preserve a single-side reorder and reject conflicting orders',()=>{
  const base=[{id:'a',x:0},{id:'b',x:0},{id:'c',x:0}],local=[base[1],base[0],base[2]],remote=[{...base[0],x:1},base[1],base[2]];
  const merged=threeWayMerge(base,local,remote);assert.deepEqual((merged.merged as Array<{id:string}>).map(r=>r.id),['b','a','c']);assert.deepEqual(merged.conflicts,[]);
  assert.ok(threeWayMerge(base,local,[base[2],base[1],{...base[0],x:1}]).conflicts.includes('$.$order'));
});
test('stale React snapshot cannot erase another tab additions and conflicting drafts remain downloadable',async()=>{
  const values=new Map<string,string>(),storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
  const base={cues:[{id:'a',text:'base'}]},current={cues:[...base.cues,{id:'b',text:'new'}]};storage.setItem(key,JSON.stringify(current));
  await persistLocalEdit(storage,key,base,base);assert.deepEqual(parseLocalValue(storage.getItem(key)),current);
  storage.setItem(key,JSON.stringify({cues:[{id:'a',text:'other'}]}));
  await assert.rejects(persistLocalEdit(storage,key,base,{cues:[{id:'a',text:'local'}]}),LocalEditConflict);
  assert.ok(storage.getItem(LOCAL_CONFLICT_PREFIX+key));assert.equal((parseLocalValue(storage.getItem(key)) as Page).cues[0].text,'other');
});

test('failed startup metadata read is retried without forgetting initial local intent',async()=>{
 const cloud=remote({cues:[{id:'a',text:'base'}]}),backend=server(cloud),d=device(backend,cloud);d.set({cues:[{id:'a',text:'local'}]});const retry=d.restart();
 const original=d.store.getMetadata;let first=true;d.store.getMetadata=async()=>{if(first){first=false;throw Error('IDB read failed');}return original();};
 await assert.rejects(retry.capture(),/IDB/);await retry.capture();assert.equal((await d.store.getOutbox()).length,1);
});
test('a failed local application preserves the pending operation and its baseline',async()=>{
 const base=remote({a:1}),backend=server(base),d=device(backend,base);d.set({a:2});await d.engine.capture();backend.cloud=remote({a:1,b:3},2);
 d.environment.write=()=>{throw Error('storage full');};await assert.rejects(d.engine.pull(),/storage full/);
 assert.equal((await d.store.getOutbox()).length,1);assert.equal((await d.store.getMetadata())[0].revision,1);assert.deepEqual(d.value,{a:2});
});
test('remote conflict choice cannot discard intent when local storage rejects the write',async()=>{
 const base=remote({a:1}),backend=server(base),d=device(backend,base);d.set({a:2});await d.engine.capture();backend.cloud=remote({a:3},2);await d.engine.pull();
 const conflict=(await d.store.getConflicts())[0];d.environment.write=()=>{throw Error('storage full');};await assert.rejects(d.engine.resolve(conflict.operationId,'remote'),/storage full/);
 assert.equal((await d.store.getOutbox()).length,1);assert.equal((await d.store.getConflicts()).length,1);assert.deepEqual(d.value,{a:2});
});


test('queued same-tab edits retain latest text and remote-only fields after a held lock',async()=>{
  const base={text:'B',other:0};let raw=JSON.stringify({...base,other:1});let release!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;});
  const writer=createLocalEditWriter({getItem:()=>raw,setItem:(_key,value)=>{raw=value;}},key,async(_name,work)=>{await held;return work();});
  const a=writer.write(base,{...base,text:'A'}),ab=writer.write(base,{...base,text:'AB'});release();await a;await ab;
  assert.deepEqual(JSON.parse(raw),{text:'AB',other:1});
});
test('accepting remote conflict sends an acknowledged resolution operation to the server',async()=>{
  const base=remote({a:1}),backend=server(base),d=device(backend,base);d.set({a:2});await d.engine.capture();backend.cloud=remote({a:3},2);await d.engine.pull();
  const conflict=(await d.store.getConflicts())[0],sent:Array<{resolvesOperationId?:string}>=[];const request=d.environment.request;
  d.environment.request=async(url,init)=>{if(init?.method==='POST')sent.push(...JSON.parse(String(init.body)).operations);return request(url,init);};
  await d.engine.resolve(conflict.operationId,'remote');assert.equal((await d.store.getOutbox()).length,1);await d.engine.flush();
  assert.equal(sent[0].resolvesOperationId,conflict.operationId);assert.equal((await d.store.getOutbox()).length,0);assert.deepEqual(d.value,{a:3});
});
