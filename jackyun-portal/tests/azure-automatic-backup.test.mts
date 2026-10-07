import assert from 'node:assert/strict';
import test from 'node:test';
import { createAzureRecordClient } from '../src/lib/sync/azure-records.ts';
import { createAzureDueBackups } from '../src/lib/backup/azure-automatic-backup.ts';
import { validateBackupMarkers } from '../src/lib/backup/markers.ts';
import { createSyncApi } from '../azure/backend/sync-api.mjs';
const user='00000000-0000-4000-8000-000000000001';
const sourceGeneration='00000000-0000-4000-8000-000000000002';
const azureGeneration='00000000-0000-4000-8000-000000000003';
const settingsGeneration='00000000-0000-4000-8000-000000000004';
const time='2026-10-08T00:00:00Z';
function fixture({due=true,ackFails=false,acknowledged=true}:{due?:boolean;ackFails?:boolean;acknowledged?:boolean}={}){
  let committed=false,acks=0,exports=0;const acknowledgments:unknown[]=[];
  const source=createAzureRecordClient({endpoint:'https://jackyun-sync-9d26b2cc.azurewebsites.net',token:'fixture',fetchImpl:async(input,options)=>{
    const url=new URL(String(input));
    if(url.pathname==='/api/sync/backup-markers'){
      if(options?.method==='GET')return Response.json({ok:true,markers:[{page:'schedule',generation:azureGeneration,due},
        {page:'settings',generation:settingsGeneration,due:false}]});
      assert.equal(committed,true,'only acknowledge after source commit');acks++;
      acknowledgments.push(JSON.parse(String(options?.body)));
      if(ackFails&&acks===1)return Response.json({}, {status:503});
      return Response.json({ok:true,acknowledged});
    }
    assert.equal(url.pathname,'/api/sync/export');exports++;
    const rows=[{key:'jackyun_schedule_notes',value:null,revision:3,contentHash:null,deleted:true,large:false,updatedAt:time},
      {key:'jackyun_theme',value:{theme:'dark'},revision:1,contentHash:null,deleted:false,large:false,updatedAt:time}];
    return Response.json({ok:true,records:rows.sort((a,b)=>Buffer.compare(Buffer.from(a.key),Buffer.from(b.key))),next:null});
  }});
  return {source,acknowledgments,get exports(){return exports;},get acks(){return acks;},commit(){committed=true;}};
}
test('due page merges both marker sources, preserves tombstones, and commits before ack',async()=>{
  const f=fixture();
  const count=await createAzureDueBackups(f.source,user,async()=>({data:[{page:'schedule',generation:sourceGeneration,due:false}],error:null}),async args=>{
    assert.equal(args.target_page,'schedule');assert.equal(args.source_generation,sourceGeneration);assert.equal(args.azure_generation,azureGeneration);
    assert.equal(args.sync_records.length,1);assert.equal(args.sync_records[0].user_id,user);assert.equal(args.sync_records[0].deleted_at,time);
    assert.equal(args.sync_records[0].storage_value,null);f.commit();return {data:{versionId:42,created:true},error:null};
  });
  assert.equal(count,1);assert.equal(f.exports,2);assert.deepEqual(f.acknowledgments,[{page:'schedule',generation:azureGeneration,versionId:42}]);
});
test('a failed source capture never acknowledges Azure changes',async()=>{
  const f=fixture();
  await assert.rejects(createAzureDueBackups(f.source,user,async()=>({data:[],error:null}),async()=>({data:null,error:{message:'private SQL'}})),/尚未确认保存/);
  assert.equal(f.acks,0);
});
test('lost Azure acknowledgment is retried with the saved receipt and counted once',async()=>{
  const f=fixture({ackFails:true});let saved=false,versions=0;
  const markers=async()=>({data:saved?[]:[{page:'schedule',generation:sourceGeneration,due:false}],error:null});
  const capture=async(args:{source_generation:string|null})=>{
    assert.equal(args.source_generation,saved?null:sourceGeneration);
    const created=!saved;if(created)versions++;saved=true;f.commit();return {data:{versionId:42,created},error:null};
  };
  await assert.rejects(createAzureDueBackups(f.source,user,markers,capture),/503/);
  assert.equal(await createAzureDueBackups(f.source,user,markers,capture),0);assert.equal(versions,1);assert.equal(f.acks,2);
});
test('a changed Azure generation keeps newer changes pending without invalidating the saved version',async()=>{
  const f=fixture({acknowledged:false});
  assert.equal(await createAzureDueBackups(f.source,user,async()=>({data:[],error:null}),async()=>{
    f.commit();return {data:{versionId:42,created:true},error:null};
  }),1);
  assert.equal(f.acks,1);
});
test('no due markers avoid data reads and malformed marker sources fail before capture',async()=>{
  const f=fixture({due:false});let captures=0;
  const capture=async()=>{captures++;return {data:{versionId:42,created:true},error:null};};
  assert.equal(await createAzureDueBackups(f.source,user,async()=>({data:[],error:null}),capture),0);
  assert.equal(f.exports,0);assert.equal(captures,0);
  await assert.rejects(createAzureDueBackups(f.source,user,async()=>({data:[{page:'schedule',generation:'invalid',due:true}],error:null}),capture),/标记无效/);
  await assert.rejects(createAzureDueBackups(f.source,user,async()=>({data:null,error:{}}),capture),/无法读取/);
  assert.equal(captures,0);assert.equal(f.acks,0);
  assert.throws(()=>validateBackupMarkers([{page:'schedule',generation:azureGeneration,due:true},{page:'schedule',generation:sourceGeneration,due:true}]),/标记无效/);
});
test('backend marker endpoints retain verified user context, validate input and use narrow functions',async()=>{
  const contexts:boolean[]=[];let queries=0;
  const api=createSyncApi({async withUser(identity:{sub:string},work:(client:object)=>unknown,options:{write:boolean}){
    assert.equal(identity.sub,user);contexts.push(options.write);
    return work({async query(sql:string,args?:unknown[]){
      queries++;
      if(sql==='SELECT public.sync_backup_markers() AS markers')return {rows:[{markers:[{page:'schedule',generation:azureGeneration,due:true}]}]};
      assert.equal(sql,'SELECT public.ack_sync_backup_marker($1,$2::uuid) AS acknowledged');
      assert.deepEqual(args,['schedule',azureGeneration]);return {rows:[{acknowledged:false}]};
    }});
  }},{verifyBackupCapture:async(identity:{sub:string},token:string,body:{versionId:number})=>{assert.equal(identity.sub,user);assert.equal(token,'verified');assert.equal(body.versionId,42);}});
  const url=new URL('https://example.test/api/sync/backup-markers'),identity={sub:user,role:'authenticated'};
  assert.deepEqual(await api('GET',url,null,identity),{ok:true,markers:[{page:'schedule',generation:azureGeneration,due:true}]});
  assert.deepEqual(await api('POST',url,{page:'schedule',generation:azureGeneration,versionId:42},identity,'verified'),{ok:true,acknowledged:false});
  await assert.rejects(api('POST',url,{page:'schedule',generation:'bad'},identity),/INVALID_BACKUP_MARKER/);
  assert.equal(queries,2);assert.deepEqual(contexts,[false,true]);
});
