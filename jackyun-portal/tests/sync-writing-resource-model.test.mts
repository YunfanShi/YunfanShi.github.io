import assert from 'node:assert/strict';
import test from 'node:test';
import {WRITING_COLLECTIONS,writingItemKey,writingCollectionForKey,writingMarkerKey,splitWritingCollection,replaceWritingCollectionItem} from '../src/lib/sync/writing-resource-model.ts';
import {legacyWorkspaceRecordId,legacyWorkspaceKeyFromRecordId,legacyWorkspaceFieldForKey,workspaceStorageToResources} from '../src/lib/sync/resource-model.ts';
import {readFileSync} from 'node:fs';
import {isSyncableStorageKey} from '../src/lib/local-workspace.ts';

test('writing collections use independent stable identities and preserve unknown item fields',()=>{
  for(const collection of WRITING_COLLECTIONS){
    const original=[{[collection.idField]:'essay-a',body:'first',unknown:{preserved:true}},{[collection.idField]:'essay-b',body:'second'}];
    const parts=splitWritingCollection(collection,original);
    assert.deepEqual(parts.map(row=>row.value),original);
    for(const part of parts){
      assert.equal(legacyWorkspaceFieldForKey(part.key),collection.field);
      assert.equal(legacyWorkspaceKeyFromRecordId(legacyWorkspaceRecordId(part.key)!),part.key);
      assert.equal(writingCollectionForKey(part.key),collection);
    }
    const changed=replaceWritingCollectionItem(collection,original,parts[0].key,{...original[0],body:'edited'},false);
    assert.deepEqual(changed[1],original[1]);
    assert.deepEqual(changed[0].unknown,{preserved:true});
    assert.deepEqual(replaceWritingCollectionItem(collection,changed,parts[0].key,null,true),[original[1]]);
    const marker=writingMarkerKey(collection);
    assert.equal(legacyWorkspaceKeyFromRecordId(legacyWorkspaceRecordId(marker)!),marker);
    for(const id of ['Biology','essay-auth-log-secret',crypto.randomUUID(),'x'.repeat(64)]){
      const key=writingItemKey(collection,id);
      assert.equal(legacyWorkspaceKeyFromRecordId(legacyWorkspaceRecordId(key)!),key);
      assert.ok(legacyWorkspaceRecordId(key)!.length<=240);
      assert.equal(isSyncableStorageKey(key),true);
    }
    assert.equal(isSyncableStorageKey('arbitrary_unrecognized_'+ 'x'.repeat(130)),false);
    assert.equal(isSyncableStorageKey(`${collection.prefix}not-canonical-hex`),false);
  }
});
test('writing partitioning rejects malformed, duplicate and mismatched IDs without silently dropping rows',()=>{
  for(const collection of WRITING_COLLECTIONS){
    assert.throws(()=>splitWritingCollection(collection,{}));
    assert.throws(()=>splitWritingCollection(collection,[{}]));
    assert.throws(()=>splitWritingCollection(collection,[{[collection.idField]:'a'},{[collection.idField]:'a'}]));
    assert.throws(()=>writingItemKey(collection,'../../unsafe'));
    assert.throws(()=>replaceWritingCollectionItem(collection,[],writingItemKey(collection,'a'),{[collection.idField]:'b'},false));
    assert.throws(()=>splitWritingCollection(collection,Array.from({length:collection.limit+1},(_,index)=>({[collection.idField]:String(index)}))));
  }
});
test('active editor arrays fan out once to writing records and skip mirrors and item cache rows',()=>{
  const collection=WRITING_COLLECTIONS[0],value=[{id:'essay-a',draft:{essay:'one'}},{id:'essay-b',draft:{essay:'two'}}];
  const resources=workspaceStorageToResources([
    {key:collection.legacyKey,value:JSON.stringify(value),writingProjection:true},
    {key:'jackyun_ielts_writing_workspaces_mirror_v1',value:JSON.stringify(value),writingProjection:true},
    {key:'jackyun_ielts_writing_draft_v1',value:JSON.stringify({essay:'device draft'}),writingProjection:true},
    {key:writingItemKey(collection,'essay-a'),value:JSON.stringify({id:'essay-a',draft:{essay:'stale cache'}})},
  ]);
  assert.equal(legacyWorkspaceFieldForKey(collection.legacyKey),collection.field);
  assert.deepEqual(resources.map(row=>row.itemId).sort(),['essay-a','essay-b']);
  assert.deepEqual(resources.map(row=>row.value),value);
});
test('all Azure packaging paths include the shared writing model dependency',()=>{
  assert.match(readFileSync(new URL('../scripts/build-azure-functions.mjs',import.meta.url),'utf8'),/src\/lib\/sync\/writing-resource-model\.ts/);
  assert.match(readFileSync(new URL('../azure/backend/Dockerfile',import.meta.url),'utf8'),/src\/lib\/sync\/writing-resource-model\.ts/);
});
