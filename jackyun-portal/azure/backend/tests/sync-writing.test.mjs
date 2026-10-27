import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash,randomUUID} from 'node:crypto';
import {handleSyncV5} from '../sync-v5.mjs';
import {canonicalJson} from '../../../src/lib/sync/hash.ts';
import {legacyWorkspaceRecordId} from '../../../src/lib/sync/resource-model.ts';
import {WRITING_COLLECTIONS,writingItemKey} from '../../../src/lib/sync/writing-resource-model.ts';

const hash=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
function migrationFixture(source,existing=[]){
  const mutations=[];
  const client={async query(sql){
    if(/^\s*(?:INSERT|UPDATE|DELETE)\b/.test(sql)){mutations.push(sql);throw Error('A refused migration must not write');}
    if(sql.includes("to_regclass('public.sync_v5_records')"))return {rows:[{ready:true}]};
    if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
    if(sql==='SELECT scope FROM public.sync_v5_heads WHERE user_id=$1')return {rows:[{scope:'workspace'}]};
    if(sql.startsWith('SELECT value,deleted_at FROM public.sync_v5_records'))return {rows:[]};
    if(sql.startsWith('SELECT storage_value,deleted_at FROM public.legacy_sync_data'))return {rows:[{storage_value:source,deleted_at:null}]};
    if(sql.startsWith('SELECT record_id,revision,content_hash,value,deleted_at FROM public.sync_v5_records'))return {rows:existing};
    throw Error(`Unrecognized migration query: ${sql}`);
  }};
  return {client,mutations};
}
test('a missing writing marker cannot replace a newer independently restored record with an old aggregate',async()=>{
  const collection=WRITING_COLLECTIONS[0],old={id:'essay-a',body:'old source'},newer={...old,body:'newest protected'};
  const fixture=migrationFixture([old],[{record_id:legacyWorkspaceRecordId(writingItemKey(collection,old.id)),revision:5,content_hash:hash(newer),value:newer,deleted_at:null}]);
  await assert.rejects(handleSyncV5(fixture.client,{sub:randomUUID()},'GET',new URL(`https://sync.test/api/sync/v5/manifest?scope=workspace&field=${collection.field}`),null,['workspace']),{code:'WRITING_MIGRATION_CONFLICT'});
  assert.deepEqual(fixture.mutations,[]);
});
test('duplicate writing source identities fail closed before any migration or marker write',async()=>{
  const collection=WRITING_COLLECTIONS[0],fixture=migrationFixture([{id:'duplicate'},{id:'duplicate'}]);
  await assert.rejects(handleSyncV5(fixture.client,{sub:randomUUID()},'GET',new URL(`https://sync.test/api/sync/v5/manifest?scope=workspace&field=${collection.field}`),null,['workspace']),{code:'WRITING_COLLECTION_CORRUPT'});
  assert.deepEqual(fixture.mutations,[]);
});
test('an oversized source essay cannot bypass the v5 per-record limit during bootstrap',async()=>{
  const collection=WRITING_COLLECTIONS[0],fixture=migrationFixture([{id:'large-essay',body:'x'.repeat(900_001)}]);
  await assert.rejects(handleSyncV5(fixture.client,{sub:randomUUID()},'GET',new URL(`https://sync.test/api/sync/v5/manifest?scope=workspace&field=${collection.field}`),null,['workspace']),{code:'WRITING_ITEM_TOO_LARGE'});
  assert.deepEqual(fixture.mutations,[]);
});
