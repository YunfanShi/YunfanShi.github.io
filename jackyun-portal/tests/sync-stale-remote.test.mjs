import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { createSyncApi } from '../azure/backend/sync-api.mjs';

const user='00000000-0000-4000-8000-000000000001';
const operation={id:'00000000-0000-4000-8000-000000000002',key:'azure_backend_test_retry',baseRevision:0,baseHash:null,baseValue:null,value:{local:true},deleted:false,clientUpdatedAt:'2026-10-07T16:00:00Z'};
const body={syncProtocol:3,deviceId:'00000000-0000-4000-8000-000000000003',operations:[operation]};
const cached=status=>({status,revision:1,remoteValue:{text:'学习'.repeat(250000)},remoteDeleted:false,remoteHash:'old',remoteUpdatedAt:'2026-10-07T15:00:00Z'});
const current=(deleted=false,large=false)=>({storage_key:operation.key,storage_value:deleted||large?null:{latest:true},revision:10,content_hash:'current',deleted_at:deleted?'2026-10-07T17:00:00Z':null,updated_at:'2026-10-07T17:00:00Z',client_updated_at:'2026-10-07T17:00:00Z',large});
const identity={sub:user,session_id:body.deviceId,role:'authenticated'};

function website() {
  const output={};
  const require=name=>{
    if(name==='node:crypto')return {createHash};
    if(name==='next/server')return {NextResponse:{json:value=>Response.json(value)}};
    if(name.endsWith('/api-response'))return {apiError:(_id,_message,status,code)=>Response.json({ok:false,error:{code}},{status})};
    if(name.endsWith('/local-workspace'))return {isSyncableStorageKey:()=>true,syncValueFits:value=>JSON.stringify(value??null).length<=400000};
    if(name.endsWith('/hash'))return {canonicalJson:JSON.stringify};
    if(name.endsWith('/schedule-safety'))return {SCHEDULE_STORAGE_KEY:'schedule',unsafeScheduleReplacement:()=>false};
    if(name.endsWith('/transfer'))return {MAX_LARGE_SYNC_BYTES:24000000};
    return {};
  };
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/sync/server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:output,require,console,Response});
  return output.applySyncBody;
}
function supabase(result,row) {
  const calls=[];
  const query={select(){return this;},eq(){return this;},gte(){return this;},upsert(){return this;},update(){return this;},in(){return this;},async maybeSingle(){return {data:null,error:null};},then(resolve){return Promise.resolve({data:null,error:null,count:0}).then(resolve);}};
  return {calls,from:()=>query,async rpc(name,args){calls.push({name,args});return {data:name==='apply_web_sync_operation'?result:row?[row]:[],error:null};}};
}
function azure(result,row) {
  const calls=[];
  const database={async withUser(id,work){assert.deepEqual(id,identity);return work({async query(sql,parameters){calls.push({sql,parameters});if(sql.startsWith('SELECT storage_key,result'))return {rows:[{storage_key:operation.key,result}]};if(sql.includes('AS count'))return {rows:[{count:0}]};if(sql.includes('apply_web_sync_operation'))return {rows:[{result}]};if(sql.includes('list_web_sync_records'))return {rows:row?[row]:[]};return {rows:[]};}});}};
  return {calls,handle:createSyncApi(database)};
}

test('cached remote and conflict decisions return current small, large and deleted records on both backends',async()=>{
  for(const status of ['remote','conflict'])for(const row of [current(),current(false,true),current(true)]){
    const original=cached(status),api=supabase(original,row),backend=azure(original,row);
    const a=await (await website()(body,'request',api,user)).json();
    const b=await backend.handle('POST',new URL('https://example.com/api/sync/v2'),body,identity);
    for(const response of [a,b]){
      const record=status==='remote'?response.remote[0]:response.conflicts[0];
      assert.equal(status==='remote'?record.revision:record.remoteRevision,10);
      assert.equal(status==='remote'?record.large:record.remoteLarge,!row.deleted_at&&row.large);
      assert.equal(status==='remote'?record.deleted:record.remoteDeleted,Boolean(row.deleted_at));
      assert.deepEqual(status==='remote'?record.value:record.remoteValue,row.storage_value);
    }
    assert.equal(original.revision,1,'The stored idempotency decision is never changed');
    assert.equal(api.calls.filter(c=>c.name==='list_web_sync_records').length,1);
    assert.equal(api.calls.at(-1).args.p_cursor, null);
    assert.equal(api.calls.at(-1).args.p_storage_key, operation.key);
    assert.deepEqual(backend.calls.find(c=>c.sql.includes('list_web_sync_records')).parameters,[operation.key]);
  }
});
test('missing latest data does not acknowledge or discard the local operation',async()=>{
  const result=cached('remote'),api=supabase(result,null),backend=azure(result,null);
  const response=await website()(body,'request',api,user);
  assert.equal(response.status,500);
  assert.equal((await response.json()).error.code,'SYNC_WRITE_FAILED');
  await assert.rejects(backend.handle('POST',new URL('https://example.com/api/sync/v2'),body,identity),{status:503,code:'SYNC_REMOTE_UNAVAILABLE'});
});
test('applied retries preserve their original acknowledgment without another remote query',async()=>{
  const result={status:'applied',revision:1,contentHash:createHash('sha256').update(JSON.stringify(operation.value)).digest('hex'),updatedAt:operation.clientUpdatedAt},api=supabase(result,current()),backend=azure(result,current());
  const a=await (await website()(body,'request',api,user)).json();
  const b=await backend.handle('POST',new URL('https://example.com/api/sync/v2'),body,identity);
  assert.equal(a.applied[0].revision,1);assert.equal(b.applied[0].revision,1);
  assert.ok(!api.calls.some(c=>c.name==='list_web_sync_records'));
  assert.ok(!backend.calls.some(c=>c.sql.includes('list_web_sync_records')));
});
