import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createSyncApi} from '../sync-api.mjs';
import {readScheduleProjection} from '../sync-v5.mjs';
import {canonicalJson} from '../../../src/lib/sync/hash.ts';
import {legacyWorkspaceRecordId} from '../../../src/lib/sync/resource-model.ts';

test('v4 compatibility writes validate immutable evidence against the current v5 projection',async()=>{
  const userId=randomUUID(),deviceId=randomUUID(),operationId=randomUUID(),scheduleKey='jackyun_schedule_control_v1';
  const diagnosis={id:'diagnosis-1',originalAnswer:'immutable answer',sourceRecordId:'record-1'};
  let applied=false;
  const client={async query(sql){
    if(sql.includes("to_regclass('public.sync_change_heads')"))return {rows:[{ready:true}]};
    if(sql.includes("to_regclass('public.sync_v5_records')"))return {rows:[{ready:true}]};
    if(sql.startsWith('SELECT 1 FROM public.sync_v5_projection_heads'))return {rows:[{}]};
    if(sql.startsWith('SELECT scope FROM public.sync_v5_heads'))return {rows:[{scope:'practice'}]};
    if(sql.startsWith('SELECT storage_value,revision,content_hash,deleted_at,updated_at FROM public.legacy_sync_data'))return {rows:[{storage_value:{schemaVersion:1},revision:10,content_hash:'b'.repeat(64),deleted_at:null,updated_at:new Date().toISOString()}]};
    if(sql.startsWith('SELECT revision,content_hash,updated_at FROM public.sync_v5_projection_heads'))return {rows:[{revision:10,content_hash:'a'.repeat(64),updated_at:new Date().toISOString()}]};
    if(sql.startsWith('SELECT scope,record_id,value,deleted_at FROM public.sync_v5_records WHERE user_id=$1'))return {rows:[{scope:'practice',record_id:'examDiagnoses:$order',value:['diagnosis-1'],deleted_at:null},{scope:'practice',record_id:'examDiagnoses:diagnosis-1',value:diagnosis,deleted_at:null}]};
    if(sql.startsWith('SELECT public.prune_sync_changes()'))return {rows:[]};
    if(sql.includes('apply_web_sync_operation')){applied=true;return {rows:[{result:{status:'applied',revision:11}}]};}
    throw new Error(`Unexpected SQL: ${sql}`);
  }};
  const previous=[process.env.SYNC_V4_USERS,process.env.SYNC_V5_USERS,process.env.SYNC_V5_SCOPES];
  process.env.SYNC_V4_USERS=userId;process.env.SYNC_V5_USERS=userId;process.env.SYNC_V5_SCOPES='practice';
  try{
    assert.deepEqual((await readScheduleProjection(client,userId)).value,{schemaVersion:1,examDiagnoses:[diagnosis]});
    const handle=createSyncApi({withUser:(_identity,work)=>work(client)});
    await assert.rejects(handle('POST',new URL('https://sync.test/api/sync/v4'),{syncProtocol:4,deviceId,operations:[{
      id:operationId,key:scheduleKey,baseRevision:10,baseHash:'a'.repeat(64),baseValue:{schemaVersion:1,examDiagnoses:[diagnosis]},value:{schemaVersion:1},deleted:false,clientUpdatedAt:new Date().toISOString(),
    }]},{sub:userId},userId),{status:409,code:'SCHEDULE_EMPTY_REPLACEMENT'});
    assert.equal(applied,false);
  }finally{
    for(const [key,value] of [['SYNC_V4_USERS',previous[0]],['SYNC_V5_USERS',previous[1]],['SYNC_V5_SCOPES',previous[2]]])if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});

test('compact v4 Schedule delta can safely expand into a large compatibility projection',async()=>{
  const userId=randomUUID(),deviceId=randomUUID(),operationId=randomUUID(),scheduleKey='jackyun_schedule_control_v1';
  const base={schemaVersion:1,largeNotes:'x'.repeat(620_000)},baseHash=createHash('sha256').update(canonicalJson(base)).digest('hex');let expandedBytes=0;
  const client={async query(sql,params=[]){
    if(sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[]};
    if(sql.includes("to_regclass('public.sync_change_heads')"))return {rows:[{ready:true}]};
    if(sql.includes("to_regclass('public.sync_v5_records')"))return {rows:[{ready:true}]};
    if(sql.startsWith('SELECT storage_value,revision,content_hash,deleted_at,updated_at FROM public.legacy_sync_data'))return {rows:[{storage_value:base,revision:10,content_hash:baseHash,deleted_at:null,updated_at:new Date().toISOString()}]};
    if(sql.startsWith('SELECT storage_value,deleted_at FROM public.legacy_sync_data'))return {rows:[{storage_value:base,deleted_at:null}]};
    if(sql.startsWith('SELECT storage_key,result,(SELECT request_hash FROM public.sync_v3_receipts'))return {rows:[]};
    if(sql.startsWith('SELECT * FROM public.legacy_sync_data'))return {rows:[{storage_value:base,revision:10,content_hash:baseHash,deleted_at:null}]};
    if(sql.startsWith('SELECT revision,content_hash,updated_at FROM public.sync_v5_projection_heads'))return {rows:[{revision:10,content_hash:baseHash,updated_at:new Date().toISOString()}]};
    if(sql.startsWith('SELECT scope,record_id,value,deleted_at FROM public.sync_v5_records WHERE user_id=$1'))return {rows:[]};
    if(sql.startsWith('SELECT public.prune_sync_changes()'))return {rows:[]};
    if(sql.includes('apply_web_sync_operation')){expandedBytes=Buffer.byteLength(params[6]);return {rows:[{result:{status:'applied',revision:11,contentHash:createHash('sha256').update(canonicalJson(JSON.parse(params[6]))).digest('hex')}}]};}
    if(sql.startsWith('SELECT scope,record_id,revision,content_hash,value,deleted_at FROM public.sync_v5_records'))return {rows:[]};
    if(sql.startsWith('UPDATE public.legacy_sync_data SET revision=$2,content_hash=$3,updated_at=now(),deleted_at=NULL'))return {rows:[{user_id:userId}]};
    if(sql.startsWith('INSERT INTO public.sync_v5_records')||sql.startsWith('INSERT INTO public.sync_v5_changes')||sql.startsWith('INSERT INTO public.legacy_sync_data')||sql.startsWith('INSERT INTO public.sync_v5_projection_heads')||sql.startsWith('INSERT INTO public.sync_change_log')||sql.startsWith('INSERT INTO public.sync_v3_receipts'))return {rows:[]};
    if(sql.startsWith('INSERT INTO public.sync_v5_heads'))return {rows:[{sequence:1}]};
    if(sql.startsWith('INSERT INTO public.sync_change_heads'))return {rows:[{sequence:1}]};
    if(sql.startsWith('SELECT revoked_at'))return {rows:[]};
    if(sql.includes('count(*)::integer AS count FROM public.sync_operations'))return {rows:[{count:0}]};
    if(sql.startsWith('INSERT INTO public.web_sync_devices'))return {rows:[]};
    throw new Error(`Unexpected SQL: ${sql}`);
  }};
  const previous=[process.env.SYNC_V4_USERS,process.env.SYNC_V5_USERS,process.env.SYNC_V5_SCOPES];
  process.env.SYNC_V4_USERS=userId;process.env.SYNC_V5_USERS=userId;process.env.SYNC_V5_SCOPES='settings';
  try{
    const handle=createSyncApi({withUser:(_identity,work)=>work(client)}),response=await handle('POST',new URL('https://sync.test/api/sync/v4'),{syncProtocol:4,deviceId,operations:[{
      id:operationId,key:scheduleKey,baseRevision:10,baseHash,patch:[{kind:'set',path:['featureGate'],value:{enabled:true}}],deleted:false,clientUpdatedAt:new Date().toISOString(),
    }]},{sub:userId},userId);
    assert.equal(response.applied.length,1);assert.ok(expandedBytes>600_000);
  }finally{for(const [key,value] of [['SYNC_V4_USERS',previous[0]],['SYNC_V5_USERS',previous[1]],['SYNC_V5_SCOPES',previous[2]]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
});

test('accepted v4 workspace writes advance v5 changes and stale v4 writes conflict after v5 authority',async()=>{
  const userId=randomUUID(),deviceId=randomUUID(),key='jackyun_goal_data',recordId=legacyWorkspaceRecordId(key),now=new Date().toISOString();
  const base={goal:'base'},next={goal:'v4 update'},oldHash=createHash('sha256').update(canonicalJson(base)).digest('hex');
  let legacy={storage_key:key,storage_value:base,revision:1,content_hash:oldHash,deleted_at:null,updated_at:now};
  const v5=new Map([[recordId,{scope:'workspace',record_id:recordId,revision:1,content_hash:createHash('sha256').update(canonicalJson(base)).digest('hex'),value:base,deleted_at:null,updated_at:now}]]),changes=[],lockOrder=[];
  const client={async query(sql,params=[]){
    if(sql.startsWith('SELECT pg_advisory_xact_lock')){lockOrder.push('account-lock');return {rows:[]};}
    if(sql.includes("to_regclass('public.sync_change_heads')"))return {rows:[{ready:true}]};
    if(sql.includes('SELECT revoked_at'))return {rows:[]};
    if(sql.startsWith('SELECT public.prune_sync_changes()'))return {rows:[]};
    if(sql.includes('count(*)::integer AS count FROM public.sync_operations'))return {rows:[{count:0}]};
    if(sql.startsWith('SELECT storage_key,result,(SELECT request_hash FROM public.sync_v3_receipts'))return {rows:[]};
    if(sql.startsWith('SELECT * FROM public.legacy_sync_data')){lockOrder.push('legacy-row-lock');return {rows:[legacy]};}
    if(sql.includes('apply_web_sync_operation')){
      lockOrder.push('legacy-write');
      const [, , ,baseRevision,baseHash,,rawValue,contentHash,deleted]=params;
      if(baseRevision!==legacy.revision||baseHash!==legacy.content_hash)return {rows:[{result:{status:'conflict',revision:legacy.revision,remoteValue:legacy.storage_value,remoteDeleted:Boolean(legacy.deleted_at),remoteHash:legacy.content_hash,remoteUpdatedAt:legacy.updated_at}}]};
      legacy={...legacy,storage_value:JSON.parse(rawValue),revision:legacy.revision+1,content_hash:contentHash,deleted_at:deleted?'now':null,updated_at:now};
      return {rows:[{result:{status:'applied',revision:legacy.revision,contentHash,updatedAt:now}}]};
    }
    if(sql.startsWith('INSERT INTO public.sync_v3_receipts'))return {rows:[]};
    if(sql.startsWith("SELECT sequence FROM public.sync_v5_heads WHERE user_id=$1 AND scope='workspace'"))return {rows:[{sequence:changes.length+1}]};
    if(sql.startsWith('SELECT storage_value,deleted_at FROM public.legacy_sync_data'))return {rows:[legacy]};
    if(sql.startsWith('SELECT revision,content_hash,deleted_at FROM public.sync_v5_records'))return {rows:v5.has(params[1])?[v5.get(params[1])]:[]};
    if(sql.startsWith("SELECT revision FROM public.sync_v5_records WHERE user_id=$1 AND scope='workspace'"))return {rows:v5.has(params[1])?[{revision:v5.get(params[1]).revision}]:[]};
    if(sql.startsWith('INSERT INTO public.sync_v5_records')){
      const [,recordId,revision,content_hash,raw,deleted]=params;v5.set(recordId,{scope:'workspace',record_id:recordId,revision,content_hash,value:JSON.parse(raw),deleted_at:deleted?'now':null,updated_at:now});return {rows:[]};
    }
    if(sql.startsWith("INSERT INTO public.sync_v5_heads(user_id,scope,sequence) VALUES($1,'workspace',1)"))return {rows:[{sequence:changes.length+1}]};
    if(sql.startsWith("INSERT INTO public.sync_v5_changes(user_id,scope,sequence,record_id) VALUES($1,'workspace'")){changes.push({sequence:params[1],record_id:params[2]});return {rows:[]};}
    if(sql.startsWith('INSERT INTO public.sync_change_heads'))return {rows:[{sequence:1}]};
    if(sql.startsWith('INSERT INTO public.sync_change_log'))return {rows:[]};
    if(sql.startsWith('INSERT INTO public.web_sync_devices')||sql.startsWith('INSERT INTO public.sync_conflicts')||sql.startsWith('INSERT INTO public.sync_operations'))return {rows:[]};
    if(sql.startsWith('SELECT * FROM public.list_web_sync_records'))return {rows:[{...legacy,storage_key:key,large:false}]};
    throw new Error(`Unexpected SQL: ${sql}`);
  }};
  const old={SYNC_V4_USERS:process.env.SYNC_V4_USERS,SYNC_V5_USERS:process.env.SYNC_V5_USERS,SYNC_V5_SCOPES:process.env.SYNC_V5_SCOPES};
  process.env.SYNC_V4_USERS=userId;process.env.SYNC_V5_USERS=userId;process.env.SYNC_V5_SCOPES='workspace';
  try{
    const handle=createSyncApi({withUser:(_identity,work)=>work(client)});
    const operation=(id,value,baseRevision,baseHash)=>({id,key,baseRevision,baseHash,baseValue:base,value,deleted:false,clientUpdatedAt:now});
    const first=await handle('POST',new URL('https://sync.test/api/sync/v4'),{syncProtocol:4,deviceId,operations:[operation(randomUUID(),next,1,oldHash)]},{sub:userId},userId);
    assert.ok(lockOrder.indexOf('account-lock')<lockOrder.indexOf('legacy-row-lock'),'legacy writes must acquire the same account lock as v5 before locking legacy rows');
    assert.equal(first.applied.length,1);assert.deepEqual(v5.get(recordId).value,next);assert.equal(v5.get(recordId).revision,2);
    assert.equal(changes.length,1);assert.equal(changes[0].record_id,recordId);
    const stale=await handle('POST',new URL('https://sync.test/api/sync/v4'),{syncProtocol:4,deviceId,operations:[operation(randomUUID(),{goal:'stale'},1,oldHash)]},{sub:userId},userId);
    assert.equal(stale.conflicts.length,1);assert.deepEqual(stale.conflicts[0].remoteValue,next);
    assert.deepEqual(v5.get(recordId).value,next);assert.equal(changes.length,1,'stale v4 writes never advance or overwrite v5 authority');
  }finally{for(const [key,value] of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
