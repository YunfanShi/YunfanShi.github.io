import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {handleSyncV5,syncV5Rollout} from '../sync-v5.mjs';
import {canonicalJson} from '../../../src/lib/sync/hash.ts';

const identity={sub:randomUUID()},url=(path,query='')=>new URL(`https://sync.test/api/sync/v5${path}${query}`);
function database(){
  const records=new Map(),receipts=new Map(),heads=new Map(),changes=[];let writes=0;
  return {records,receipts,heads,changes,get writes(){return writes;},async query(sql,params=[]){
    if(sql.includes("to_regclass('public.sync_v5_records')"))return {rows:[{ready:true}]};
    if(sql.includes('count(*)::integer AS count FROM public.sync_v5_receipts'))return {rows:[{count:0}]};
    if(sql.startsWith('SELECT storage_value,revision,content_hash,deleted_at,updated_at FROM public.legacy_sync_data'))return {rows:[]};
    if(sql.startsWith('SELECT revision,content_hash,updated_at FROM public.sync_v5_projection_heads'))return {rows:[]};
    if(sql.startsWith('SELECT scope,record_id,value,deleted_at FROM public.sync_v5_records'))return {rows:[...records.values()]};
    if(sql.startsWith('INSERT INTO public.legacy_sync_data'))return {rows:[]};
    if(sql.startsWith('INSERT INTO public.sync_v5_projection_heads'))return {rows:[]};
    if(sql.startsWith('INSERT INTO public.sync_change_heads'))return {rows:[{sequence:1}]};
    if(sql.startsWith('INSERT INTO public.sync_change_log'))return {rows:[]};
    if(sql.startsWith('WITH removed AS'))return {rows:[]};
    if(sql.includes('FROM public.web_sync_devices'))return {rows:[]};
    if(sql.includes('FROM public.sync_v5_receipts')){
      const [user,scope,ids]=params;
      return {rows:[...receipts.values()].filter(row=>row.user_id===user&&row.scope===scope&&ids.includes(row.operation_id))};
    }
    if(sql.includes('FROM public.sync_v5_records')&&sql.includes('FOR UPDATE')){
      return {rows:records.has(params[2])?[records.get(params[2])]:[]};
    }
    if(sql.startsWith('INSERT INTO public.sync_v5_records')){
      const [user_id,scope,record_id,revision,content_hash,value,deleted]=params,now=new Date().toISOString();
      const row={user_id,scope,record_id,revision,content_hash,value:JSON.parse(value),deleted_at:deleted?now:null,updated_at:now};
      records.set(record_id,row);writes++;return {rows:[row]};
    }
    if(sql.startsWith('INSERT INTO public.sync_v5_heads')){
      const [user,scope]=params,key=`${user}:${scope}`,sequence=(heads.get(key)??0)+1;heads.set(key,sequence);return {rows:[{sequence}]};
    }
    if(sql.startsWith('INSERT INTO public.sync_v5_changes')){
      changes.push({user_id:params[0],scope:params[1],sequence:params[2],record_id:params[3]});return {rows:[]};
    }
    if(sql.startsWith('INSERT INTO public.sync_v5_receipts')){
      const [user_id,scope,operation_id,request_hash,result]=params;
      receipts.set(`${user_id}:${scope}:${operation_id}`,{user_id,scope,operation_id,request_hash,result:JSON.parse(result)});return {rows:[]};
    }
    if(sql.startsWith('SELECT sequence FROM public.sync_v5_heads')){
      return {rows:[{sequence:heads.get(`${params[0]}:${params[1]}`)??0}]};
    }
    throw new Error(`Unexpected SQL: ${sql.slice(0,100)}`);
  }};
}
const hash=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');

test('v5 stays disabled without an explicit account rollout',()=>{
  const previous=[process.env.SYNC_V5_ENABLED,process.env.SYNC_V5_USERS,process.env.SYNC_V5_SCOPES];
  delete process.env.SYNC_V5_ENABLED;delete process.env.SYNC_V5_USERS;delete process.env.SYNC_V5_SCOPES;
  try{assert.deepEqual(syncV5Rollout(identity),[]);}
  finally{[process.env.SYNC_V5_ENABLED,process.env.SYNC_V5_USERS,process.env.SYNC_V5_SCOPES]=previous;}
});

test('resource writes use CAS, idempotent receipts, and return actionable conflicts',async()=>{
  const db=database(),deviceId=randomUUID(),id=randomUUID(),value={id:'cue-1',prompt:'Recall'};
  const operation={id,scope:'cue',recordId:'cues:cue-1',baseRevision:0,baseHash:null,value,deleted:false,clientUpdatedAt:new Date().toISOString()};
  const first=await handleSyncV5(db,identity,'POST',url('/operations'),{scope:'cue',deviceId,operations:[operation]},['cue']);
  assert.equal(first.applied[0].revision,1);assert.equal(first.applied[0].contentHash,hash(value));assert.equal(db.writes,1);
  const replay=await handleSyncV5(db,identity,'POST',url('/operations'),{scope:'cue',deviceId,operations:[operation]},['cue']);
  assert.equal(replay.applied[0].operationId,id);assert.equal(db.writes,1);
  const stale={...operation,id:randomUUID(),value:{id:'cue-1',prompt:'stale'}};
  const conflict=await handleSyncV5(db,identity,'POST',url('/operations'),{scope:'cue',deviceId,operations:[stale]},['cue']);
  assert.deepEqual(conflict.conflicts[0].value,value);assert.equal(conflict.conflicts[0].revision,1);assert.equal(db.writes,1);
});

test('scope rollout is account-wide and rejects unenabled resource scopes',async()=>{
  const db=database();
  await assert.rejects(handleSyncV5(db,identity,'GET',url('/manifest','?scope=cue'),null,['learning']),{status:404,code:'SYNC_V5_SCOPE_UNAVAILABLE'});
});
