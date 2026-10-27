import assert from 'node:assert/strict';
import test from 'node:test';
import {createConflictBatch,runConflictBatch} from '../src/lib/sync/conflict-batch.ts';
import type {SyncConflict} from '../src/types/sync.ts';
import type {V5ResourceConflict} from '../src/lib/sync/outbox.ts';
const conflict={operationId:'old',key:'key',remoteRevision:8,remoteHash:'hash'} as SyncConflict;
const resource={operationId:'v5',scope:'cue',recordId:'cues:id',localValue:{id:'id'},remoteRevision:9} as V5ResourceConflict;
test('all local uses exact legacy contents, including null deletion, not automatic merge',()=>{
  const batch=createConflictBatch('batch','local',[{conflict,raw:'{"local":true}'},{conflict:{...conflict,operationId:'deleted'},raw:null}],[resource]);
  assert.equal(batch.legacy[0].choice,'merged');assert.deepEqual(batch.legacy[0].review,{expectedLocal:'{"local":true}',remoteRevision:8,remoteHash:'hash',value:{local:true},deleted:false});
  assert.equal(batch.legacy[1].review?.deleted,true);assert.equal(batch.legacy[1].review?.value,null);
  resource.localValue={id:'changed'};assert.deepEqual(batch.resources[0].conflict.localValue,{id:'id'});
});
test('all cloud retains reviewed revision/hash and never selects newly appearing conflicts',()=>{
  const batch=createConflictBatch('batch','remote',[{conflict,raw:'old'}],[]);
  assert.equal(batch.legacy[0].choice,'remote');assert.equal(batch.legacy[0].review?.expectedLocal,'old');assert.equal(batch.legacy[0].review?.remoteRevision,8);
});
test('mixed protocol batch runs sequentially without losing requests and reports partial failures',async()=>{
  const calls:string[]=[],batch=createConflictBatch('batch','remote',[{conflict,raw:'old'}],[resource]);
  const result=await runConflictBatch(batch,async request=>{calls.push(request.operationId);throw Error('review changed');},async row=>{calls.push(row.operationId);});
  assert.deepEqual(calls,['old','v5']);assert.equal(result.completed,1);assert.deepEqual(result.failures,[{operationId:'old',message:'review changed'}]);
});
