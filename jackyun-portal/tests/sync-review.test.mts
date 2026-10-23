import assert from 'node:assert/strict';
import test from 'node:test';
import {device,server,remote,key} from './sync-engine-fixture.mts';
import {compareSyncValues,comparisonTextParts,chooseComparisonValue,defaultMerge,parseMergeImport,readComparisonLocal} from '../src/lib/sync/comparison.ts';

async function conflicted() {
  const base=remote({cues:[{id:'a',text:'base'}]}),cloud=server(base),d=device(cloud,base);
  d.set({cues:[{id:'a',text:'local'}]});cloud.cloud=remote({cues:[{id:'a',text:'cloud'},{id:'r',text:'remote only'}]},2);
  await d.engine.pull();return {cloud,d,conflict:(await d.store.getConflicts())[0]};
}
test('unchanged persisted conflicts do not redownload any full content during 20 polls',async()=>{
  const {cloud,d}=await conflicted();let full=0;
  d.environment.request=async(url,init)=>{if(!url.includes('/v3'))full++;return cloud.request(url,init);};
  for(let n=0;n<20;n++)await d.engine.synchronize();
  assert.equal(full,0);assert.equal((await d.store.getConflicts()).length,1);assert.equal(cloud.writes,0);
});
test('resolving local differences checks only metadata, then uploads a delta',async()=>{
  const {cloud,d,conflict}=await conflicted();let full=0;
  d.environment.request=async(url,init)=>{if((!init?.method||init.method==='GET')&&!url.includes('/v3'))full++;return cloud.request(url,init);};
  await d.engine.resolve(conflict.operationId,'local');await d.engine.flush();
  assert.equal(full,0);assert.deepEqual(cloud.cloud!.value,{cues:[{id:'a',text:'local'},{id:'r',text:'remote only'}]});
});
test('new local edits in a blocked record refresh the review without downloading the same cloud copy',async()=>{
  const {cloud,d}=await conflicted();let full=0;
  d.environment.request=async(url,init)=>{if(!url.includes('/v3'))full++;return cloud.request(url,init);};
  d.set({cues:[{id:'a',text:'newest local'}]});await d.engine.pull();
  assert.equal(full,0);assert.deepEqual((await d.store.getConflicts())[0].localValue,d.value);
});
test('an explicitly reviewed latest local value can become the exact merged result',async()=>{
  const {cloud,d,conflict}=await conflicted();
  const value={cues:[{id:'a',text:'reviewed latest local'},{id:'new',text:'new local'}]};d.set(value);
  await d.engine.resolve(conflict.operationId,'merged',{expectedLocal:d.values.get(key)!,remoteRevision:conflict.remoteRevision,remoteHash:conflict.remoteHash,value,deleted:false});
  await d.engine.flush();assert.deepEqual(cloud.cloud!.value,value);assert.equal((await d.store.getOutbox()).length,0);
  assert.ok(d.backups>0);
});
test('cloud changes refresh both copies and reject stale imported results before any upload',async()=>{
  const {cloud,d,conflict}=await conflicted();const local=d.value;
  cloud.cloud=remote({cues:[{id:'a',text:'new cloud'}]},3);
  await assert.rejects(d.engine.resolve(conflict.operationId,'merged',{expectedLocal:d.values.get(key)!,remoteRevision:2,remoteHash:conflict.remoteHash,value:{cues:[]},deleted:false}),error=>error instanceof Error&&error.name==='SyncReviewChangedError');
  assert.deepEqual(d.value,local);assert.equal(cloud.writes,0);assert.equal((await d.store.getConflicts())[0].remoteRevision,3);
});
test('an edit made while checking metadata is preserved and requires refreshed review',async()=>{
  const {cloud,d,conflict}=await conflicted();const expectedLocal=d.values.get(key)!;
  d.environment.request=async(url,init)=>{if(url.includes('/v3'))d.set({cues:[{id:'a',text:'typed during check'}]});return cloud.request(url,init);};
  await assert.rejects(d.engine.resolve(conflict.operationId,'merged',{expectedLocal,remoteRevision:2,remoteHash:conflict.remoteHash,value:{cues:[{id:'a',text:'draft'}]},deleted:false}),error=>error instanceof Error&&error.name==='SyncReviewChangedError');
  assert.equal(cloud.writes,0);assert.deepEqual(d.value,{cues:[{id:'a',text:'typed during check'}]});
});
test('review changes are still rejected when the local backup fails or changes during backup',async()=>{
  const {d,conflict}=await conflicted();d.failBackup=true;
  await assert.rejects(d.engine.resolve(conflict.operationId,'local'),/backup failed/);
  assert.equal((await d.store.getConflicts()).length,1);
  d.failBackup=false;d.environment.backup=async()=>d.set({cues:[{id:'a',text:'new edit during backup'}]});
  await assert.rejects(d.engine.resolve(conflict.operationId,'local'),error=>error instanceof Error&&error.name==='SyncReviewChangedError');
  assert.deepEqual(d.value,{cues:[{id:'a',text:'new edit during backup'}]});
});
test('long text comparison keeps the actual changed passage visible',()=>{
  const prefix='共同内容'.repeat(2000),result=comparisonTextParts(prefix+'本机答案\n结尾',prefix+'云端答案\n结尾');
  assert.equal(result.change,'本机');assert.ok(result.before.length<=101);assert.equal(result.after,'答案\n结尾');
  const base='第一段：原文\n第二段：原文\n第三段：原文';
  assert.equal(compareSyncValues(base,base.replace('第一段：原文','第一段：本机'),base.replace('第三段：原文','第三段：云端')).rows[0].conflict,false);
});
test('comparison matches ID records and preserves remote additions when selecting a field',async()=>{
  const {d,conflict}=await conflicted(),local=d.value;
  const {rows,truncated}=compareSyncValues(conflict.baseValue,local,conflict.remoteValue);
  const field=rows.find(row=>row.conflict)!;assert.ok(field.label.includes('CUE'));assert.ok(field.label.includes('内容'));assert.equal(truncated,false);
  const chosen=chooseComparisonValue(defaultMerge(conflict,local),field.path,field.remote);
  assert.deepEqual(chosen,conflict.remoteValue);assert.deepEqual(local,{cues:[{id:'a',text:'local'}]});
});
test('selecting a deletion removes the record without modifying the source or resurrecting it',()=>{
  const input={cues:[{id:'a',text:'A'},{id:'b',text:'B'}]};
  assert.deepEqual(chooseComparisonValue(input,['cues',{id:'a'}],undefined),{cues:[{id:'b',text:'B'}]});
  assert.equal(input.cues.length,2);assert.equal(readComparisonLocal(null),undefined);assert.equal(readComparisonLocal('null'),null);
});
test('imports accept raw JSON or a matching export and reject wrong-key or ambiguous backups',()=>{
  assert.deepEqual(parseMergeImport('{"cues":[]}',key),{value:{cues:[]},deleted:false});
  assert.deepEqual(parseMergeImport(JSON.stringify({format:'jackyun-sync-merge-v1',key,value:null,deleted:false}),key),{value:null,deleted:false});
  assert.throws(()=>parseMergeImport(JSON.stringify({format:'jackyun-sync-merge-v1',key:'other',value:{},deleted:false}),key),/其他/);
  assert.throws(()=>parseMergeImport(JSON.stringify({localValue:{},remoteValue:{}}),key),/两份内容/);
  assert.throws(()=>parseMergeImport('{bad',key),/有效/);
});
test('comparison output is bounded and prototype-like field names remain inert',()=>{
  const local=Object.fromEntries(Array.from({length:240},(_,i)=>[`field${i}`,i]));
  const compared=compareSyncValues({},local,{});assert.equal(compared.rows.length,200);assert.equal(compared.truncated,true);
  const chosen=chooseComparisonValue({},['__proto__','polluted'],true);
  assert.equal(({} as {polluted?:boolean}).polluted,undefined);assert.deepEqual(JSON.parse(JSON.stringify(chosen)),JSON.parse('{"__proto__":{"polluted":true}}'));
});
