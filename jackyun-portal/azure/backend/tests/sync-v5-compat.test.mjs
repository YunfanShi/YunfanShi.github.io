import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSyncApi} from '../sync-api.mjs';
import {readScheduleProjection} from '../sync-v5.mjs';

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
