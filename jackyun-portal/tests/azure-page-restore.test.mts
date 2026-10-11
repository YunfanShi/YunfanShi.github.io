import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {createAzureRecordClient} from '../src/lib/sync/azure-records.ts';
import {restoreAzurePage} from '../src/lib/backup/azure-page-restore.ts';
import {canonicalJson} from '../src/lib/sync/hash.ts';
import {createSyncApi} from '../azure/backend/sync-api.mjs';
const user='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',opId='00000000-0000-4000-8000-000000000003';
const key='jackyun_definition_restore_v1',time='2026-10-08T00:00:00Z',before={text:'当前'},desired={text:'恢复📚'};
const hash=(v:unknown)=>createHash('sha256').update(canonicalJson(v)).digest('hex');
function fixture(){
 let revision=7,value=before,lost=true,saved=false,finished=0;const bodies:unknown[]=[];
 const row=()=>({key,value,revision,contentHash:hash(value),deleted:false,updatedAt:time,large:false});
 const source=createAzureRecordClient({endpoint:'https://jackyun-sync-9d26b2cc.azurewebsites.net',token:`signed.${Buffer.from(JSON.stringify({session_id:device})).toString('base64url')}.verified`,fetchImpl:async(url,init)=>{
  if(init?.method==='GET')return Response.json(new URL(String(url)).pathname==='/api/sync/export'?{ok:true,records:[row()],next:null}:{ok:true,records:[row()]});
  assert.equal(saved,true);const body=JSON.parse(String(init?.body));bodies.push(body);assert.equal(body.operations[0].baseRevision,7);
  revision=8;value=desired;
  if(lost){lost=false;throw Error('Lost response after commit');}
  return Response.json({ok:true,applied:[{operationId:opId,key,revision:8,contentHash:hash(desired),updatedAt:time}],remote:[],conflicts:[]});
 }});
 const prepare=async()=>{saved=true;return {error:null,data:{id:opId,page:'definitions',beforeId:21,plan:[{key,value:desired,deleted:false,operationId:opId,clientUpdatedAt:time,expected:{user_id:user,storage_key:key,storage_value:before,revision:7,content_hash:hash(before),deleted_at:null,updated_at:time}}]}};};
 const finish=async()=>{finished++;return {error:null,data:{page:'definitions',completed:true}};};
 return {source,prepare,finish,bodies,get finished(){return finished;}};
}
test('page restore retries the original operation after a lost commit response',async()=>{
 const f=fixture();const run=()=>restoreAzurePage(f.source,user,12,'definitions',device,f.prepare,f.finish);
 await assert.rejects(run(),/版本 21 已保存/);assert.equal(f.finished,0);
 const result=await run();assert.deepEqual(f.bodies[0],f.bodies[1]);assert.deepEqual(result.legacyRecords[0].value,desired);assert.equal(f.finished,1);
});
test('page restore refuses missing pre-restore backup before any write',async()=>{
 const f=fixture();await assert.rejects(restoreAzurePage(f.source,user,12,'definitions',device,async()=>({data:null,error:{private:true}}),f.finish),/未执行/);
 assert.equal(f.bodies.length,0);assert.equal(f.finished,0);
});
test('optimistic restore replays a matching prior operation without overwriting a later revision',async()=>{
 let applied=0;const prior={status:'applied',revision:8,contentHash:hash(desired)};
 const api=createSyncApi({async withUser(_identity:unknown,work:(client:unknown)=>Promise<unknown>){return work({async query(sql:string){
  if(sql.startsWith('SELECT storage_key,result'))return {rows:[{storage_key:key,result:prior}]};
  if(sql.startsWith('SELECT revoked_at'))return {rows:[]};
  if(sql.startsWith('INSERT INTO public.web_sync_devices'))return {rows:[]};
  if(sql.includes('count(*)'))return {rows:[{count:1}]};
  if(sql.includes('apply_web_sync_operation')){applied++;return {rows:[{result:prior}]};}
  throw Error('A replay must not reread the old base version or write sync data');
 }});}});
 const body={deviceId:device,requireCurrentVersion:true,operations:[{id:opId,key,baseRevision:7,baseHash:hash(before),baseValue:null,value:desired,deleted:false,clientUpdatedAt:time}]};
 const response=await api('POST',new URL('https://example.test/api/sync/v2'),body,{sub:user,role:'authenticated'});
 assert.equal(response.applied[0].revision,8);assert.equal(applied,0);
 body.operations[0].value={text:'修改了重试请求'};
 await assert.rejects(api('POST',new URL('https://example.test/api/sync/v2'),body,{sub:user,role:'authenticated'}),/RESTORE_OPERATION_MISMATCH/);
 assert.equal(applied,0);
});
