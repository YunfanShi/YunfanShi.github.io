import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {handleSyncV5,readScheduleProjection,scheduleProjectionState,syncV5Rollout} from '../sync-v5.mjs';
import {legacyWorkspaceRecordId} from '../../../src/lib/sync/resource-model.ts';
import {createApiHandler} from '../server.mjs';
import {canonicalJson} from '../../../src/lib/sync/hash.ts';
import {readFile} from 'node:fs/promises';
import {estimateSqlParameterBytes} from '../database.mjs';

const identity={sub:randomUUID()},url=(path,query='')=>new URL(`https://sync.test/api/sync/v5${path}${query}`);
function database(){
  const records=new Map(),receipts=new Map(),heads=new Map(),projectionHeads=new Set(),changes=[],v4Changes=[],queries=[],calls=[];let writes=0,projectionWrites=0;
  return {records,receipts,heads,projectionHeads,changes,v4Changes,queries,calls,legacySchedule:null,legacyRows:[],get writes(){return writes;},get projectionWrites(){return projectionWrites;},async query(sql,params=[]){
    queries.push(sql.replace(/\s+/g,' ').trim());
    calls.push({sql:sql.replace(/\s+/g,' ').trim(),params});
    if(sql.includes("to_regclass('public.sync_v5_records')"))return {rows:[{ready:true}]};
    if(sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[]};
    if(sql.includes('count(*)::integer AS count FROM public.sync_v5_receipts'))return {rows:[{count:0}]};
    if(sql.startsWith('SELECT storage_value,revision,content_hash,deleted_at,updated_at FROM public.legacy_sync_data'))return {rows:this.legacySchedule?[this.legacySchedule]:[]};
    if(sql.replace(/\s+/g,' ').trim().startsWith('SELECT storage_key,storage_value,revision,deleted_at,updated_at FROM public.legacy_sync_data'))return {rows:this.legacyRows.filter(row=>row.user_id===params[0])};
    if(sql.startsWith('UPDATE public.legacy_sync_data SET revision=')){
      if(!this.legacySchedule)return {rows:[]};
      this.legacySchedule={...this.legacySchedule,revision:params[1],content_hash:params[2],deleted_at:null};
      return {rows:[{user_id:params[0]}]};
    }
    if(sql.startsWith('SELECT revision FROM public.legacy_sync_data WHERE user_id=$1 AND storage_key=$2 FOR UPDATE'))return {rows:this.legacyRows.filter(row=>row.user_id===params[0]&&row.storage_key===params[1]).map(row=>({revision:row.revision}))};
    if(sql.startsWith('SELECT revision,content_hash,updated_at FROM public.sync_v5_projection_heads'))return {rows:[]};
    if(sql.startsWith('SELECT 1 FROM public.sync_v5_projection_heads'))return {rows:projectionHeads.has(params[0])?[{}]:[]};
    if(sql.startsWith('SELECT scope FROM public.sync_v5_heads WHERE user_id=$1'))return {rows:[...heads.keys()].filter(key=>key.startsWith(`${params[0]}:`)).map(key=>({scope:key.slice(params[0].length+1)}))};
    if(sql.startsWith('SELECT sequence,retained_after FROM public.sync_v5_heads'))return {rows:heads.has(`${params[0]}:${params[1]}`)?[{sequence:heads.get(`${params[0]}:${params[1]}`),retained_after:0}]:[]};
    if(sql.startsWith('SELECT scope,record_id,value,deleted_at FROM public.sync_v5_records'))return {rows:[...records.values()].filter(row=>row.user_id===params[0]&&(Array.isArray(params[1])?params[1].includes(row.scope):row.scope===params[1]))};
    if(sql.startsWith('SELECT scope,record_id,revision,content_hash,deleted_at,updated_at')&&sql.includes('FROM public.sync_v5_records')){
      const [user,scope,after,start,end]=params;return {rows:[...records.values()].filter(row=>row.user_id===user&&row.scope===scope&&row.record_id>after&&(!start||(row.record_id>=start&&row.record_id<end))).sort((a,b)=>a.record_id.localeCompare(b.record_id)).slice(0,101)};
    }
    if(sql.startsWith('WITH state AS (')&&sql.includes('FROM public.sync_v5_records r')){
      const [user,scope,after,start,end]=params,head=heads.get(`${user}:${scope}`)??0;
      const rows=[...records.values()].filter(row=>row.user_id===user&&row.scope===scope&&row.record_id>after&&(!start||(row.record_id>=start&&row.record_id<end))).sort((a,b)=>a.record_id.localeCompare(b.record_id)).slice(0,101);
      return {rows:rows.length?rows.map(row=>({...row,head,retained_after:0})):[{record_id:null,head,retained_after:0}]};
    }
    if(sql.startsWith('WITH state AS (')&&sql.includes('FROM public.sync_v5_changes c')){
      const [user,scope,cursor,start,end]=params,head=heads.get(`${user}:${scope}`)??0;
      const rows=changes.filter(row=>row.user_id===user&&row.scope===scope&&row.sequence>cursor&&(!start||(row.record_id>=start&&row.record_id<end)))
        .map(change=>({sequence:change.sequence,...records.get(change.record_id),head,retained_after:0})).slice(0,101);
      return {rows:rows.length?rows:[{sequence:null,head,retained_after:0}]};
    }
    if(sql.startsWith('SELECT c.sequence,r.scope,r.record_id,r.revision,r.content_hash,r.deleted_at,r.updated_at')){
      const [user,scope,cursor,start,end]=params;return {rows:changes.filter(change=>change.user_id===user&&change.scope===scope&&change.sequence>cursor&&(!start||(change.record_id>=start&&change.record_id<end))).map(change=>({sequence:change.sequence,...records.get(change.record_id)})).slice(0,101)};
    }
    if(sql.startsWith('INSERT INTO public.legacy_sync_data(user_id,storage_key,storage_value,revision,content_hash,deleted_at,updated_at)')){
      const [user_id,storage_key,raw,revision,content_hash,deleted]=params,row={user_id,storage_key,storage_value:JSON.parse(raw),revision,content_hash,deleted_at:deleted?'now':null,updated_at:'now'};
      const prior=this.legacyRows.findIndex(item=>item.user_id===user_id&&item.storage_key===storage_key);if(prior<0)this.legacyRows.push(row);else this.legacyRows[prior]=row;return {rows:[]};
    }
    if(sql.startsWith('INSERT INTO public.legacy_sync_data'))return {rows:[]};
    if(sql.startsWith('INSERT INTO public.sync_v5_projection_heads')){projectionHeads.add(params[0]);projectionWrites++;return {rows:[]};}
    if(sql.startsWith('INSERT INTO public.sync_change_heads'))return {rows:[{sequence:this.v4Changes.length+1}]};
    if(sql.startsWith('INSERT INTO public.sync_change_log')){this.v4Changes.push({user_id:params[0],sequence:params[1],storage_key:params[2]});return {rows:[]};}
    if(sql.startsWith('WITH removed AS'))return {rows:[]};
    if(sql.includes('FROM public.web_sync_devices'))return {rows:[]};
    if(sql.includes('FROM public.sync_v5_receipts')){
      const [user,scope,ids]=params;
      return {rows:[...receipts.values()].filter(row=>row.user_id===user&&row.scope===scope&&ids.includes(row.operation_id))};
    }
    if(sql.includes('FROM public.sync_v5_records')&&sql.includes('FOR UPDATE')){
      return {rows:records.has(params[2])?[records.get(params[2])]:[]};
    }
    if(sql.startsWith('SELECT scope,record_id,revision,content_hash,value,deleted_at,updated_at')&&sql.includes('FROM public.sync_v5_records')){
      return {rows:params[2].map(id=>records.get(id)).filter(row=>row?.user_id===params[0]&&row.scope===params[1])};
    }
    if(sql.startsWith('INSERT INTO public.sync_v5_records')){
      const [user_id,scope,record_id,revision,content_hash,value,deleted]=params,now=new Date().toISOString();
      const row={user_id,scope,record_id,revision,content_hash,value:JSON.parse(value),deleted_at:deleted?now:null,updated_at:params[7]??now};
      records.set(record_id,row);writes++;return {rows:[row]};
    }
    if(sql.startsWith('INSERT INTO public.sync_v5_heads')){
      const [user,scope]=params,key=`${user}:${scope}`,sequence=params.length>2?params[2]:(heads.get(key)??0)+1;heads.set(key,sequence);return {rows:[{sequence}]};
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
const rolloutKeys=['SYNC_V5_ENABLED','SYNC_V5_USERS','SYNC_V5_SCOPES','SYNC_V5_MODE','SYNC_V5_PERCENTAGE','SYNC_V5_PERCENTAGE_SALT','SYNC_V5_WRITE_PAUSE'];
async function withRolloutEnv(values,run){
  const previous=Object.fromEntries(rolloutKeys.map(key=>[key,process.env[key]]));
  for(const key of rolloutKeys)delete process.env[key];
  Object.assign(process.env,values);
  try{return await run();}
  finally{for(const key of rolloutKeys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
}
const hash=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');

test('Azure HTTP entrypoint exposes every v5 route to the sync handler',async t=>{
  const seen=[];
  const server=createServer(createApiHandler({authenticate:async()=>({sub:'test-user'}),handle:async(_method,url)=>{seen.push(url.pathname);return {ok:true,route:url.pathname};},logger:{info(){},error(){}}}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const address=server.address();assert.ok(address&&typeof address==='object');
  for(const path of ['/api/sync/v5','/api/sync/v5/manifest?scope=cue','/api/sync/v5/changes?scope=cue&cursor=0','/api/sync/v5/records?scope=cue&id=cues%3Acue-1','/api/sync/v5/operations?scope=cue','/api/sync/v5/receipts?scope=cue']){
    const method=path.includes('/operations')||path.includes('/receipts')?'POST':'GET';
    const response=await fetch(`http://127.0.0.1:${address.port}${path}`,{method,headers:{Authorization:'Bearer test-token',...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify({})}:{})});
    assert.equal(response.status,200,`${method} ${path}`);
    assert.equal((await response.json()).route,path.split('?')[0]);
  }
  assert.equal(seen.length,6);
});

test('v5 stays disabled without an explicit account rollout',()=>{
  const previous=[process.env.SYNC_V5_ENABLED,process.env.SYNC_V5_USERS,process.env.SYNC_V5_SCOPES];
  delete process.env.SYNC_V5_ENABLED;delete process.env.SYNC_V5_USERS;delete process.env.SYNC_V5_SCOPES;
  try{assert.deepEqual(syncV5Rollout(identity),[]);}
  finally{[process.env.SYNC_V5_ENABLED,process.env.SYNC_V5_USERS,process.env.SYNC_V5_SCOPES]=previous;}
});

test('rollout modes are explicit, stable, and fail closed',async()=>withRolloutEnv({SYNC_V5_SCOPES:'cue'},async()=>{
  assert.deepEqual(syncV5Rollout(identity),[]);
  process.env.SYNC_V5_MODE='disabled';process.env.SYNC_V5_USERS=identity.sub;
  assert.deepEqual(syncV5Rollout(identity),[]);
  process.env.SYNC_V5_MODE='canary';
  assert.deepEqual(syncV5Rollout(identity),['cue']);
  assert.deepEqual(syncV5Rollout({sub:randomUUID()}),[]);
  process.env.SYNC_V5_MODE='global';
  assert.deepEqual(syncV5Rollout({sub:randomUUID()}),['cue']);
  process.env.SYNC_V5_MODE='*';
  assert.deepEqual(syncV5Rollout(identity),[]);
  process.env.SYNC_V5_MODE='percentage';process.env.SYNC_V5_PERCENTAGE='not-a-number';
  assert.deepEqual(syncV5Rollout(identity),[]);
  process.env.SYNC_V5_PERCENTAGE='100';
  assert.deepEqual(syncV5Rollout(identity),['cue']);
  process.env.SYNC_V5_PERCENTAGE='0';
  assert.deepEqual(syncV5Rollout(identity),[]);
}));

test('emergency pause blocks v5 mutations without blocking reads or receipts',async()=>withRolloutEnv({
  SYNC_V5_MODE:'global',SYNC_V5_SCOPES:'cue',SYNC_V5_WRITE_PAUSE:'true',
},async()=>{
  const db=database(),root=await handleSyncV5(db,identity,'GET',url(''),null,['cue']);
  assert.equal(root.writePaused,true);assert.equal(root.capabilities.writes,false);
  const manifest=await handleSyncV5(db,identity,'GET',url('/manifest','?scope=cue'),null,['cue']);
  assert.deepEqual(manifest.records,[]);
  const receipts=await handleSyncV5(db,identity,'POST',url('/receipts'),{scope:'cue',operations:[{id:randomUUID(),requestHash:'a'.repeat(64)}]},['cue']);
  assert.equal(receipts.receipts[0].state,'unknown');
  await assert.rejects(handleSyncV5(db,identity,'POST',url('/operations'),{scope:'cue',deviceId:randomUUID(),operations:[{
    id:randomUUID(),scope:'cue',recordId:'cues:cue-1',baseRevision:0,baseHash:null,value:{id:'cue-1'},deleted:false,clientUpdatedAt:new Date().toISOString(),
  }]},['cue']),{status:503,code:'SYNC_V5_WRITES_PAUSED'});
  assert.equal(db.writes,0);
}));

test('resource writes use CAS, idempotent receipts, and return actionable conflicts',async()=>{
  const db=database(),deviceId=randomUUID(),id=randomUUID(),value={id:'cue-1',prompt:'Recall'};
  const operation={id,scope:'cue',recordId:'cues:cue-1',baseRevision:0,baseHash:null,value,deleted:false,clientUpdatedAt:new Date().toISOString()};
  const first=await handleSyncV5(db,identity,'POST',url('/operations'),{scope:'cue',deviceId,operations:[operation]},['cue']);
  assert.equal(first.applied[0].revision,1);assert.equal(first.applied[0].contentHash,hash(value));assert.equal(db.writes,1);
  const projectionWrites=db.projectionWrites,replay=await handleSyncV5(db,identity,'POST',url('/operations'),{scope:'cue',deviceId,operations:[operation]},['cue']);
  assert.equal(replay.applied[0].operationId,id);assert.equal(db.writes,1);
  assert.equal(replay.projectionBuildMs,0);assert.equal(db.projectionWrites,projectionWrites);
  const stale={...operation,id:randomUUID(),value:{id:'cue-1',prompt:'stale'}};
  const conflict=await handleSyncV5(db,identity,'POST',url('/operations'),{scope:'cue',deviceId,operations:[stale]},['cue']);
  assert.deepEqual(conflict.conflicts[0].value,value);assert.equal(conflict.conflicts[0].revision,1);assert.equal(db.writes,1);
});

test('empty Schedule bootstrap defers the legacy projection until revision one',async()=>{
  const db=database();
  const manifest=await handleSyncV5(db,identity,'GET',url('/manifest','?scope=cue'),null,['cue']);
  assert.deepEqual(manifest.records,[]);
  assert.equal(db.calls.some(call=>call.sql.startsWith('INSERT INTO public.legacy_sync_data')),false);
  const initialHead=db.calls.find(call=>call.sql.startsWith('INSERT INTO public.sync_v5_projection_heads'));
  assert.equal(initialHead.params[1],0);

  const operation={id:randomUUID(),scope:'cue',recordId:'cues:first-cue',baseRevision:0,baseHash:null,
    value:{id:'first-cue',prompt:'Recall'},deleted:false,clientUpdatedAt:new Date().toISOString()};
  const result=await handleSyncV5(db,identity,'POST',url('/operations'),{scope:'cue',deviceId:randomUUID(),operations:[operation]},['cue']);
  const legacyInsert=db.calls.find(call=>call.sql.startsWith('INSERT INTO public.legacy_sync_data'));
  assert.ok(legacyInsert,'first mutation creates the v4 compatibility row');
  assert.equal(legacyInsert.params[1],1,'legacy revisions must satisfy the database CHECK constraint');
  assert.equal(result.applied[0].revision,1);
});

test('initialized scopes skip the legacy Schedule and full-record scan during bootstrap',async()=>{
  const db=database(),deviceId=randomUUID(),largeLegacy={legacyHistory:'x'.repeat(200_000)};
  db.legacySchedule={storage_value:largeLegacy,revision:5,content_hash:hash(largeLegacy),deleted_at:null,updated_at:new Date().toISOString()};
  db.heads.set(`${identity.sub}:cue`,1);
  const operation={id:randomUUID(),scope:'cue',recordId:'cues:cue-1',baseRevision:0,baseHash:null,
    value:{id:'cue-1',prompt:'Recall'},deleted:false,clientUpdatedAt:new Date().toISOString()};
  const result=await handleSyncV5(db,identity,'POST',url('/operations'),{scope:'cue',deviceId,operations:[operation]},['cue']);
  assert.equal(result.applied.length,1);
  assert.equal(db.queries.filter(sql=>sql.startsWith('SELECT storage_value,revision,content_hash,deleted_at,updated_at FROM public.legacy_sync_data')).length,1);
  assert.equal(db.queries.filter(sql=>sql.startsWith('SELECT scope,record_id,value,deleted_at FROM public.sync_v5_records')).length,1);
  assert.ok(Buffer.byteLength(JSON.stringify(largeLegacy))>200_000);
});

test('single-resource writes do not resend the full legacy Schedule as SQL parameters',async()=>{
  const db=database(),deviceId=randomUUID(),largeLegacy={legacyHistory:'private-'.repeat(30_000),featureGate:{enabled:false}};
  db.legacySchedule={storage_value:largeLegacy,revision:5,content_hash:hash(largeLegacy),deleted_at:null,updated_at:new Date().toISOString()};
  db.heads.set(`${identity.sub}:cue`,1);
  const operation={id:randomUUID(),scope:'cue',recordId:'cues:cue-1',baseRevision:0,baseHash:null,
    value:{id:'cue-1',prompt:'Recall'},deleted:false,clientUpdatedAt:new Date().toISOString()};
  const result=await handleSyncV5(db,identity,'POST',url('/operations'),{scope:'cue',deviceId,operations:[operation]},['cue']);
  const projectionUpdate=db.calls.find(call=>call.sql.startsWith('UPDATE public.legacy_sync_data SET revision='));
  assert.ok(projectionUpdate,'existing compatibility row should be updated in place');
  assert.ok(projectionUpdate.params.every(value=>typeof value!=='string'||Buffer.byteLength(value)<1024));
  assert.equal(db.calls.some(call=>call.sql.startsWith('INSERT INTO public.legacy_sync_data')),false);
  assert.deepEqual(db.legacySchedule.storage_value,largeLegacy,'the v4 storage body remains byte-for-byte logically unchanged');
  const projected=await readScheduleProjection(db,identity.sub);
  assert.equal(db.legacySchedule.content_hash,hash(projected.value),'legacy hash still describes the reconstructed v4 Schedule body');
  assert.ok(Buffer.byteLength(JSON.stringify(largeLegacy))>200_000);
  assert.equal(result.projectionStorageInsertBytes,0);
});

test('SQL parameter byte estimation counts UTF-8 without exposing parameter values',()=>{
  const secret='学习内容-'.repeat(20_000),estimated=estimateSqlParameterBytes(['SELECT $1',[secret,Buffer.from([1,2,3]),null,42]]);
  assert.equal(estimated,Buffer.byteLength(secret)+3+4+2);
  assert.equal(JSON.stringify({sqlParameterBytes:estimated}).includes(secret),false);
});

test('v5 rejects resource IDs that belong to another scope',async()=>{
  const operation={id:randomUUID(),scope:'cue',recordId:'timetable:%24value',baseRevision:0,baseHash:null,value:{},deleted:false,clientUpdatedAt:new Date().toISOString()};
  await assert.rejects(handleSyncV5(database(),identity,'POST',url('/operations'),{scope:'cue',deviceId:randomUUID(),operations:[operation]},['cue']),{status:400,code:'V5_RESOURCE_SCOPE_MISMATCH'});
});

test('v5 mutations cannot remove immutable practice evidence',async()=>{
  const db=database(),diagnosis={id:'diagnosis-1',originalAnswer:'submitted',sourceRecordId:'record-1',sourceSessionId:'session-1',sourceQuestionId:'question-1',reviews:[],events:[]};
  db.records.set('examDiagnoses:$order',{user_id:identity.sub,scope:'practice',record_id:'examDiagnoses:$order',revision:1,content_hash:hash(['diagnosis-1']),value:['diagnosis-1'],deleted_at:null,updated_at:new Date().toISOString()});
  db.records.set('examDiagnoses:diagnosis-1',{user_id:identity.sub,scope:'practice',record_id:'examDiagnoses:diagnosis-1',revision:1,content_hash:hash(diagnosis),value:diagnosis,deleted_at:null,updated_at:new Date().toISOString()});
  db.heads.set(`${identity.sub}:practice`,0);
  const operation={id:randomUUID(),scope:'practice',recordId:'examDiagnoses:diagnosis-1',baseRevision:1,baseHash:hash(diagnosis),value:null,deleted:true,clientUpdatedAt:new Date().toISOString()};
  await assert.rejects(handleSyncV5(db,identity,'POST',url('/operations'),{scope:'practice',deviceId:randomUUID(),operations:[operation]},['practice']),{status:409,code:'SCHEDULE_EVIDENCE_IMMUTABLE'});
});

test('Azure container allowlist includes the shared v5 resource model dependency',async()=>{
  const dockerfile=await readFile(new URL('../Dockerfile',import.meta.url),'utf8'),ignore=await readFile(new URL('../Dockerfile.dockerignore',import.meta.url),'utf8');
  assert.match(dockerfile,/src\/lib\/sync\/resource-model\.ts/);assert.match(ignore,/!src\/lib\/sync\/resource-model\.ts/);
});

test('scope rollout is account-wide and rejects unenabled resource scopes',async()=>{
  const db=database();
  await assert.rejects(handleSyncV5(db,identity,'GET',url('/manifest','?scope=cue'),null,['learning']),{status:404,code:'SYNC_V5_SCOPE_UNAVAILABLE'});
});

test('manifest and changes can page a single resource field without consuming another field',async()=>{
  const db=database(),user=identity.sub,now=new Date().toISOString();
  for(const [scope,record_id,value,sequence] of [
    ['cue','cues:cue-1',{id:'cue-1'},1],['cue','cueReviews:cue-1:1',{cueId:'cue-1'},2],
  ]){
    db.records.set(record_id,{user_id:user,scope,record_id,revision:1,content_hash:hash(value),value,deleted_at:null,updated_at:now});
    db.changes.push({user_id:user,scope,sequence,record_id});
  }
  db.heads.set(`${user}:cue`,2);
  const manifest=await handleSyncV5(db,identity,'GET',url('/manifest','?scope=cue&field=cues'),null,['cue']);
  assert.deepEqual(manifest.records.map(row=>row.recordId),['cues:cue-1']);
  const changes=await handleSyncV5(db,identity,'GET',url('/changes','?scope=cue&field=cues&cursor=0'),null,['cue']);
  assert.deepEqual(changes.records.map(row=>row.recordId),['cues:cue-1']);assert.equal(changes.cursor,2);
  await assert.rejects(handleSyncV5(db,identity,'GET',url('/manifest','?scope=cue&field=timetable'),null,['cue']),{status:400,code:'INVALID_RESOURCE_FIELD'});
});

test('workspace bootstrap migrates eligible legacy keys with hashes, tombstones, ownership and idempotency',async()=>{
  const db=database(),now='2026-10-26T00:00:00.000Z',foreignUser=randomUUID();
  db.legacyRows=[
    {user_id:identity.sub,storage_key:'jackyun_goal_data',storage_value:{goals:[{id:'goal-1'}]},revision:7,deleted_at:null,updated_at:now},
    {user_id:identity.sub,storage_key:'jackyun_theme',storage_value:null,revision:3,deleted_at:now,updated_at:now},
    {user_id:identity.sub,storage_key:'jackyun-ai-config',storage_value:{apiKey:'must-not-sync'},revision:5,deleted_at:null,updated_at:now},
    {user_id:foreignUser,storage_key:'jackyun_goal_data',storage_value:{goals:[{id:'foreign'}]},revision:2,deleted_at:null,updated_at:now},
  ];
  const learning=await handleSyncV5(db,identity,'GET',url('/manifest','?scope=workspace&field=legacyGoals'),null,['workspace']);
  const setting=await handleSyncV5(db,identity,'GET',url('/manifest','?scope=workspace&field=legacySettings'),null,['workspace']);
  assert.equal(learning.records.length,1);assert.equal(learning.records[0].revision,7);
  assert.equal(learning.records[0].contentHash,hash({goals:[{id:'goal-1'}]}));
  assert.equal(setting.records.length,1);assert.equal(setting.records[0].revision,3);
  assert.equal(setting.records[0].deleted,true);assert.equal(setting.records[0].contentHash,createHash('sha256').update('__deleted__').digest('hex'));
  assert.equal(db.records.size,2,'credentials and rows belonging to other users are excluded');
  const inserted=db.writes;
  await handleSyncV5(db,identity,'GET',url('/manifest','?scope=workspace&field=legacyGoals'),null,['workspace']);
  assert.equal(db.writes,inserted,'repeat bootstrap must not duplicate resources');

  const recordId=legacyWorkspaceRecordId('jackyun_theme');
  const operation={id:randomUUID(),scope:'workspace',recordId,baseRevision:3,baseHash:createHash('sha256').update('__deleted__').digest('hex'),
    value:'dark',deleted:false,clientUpdatedAt:now};
  const beforeProjectionWrites=db.projectionWrites;
  const write=await handleSyncV5(db,identity,'POST',url('/operations'),{scope:'workspace',deviceId:randomUUID(),operations:[operation]},['workspace']);
  assert.equal(write.applied[0].revision,4);
  assert.equal(db.projectionWrites,beforeProjectionWrites,'workspace writes must not rebuild the Schedule projection');
  assert.equal(db.legacySchedule,null,'workspace writes must not create a legacy Schedule row');
  const legacy=db.legacyRows.find(row=>row.user_id===identity.sub&&row.storage_key==='jackyun_theme');
  assert.equal(legacy.storage_value,'dark');assert.equal(legacy.revision,4);assert.equal(legacy.deleted_at,null);
  assert.equal(legacy.content_hash,createHash('sha256').update(canonicalJson('dark')).digest('hex'));
  assert.deepEqual(db.v4Changes.at(-1),{user_id:identity.sub,sequence:1,storage_key:'jackyun_theme'});
});

test('personal site workspace domain accepts stable UUID records and page-filtered manifests',async()=>{
  const db=database(),siteId='9b775b2b-8a3f-4a6d-b2c7-0f8a89e14c31';
  const key=`jackyun_personal_site_v1:${siteId}`,value={id:siteId,name:'Study',schemaVersion:1,theme:'light',blocks:[],updatedAt:'2026-10-27T00:00:00.000Z'};
  db.legacyRows=[{user_id:identity.sub,storage_key:key,storage_value:value,revision:2,deleted_at:null,updated_at:value.updatedAt}];
  const manifest=await handleSyncV5(db,identity,'GET',url('/manifest','?scope=workspace&field=legacyPersonalSites'),null,['workspace']);
  assert.equal(manifest.records.length,1);
  assert.equal(manifest.records[0].recordId,legacyWorkspaceRecordId(key));
  const record=await handleSyncV5(db,identity,'GET',url('/records',`?scope=workspace&id=${encodeURIComponent(legacyWorkspaceRecordId(key))}`),null,['workspace']);
  assert.deepEqual(record.records[0].value,value);
});

test('disabling the v5 write allowlist preserves the v4 projection bridge',async()=>{
  const db=database(),deviceId=randomUUID(),id=randomUUID(),value={id:'cue-1',prompt:'Recall'};
  const operation={id,scope:'cue',recordId:'cues:cue-1',baseRevision:0,baseHash:null,value,deleted:false,clientUpdatedAt:new Date().toISOString()};
  await handleSyncV5(db,identity,'POST',url('/operations'),{scope:'cue',deviceId,operations:[operation]},['cue']);
  assert.deepEqual(syncV5Rollout(identity),[]);
  assert.deepEqual(await scheduleProjectionState(db,identity.sub,[]),['cue']);
});

test('v4 projection applies v5 updates and tombstones to unknown root fields',async()=>{
  const base={schemaVersion:1,featureGate:{enabled:false},retiredField:'old'};
  const rows=[{scope:'settings',record_id:'__root:value',value:{schemaVersion:1,featureGate:{enabled:true}},deleted_at:null}];
  const client={async query(sql){
    if(sql.startsWith('SELECT storage_value,revision,content_hash,deleted_at,updated_at FROM public.legacy_sync_data'))return {rows:[{storage_value:base,revision:7,content_hash:null,deleted_at:null}]};
    if(sql.startsWith('SELECT revision,content_hash,updated_at FROM public.sync_v5_projection_heads'))return {rows:[]};
    if(sql.startsWith('SELECT scope,record_id,value,deleted_at FROM public.sync_v5_records'))return {rows};
    throw new Error(`Unexpected SQL: ${sql}`);
  }};
  const updated=await readScheduleProjection(client,identity.sub);
  assert.deepEqual(updated.value,{schemaVersion:1,featureGate:{enabled:true}});
  rows[0]={...rows[0],value:null,deleted_at:new Date()};
  const deleted=await readScheduleProjection(client,identity.sub);
  assert.deepEqual(deleted.value,{schemaVersion:1});
  assert.equal(deleted.projectionRecordCount,1);
});
