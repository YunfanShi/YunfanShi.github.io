import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createAzureRecordClient } from '../src/lib/sync/azure-records.ts';
import { canonicalJson } from '../src/lib/sync/hash.ts';
import { restoreAzureSchedule, saveAzurePageBackup } from '../src/lib/backup/azure-page-backup.ts';
import { createSyncApi } from '../azure/backend/sync-api.mjs';
const user='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002';
const key='jackyun_schedule_control_v1',time='2026-10-08T00:00:00Z';
const hash=(value: unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
const current={timetable:{label:'当前课表📚'}},incoming={timetable:{label:'历史课表'}};
const row=(revision=7)=>({key,value:current,revision,contentHash:hash(current),deleted:false,large:false,updatedAt:time});
function fixture({changed=false,unavailable=false}:{changed?:boolean;unavailable?:boolean}={}){
  let saved=false,posts=0,reads=0;const calls:string[]=[];
  const source=createAzureRecordClient({endpoint:'https://jackyun-sync-9d26b2cc.azurewebsites.net',
    token:`signed.${Buffer.from(JSON.stringify({session_id:device})).toString('base64url')}.verified`,
    fetchImpl:async(input,options)=>{
      const url=new URL(String(input));calls.push(url.pathname);
      if(unavailable)return Response.json({}, {status:503});
      if(options?.method==='GET'){
        if(url.pathname==='/api/sync/export')return Response.json({ok:true,records:[row(),{...row(),key:'jackyun_theme'}],next:null});
        reads++;return Response.json({ok:true,records:[row(changed&&reads>1?8:7)]});
      }
      posts++;assert.equal(saved,true,'no mutation before pre-restore snapshot commit');
      const body=JSON.parse(String(options?.body));assert.equal(body.requireCurrentVersion,true);
      const op=body.operations[0];assert.equal(op.baseRevision,7);
      assert.equal(op.baseHash,hash(current));assert.deepEqual(op.value,incoming);
      return Response.json({ok:true,applied:[{operationId:op.id,key,revision:8,contentHash:hash(incoming),updatedAt:time}],remote:[],conflicts:[]});
    }});
  return {source,calls,get posts(){return posts;},save(){saved=true;}};
}
test('schedule restore saves current Azure and source page snapshot before an optimistic write',async()=>{
  const f=fixture();
  const result=await restoreAzureSchedule(f.source,user,incoming,async args=>{
    assert.equal(args.target_page,'schedule');assert.equal(args.backup_reason,'before_restore');
    assert.equal(args.sync_records.length,1);assert.equal(args.sync_records[0].user_id,user);
    assert.deepEqual(args.sync_records[0].storage_value,current);assert.equal(args.sync_records[0].revision,7);
    f.save();return {data:12,error:null};
  });
  assert.equal(result.revision,8);assert.deepEqual(result.value,incoming);assert.equal(f.posts,1);
});
test('a failed pre-restore RPC cannot mutate Azure or acknowledge recovery',async()=>{
  const f=fixture();
  await assert.rejects(restoreAzureSchedule(f.source,user,incoming,async()=>({data:null,error:{message:'private detail'}})),/恢复未执行/);
  assert.equal(f.posts,0);
});
test('a concurrent revision after pre-restore backup stops recovery before posting',async()=>{
  const f=fixture({changed:true});
  await assert.rejects(restoreAzureSchedule(f.source,user,incoming,async()=>{f.save();return {data:12,error:null};}),/备份后发生变化/);
  assert.equal(f.posts,0);
});
test('unavailable Azure and empty schedule fail before saving or mutating anything',async()=>{
  const f=fixture({unavailable:true});let calls=0;
  const rpc=async()=>{calls++;return {data:12,error:null};};
  await assert.rejects(restoreAzureSchedule(f.source,user,incoming,rpc),/503/);
  await assert.rejects(restoreAzureSchedule(f.source,user,{},rpc),/内容无效/);
  assert.equal(calls,0);assert.equal(f.posts,0);
});
test('manual backup requires a valid committed ID and filters unselected pages',async()=>{
  const f=fixture();
  await assert.rejects(saveAzurePageBackup(f.source,user,'schedule',async args=>{
    assert.equal(args.backup_reason,'manual');assert.equal(args.sync_records.length,1);
    return {data:'12',error:null};
  }),/备份未保存/);
  assert.equal(f.posts,0);
});
test('backend refuses a version changed after the final client read before any write',async()=>{
  let mutations=0;
  const api=createSyncApi({async withUser(identity:{sub:string},work:(client:object)=>unknown,options:{write:boolean}){
    assert.equal(identity.sub,user);assert.equal(options.write,true);
    return work({async query(sql:string,args:string[]){
      if(sql.startsWith('SELECT storage_key,result')) return {rows:[]};
      if(sql.startsWith('SELECT revision,content_hash')){
        assert.match(sql,/FOR UPDATE/);assert.deepEqual(args,[user,key]);return {rows:[{revision:8,content_hash:hash(current)}]};
      }
      mutations++;throw Error('No mutation may run');
    }});
  }});
  await assert.rejects(api('POST',new URL('https://example.test/api/sync/v2'),{
    deviceId:device,requireCurrentVersion:true,operations:[{id:'00000000-0000-4000-8000-000000000003',key,
      baseRevision:7,baseHash:hash(current),baseValue:null,value:incoming,deleted:false,clientUpdatedAt:time}],
  },{sub:user,session_id:device,role:'authenticated'}),/RESTORE_VERSION_CHANGED/);
  assert.equal(mutations,0);
});
