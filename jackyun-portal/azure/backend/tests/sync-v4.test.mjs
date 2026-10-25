import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {handleSyncV4} from '../sync-v4.mjs';
const identity={sub:randomUUID()},url=query=>new URL('https://test/api/sync/v4'+query);
test('v4 rollout defaults off and does not query absent schema',async()=>{
  const old=process.env.SYNC_V4_ENABLED;delete process.env.SYNC_V4_ENABLED;
  try{const result=await handleSyncV4({query:()=>{throw Error('must not query');}},identity,'GET',url(''),null);assert.equal(result.capabilities.v4,false);}
  finally{if(old!==undefined)process.env.SYNC_V4_ENABLED=old;}
});
test('capabilities require actual journal tables',async()=>{
  process.env.SYNC_V4_ENABLED='true';
  try{const result=await handleSyncV4({query:async()=>({rows:[{ready:false}]})},identity,'GET',url(''),null);assert.equal(result.capabilities.v4,false);}
  finally{delete process.env.SYNC_V4_ENABLED;}
});
test('expired cursors request a new baseline without returning data',async()=>{
  process.env.SYNC_V4_ENABLED='true';
  const client={query:async query=>({rows:query.includes('to_regclass')?[{ready:true}]:[{sequence:20,retained_after:10}]})};
  try{await assert.rejects(handleSyncV4(client,identity,'GET',url('?mode=changes&cursor=2'),null),{status:409,code:'SYNC_BASELINE_REQUIRED'});}
  finally{delete process.env.SYNC_V4_ENABLED;}
});
test('receipts reject reusing an ID with different immutable contents',async()=>{
  process.env.SYNC_V4_ENABLED='true';const id=randomUUID();
  const client={query:async query=>({rows:query.includes('to_regclass')?[{ready:true}]:query.includes('sync_operations')?[{id,request_hash:'b'.repeat(64),result:{status:'applied'}}]:[]})};
  try{await assert.rejects(handleSyncV4(client,identity,'POST',url(''),{action:'receipts',operations:[{id,requestHash:'a'.repeat(64)}]}),{status:409,code:'OPERATION_ID_REUSED'});}
  finally{delete process.env.SYNC_V4_ENABLED;}
});
test('v4 writes share the v3 transaction and operation identity',async()=>{
  process.env.SYNC_V4_ENABLED='true';const op={id:randomUUID(),key:'study'};
  const client={query:async()=>({rows:[{ready:true}]})};
  try{const response=await handleSyncV4(client,identity,'POST',url(''),{syncProtocol:4,operations:[op]},async(c,who,body)=>{
    assert.equal(c,client);assert.equal(who,identity);assert.equal(body.syncProtocol,3);assert.deepEqual(body.operations,[op]);return {ok:true,applied:[op]};
  });assert.equal(response.syncProtocol,4);}
  finally{delete process.env.SYNC_V4_ENABLED;}
});
