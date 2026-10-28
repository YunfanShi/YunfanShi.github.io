import assert from 'node:assert/strict';
import test from 'node:test';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {accountSyncStore,acknowledgeV5Operations,acknowledgeV5RestoreTargets,acknowledgeV5WorkspaceOperations,commitV5ResourcePage,commitV5WorkspacePage,getDocuments,getOutbox,getV5Conflicts,getV5Cursor,getV5Outbox,getV5Resources,getV5RestoreTargets,openDatabase,prepareV5WorkspaceAuthority,queueV5ResourceDeletion,queueV5ResourceOperation,queueV5RestoreTargets,resolveV5ConflictLocally,resolveV5ConflictRemotely,setV5Cursor,type V5ResourceConflict} from '../src/lib/sync/outbox.ts';
import {createV5ResourceSync,resourceFieldsForPath,retainV5ScheduleAuthority} from '../src/lib/sync/resource-engine.ts';
import {legacyWorkspaceRecordId,resourceFieldsForScope,resourceTargetsForStorageKeys} from '../src/lib/sync/resource-model.ts';
import {canonicalJson} from '../src/lib/sync/hash.ts';
import {SYNC_V5_SCOPES} from '../src/lib/sync/resource-model.ts';
import {WRITING_COLLECTIONS,writingItemKey,writingMarkerKey} from '../src/lib/sync/writing-resource-model.ts';
import {createHash} from 'node:crypto';

Object.assign(globalThis,{indexedDB:new IDBFactory()});
const id=()=>`v5-client-${crypto.randomUUID()}`;

test('writing removals queue only item tombstones from an active, present editor projection',async()=>{
  const collection=WRITING_COLLECTIONS[2],removed=legacyWorkspaceRecordId(writingItemKey(collection,'removed'))!;
  for(const variant of ['active','missing','inactive','null'] as const){
    const databaseScope=id(),db=await openDatabase(databaseScope);
    try{await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(['documents','v5Resources','v5FieldCursors'],'readwrite');
      if(variant!=='missing')tx.objectStore('documents').put({key:collection.legacyKey,value:variant==='null'?null:'[]',writingProjection:variant!=='inactive',updatedAt:1});
      for(const recordId of [removed,legacyWorkspaceRecordId(collection.legacyKey)!,legacyWorkspaceRecordId(writingMarkerKey(collection))!]){
        tx.objectStore('v5Resources').put({scope:'workspace',recordId,revision:2,contentHash:'a'.repeat(64),deleted:false,value:{id:'removed'},updatedAt:'now'});
      }
      tx.objectStore('v5FieldCursors').put({scope:'workspace',field:collection.field,mode:'changes',after:'',cursor:2,head:2});
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });}finally{db.close();}
    const engine=createV5ResourceSync({databaseScope,request:async url=>{
      if(url==='/api/sync/v5')return Response.json({capabilities:{v5:true,writingCollections:true},scopes:['workspace']});
      throw Error('pause after capture');
    },deviceId:async()=>crypto.randomUUID(),uuid:()=>crypto.randomUUID(),readSchedule:()=>null,readWorkspace:()=>getDocuments(databaseScope),projectSchedule:async()=>{},setAuthority:()=>{}});
    await assert.rejects(engine.synchronize([{scope:'workspace',field:collection.field}]),/pause after capture/);
    const queued=await getV5Outbox('workspace',databaseScope);
    assert.equal(queued.length,variant==='active'?1:0,variant);
    if(variant==='active'){
      assert.equal(queued[0].recordId,removed);
      assert.equal(queued[0].deleted,true);assert.equal(queued[0].value,null);
      assert.equal(queued[0].baseRevision,2);assert.equal(queued[0].baseHash,'a'.repeat(64));
    }
  }
});

async function seed(dbName:string,value:string){
  const db=await openDatabase(dbName);try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({key:'jackyun_schedule_control_v1',value,updatedAt:0});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}
}

test('long review IDs use bounded encoded URLs and failed baselines resume committed pages',async()=>{
  const databaseScope=id(),items=Array.from({length:103},(_,index)=>{
    const value={id:`${String(index).padStart(3,'0')}-${'long-review-id:'.repeat(10)}`,prompt:'review'};
    return {scope:'cue',recordId:`cueReviews:${encodeURIComponent(value.id)}`,revision:1,contentHash:createHash('sha256').update(canonicalJson(value)).digest('hex'),deleted:false,updatedAt:'now',value};
  });
  const order=items.map(row=>row.value.id);
  const records=[{scope:'cue',recordId:'cueReviews:%24order',revision:1,contentHash:createHash('sha256').update(canonicalJson(order)).digest('hex'),deleted:false,updatedAt:'now',value:order},...items];
  const firstAfter:string[]=[],urls:string[]=[];let fail=true,raw:string|null=null;
  const engine=createV5ResourceSync({databaseScope,readSchedule:()=>raw,projectSchedule:async value=>{raw=value;},setAuthority:()=>{},deviceId:async()=>crypto.randomUUID(),uuid:()=>crypto.randomUUID(),request:async url=>{
    const parsed=new URL(url,'https://test.invalid');
    if(parsed.pathname==='/api/sync/v5')return Response.json({capabilities:{v5:true},scopes:['cue']});
    if(parsed.pathname.endsWith('/manifest')){
      const after=parsed.searchParams.get('after')!;firstAfter.push(after);
      if(after&&fail){fail=false;throw Error('interrupted after committed page');}
      const page=records.filter(row=>row.recordId>after).slice(0,100);
      return Response.json({syncProtocol:5,records:page.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=='value'))),head:103,next:page.length===100?page.at(-1)!.recordId:null});
    }
    if(parsed.pathname.endsWith('/records')){urls.push(url);assert.ok(url.length<=3500);return Response.json({syncProtocol:5,records:records.filter(row=>parsed.searchParams.getAll('id').includes(row.recordId))});}
    if(parsed.pathname.endsWith('/changes'))return Response.json({syncProtocol:5,records:[],cursor:103,head:103,hasMore:false});
    throw Error(`unexpected ${url}`);
  }});
  await assert.rejects(engine.synchronize([{scope:'cue',field:'cueReviews'}]),/interrupted/);
  assert.equal((await getV5Cursor('cue',databaseScope,'cueReviews'))?.mode,'baseline');
  await engine.synchronize([{scope:'cue',field:'cueReviews'}]);
  assert.equal(firstAfter.filter(after=>after==='').length,1);
  assert.ok(urls.length>2);assert.equal(JSON.parse(raw!).cueReviews.length,103);
  assert.equal((await getV5Cursor('cue',databaseScope,'cueReviews'))?.cursor,103);
});

test('NULL or missing local Schedule fields rehydrate verified resources on an empty changes response without deleting cloud data',async()=>{
  for(const cleared of [null,'null','{}']){
    const databaseScope=id(),value={id:'cloud-cue',prompt:'latest confirmed cloud'};
    await commitV5ResourcePage('cue',[
      {scope:'cue',recordId:'cues:%24order',revision:1,contentHash:'a'.repeat(64),deleted:false,updatedAt:'now',value:['cloud-cue']},
      {scope:'cue',recordId:'cues:cloud-cue',revision:1,contentHash:'b'.repeat(64),deleted:false,updatedAt:'now',value}
    ],{scope:'cue',field:'cues',mode:'changes',after:'',cursor:2,head:2},databaseScope);
    if(cleared!==null)await seed(databaseScope,cleared);
    else {const db=await openDatabase(databaseScope);try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({key:'jackyun_schedule_control_v1',value:null});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
    let raw=cleared,writes=0;
    const engine=createV5ResourceSync({databaseScope,readSchedule:()=>raw,projectSchedule:async value=>{raw=value;},setAuthority:()=>{},deviceId:async()=>crypto.randomUUID(),uuid:()=>crypto.randomUUID(),request:async(url,init)=>{
      if(init?.method==='POST')writes++;
      if(url==='/api/sync/v5')return Response.json({capabilities:{v5:true},scopes:['cue']});
      if(url.startsWith('/api/sync/v5/changes'))return Response.json({syncProtocol:5,records:[],cursor:2,head:2,hasMore:false});
      throw Error(`unexpected ${url}`);
    }});
    await engine.synchronize([{scope:'cue',field:'cues'}]);
    assert.deepEqual(JSON.parse(raw!).cues,[value]);assert.equal(writes,0);assert.deepEqual(await getV5Outbox('cue',databaseScope),[]);
  }
});

test('saved v5 cursor with missing local answer-progress bodies forces a baseline download',async()=>{
  const databaseScope=id(),field='practiceSessions',scope='timer' as const;
  const answer={id:'answer-1',result:'correct',selectedAnswer:'B'},session={id:'session-1',questions:[answer]};
  const values=[['practiceSessions:%24order',['session-1']],['practiceSessions:session-1',session]] as const;
  const hash=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
  const remote=values.map(([recordId,value])=>({scope,recordId,revision:1,contentHash:hash(value),deleted:false,updatedAt:'now',value}));
  const database=await openDatabase(databaseScope);
  try{await new Promise<void>((resolve,reject)=>{
    const tx=database.transaction('v5FieldCursors','readwrite');
    tx.objectStore('v5FieldCursors').put({scope,field,mode:'changes',after:'',cursor:2,head:2,resourceCount:2});
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });}finally{database.close();}

  let scheduleRaw='{}';const requests:string[]=[];
  const engine=createV5ResourceSync({databaseScope,readSchedule:()=>scheduleRaw,projectSchedule:async value=>{if(value!==null)scheduleRaw=value;},setAuthority:()=>{},
    deviceId:async()=>crypto.randomUUID(),uuid:()=>crypto.randomUUID(),request:async url=>{
      const parsed=new URL(url,'https://sync.test');requests.push(parsed.pathname);
      if(parsed.pathname==='/api/sync/v5')return Response.json({capabilities:{v5:true},scopes:['timer']});
      if(parsed.pathname==='/api/sync/v5/manifest')return Response.json({syncProtocol:5,records:remote.map(row=>({scope:row.scope,recordId:row.recordId,revision:row.revision,contentHash:row.contentHash,deleted:row.deleted,updatedAt:row.updatedAt})),next:null,head:2});
      if(parsed.pathname==='/api/sync/v5/records')return Response.json({syncProtocol:5,records:remote.filter(row=>parsed.searchParams.getAll('id').includes(row.recordId))});
      if(parsed.pathname==='/api/sync/v5/changes')return Response.json({syncProtocol:5,records:[],cursor:2,head:2,hasMore:false});
      throw Error(`unexpected ${parsed.pathname}`);
    }});

  await engine.synchronize([{scope,field}]);
  assert.ok(requests.includes('/api/sync/v5/manifest'));
  assert.ok(requests.includes('/api/sync/v5/records'));
  assert.deepEqual(JSON.parse(scheduleRaw).practiceSessions,[session]);
  assert.equal(JSON.parse(scheduleRaw).practiceSessions[0].questions[0].result,'correct');
  assert.equal((await getV5Cursor(scope,databaseScope,field))?.resourceCount,2);
});

test('empty local collections do not become cloud delete-all operations',async()=>{
  const cases=[
    {field:'cues',scope:'cue' as const,empty:[],values:[{id:'cloud-cue',prompt:'verified cloud item'}]},
    {field:'completions',scope:'learning' as const,empty:{},values:{'task-1':{completed:true}}},
    {field:'cueStudyDrafts',scope:'cue' as const,empty:{},values:{'subject-1':{id:'draft-1',task:{key:'task-1'}}}},
  ];
  for(const item of cases){
    const databaseScope=id(),hash=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
    const recordRows=item.field==='cues'
      ? [{recordId:'cues:%24order',value:['cloud-cue']},{recordId:'cues:cloud-cue',value:item.values[0]}]
      : item.field==='completions'
        ? [{recordId:'completions:%24keys',value:['task-1']},{recordId:'completions:task-1',value:{completed:true}}]
        : [{recordId:'cueStudyDrafts:%24keys',value:['subject-1']},{recordId:'cueStudyDrafts:subject-1',value:{id:'draft-1',task:{key:'task-1'}}}];
    await commitV5ResourcePage(item.scope,recordRows.map(row=>({scope:item.scope,recordId:row.recordId,revision:1,contentHash:hash(row.value),deleted:false,updatedAt:'now',value:row.value})),
      {scope:item.scope,field:item.field,mode:'changes',after:'',cursor:2,head:2},databaseScope);
    const raw=JSON.stringify({schemaVersion:1,[item.field]:item.empty});await seed(databaseScope,raw);
    let projected=raw,writes=0;
    const engine=createV5ResourceSync({databaseScope,request:async(url,init)=>{
      if(init?.method==='POST'){writes++;throw Error('empty local cache must not write to cloud');}
      const parsed=new URL(url,'https://sync.test');
      if(parsed.pathname==='/api/sync/v5')return Response.json({syncProtocol:5,capabilities:{v5:true},scopes:[item.scope]});
      if(parsed.pathname==='/api/sync/v5/changes')return Response.json({syncProtocol:5,records:[],cursor:2,head:2,hasMore:false});
      throw Error(`Unexpected request ${parsed.pathname}`);
    },deviceId:async()=>'00000000-0000-4000-8000-000000000001',readSchedule:()=>projected,projectSchedule:async value=>{if(value!==null)projected=value;},setAuthority:()=>{},uuid:()=>crypto.randomUUID()});
    await engine.synchronize([{scope:item.scope,field:item.field}]);
    const restored=JSON.parse(projected!);
    assert.deepEqual(restored[item.field],item.values);
    assert.equal(writes,0);assert.deepEqual(await getV5Outbox(item.scope,databaseScope),[]);
  }
});

test('confirmed removal of the last CUE study draft remains queued with an empty draft map',async()=>{
  const databaseScope=id(),recordId='cueStudyDrafts:subject-1',draft={id:'draft-1',task:{key:'task-1'}},hash=createHash('sha256').update(canonicalJson(draft)).digest('hex');
  await commitV5ResourcePage('cue',[{scope:'cue',recordId,revision:4,contentHash:hash,deleted:false,updatedAt:'now',value:draft}],
    {scope:'cue',field:'cueStudyDrafts',mode:'changes',after:'',cursor:8,head:8},databaseScope);
  assert.equal(await queueV5ResourceDeletion('cue',recordId,crypto.randomUUID(),databaseScope),true);
  const raw=JSON.stringify({schemaVersion:1,cueStudyDrafts:{}});await seed(databaseScope,raw);
  const engine=createV5ResourceSync({databaseScope,readSchedule:()=>raw,projectSchedule:async()=>{},setAuthority:()=>{},deviceId:async()=>crypto.randomUUID(),uuid:()=>crypto.randomUUID(),request:async url=>{
    const parsed=new URL(url,'https://sync.test');
    if(parsed.pathname==='/api/sync/v5')return Response.json({syncProtocol:5,capabilities:{v5:true},scopes:['cue']});
    throw Error('stop after explicit draft intent is preserved');
  }});
  await assert.rejects(engine.synchronize([{scope:'cue',field:'cueStudyDrafts'}]),/stop after explicit draft intent/);
  const queued=await getV5Outbox('cue',databaseScope);assert.equal(queued.length,1);assert.equal(queued[0].recordId,recordId);assert.equal(queued[0].deleted,true);
});

test('first v5 baseline treats an empty local collection as cache, not competing user intent',async()=>{
  const databaseScope=id(),value={id:'cloud-cue',prompt:'verified cloud item'},hash=(item:unknown)=>createHash('sha256').update(canonicalJson(item)).digest('hex');
  const records=[
    {scope:'cue',recordId:'cues:%24order',revision:1,contentHash:hash(['cloud-cue']),deleted:false,updatedAt:'now',value:['cloud-cue']},
    {scope:'cue',recordId:'cues:cloud-cue',revision:1,contentHash:hash(value),deleted:false,updatedAt:'now',value},
  ];
  const raw=JSON.stringify({schemaVersion:1,cues:[]});await seed(databaseScope,raw);let projected=raw,writes=0;
  const engine=createV5ResourceSync({databaseScope,request:async(url,init)=>{
    if(init?.method==='POST'){writes++;throw Error('baseline must not infer a write');}
    const parsed=new URL(url,'https://sync.test');
    if(parsed.pathname==='/api/sync/v5')return Response.json({syncProtocol:5,capabilities:{v5:true},scopes:['cue']});
    if(parsed.pathname==='/api/sync/v5/manifest')return Response.json({syncProtocol:5,records:records.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=='value'))),next:null,head:2});
    if(parsed.pathname==='/api/sync/v5/records')return Response.json({syncProtocol:5,records:parsed.searchParams.getAll('id').map(recordId=>records.find(row=>row.recordId===recordId))});
    if(parsed.pathname==='/api/sync/v5/changes')return Response.json({syncProtocol:5,records:[],cursor:2,head:2,hasMore:false});
    throw Error(`Unexpected request ${parsed.pathname}`);
  },deviceId:async()=>'00000000-0000-4000-8000-000000000001',readSchedule:()=>projected,projectSchedule:async value=>{if(value!==null)projected=value;},setAuthority:()=>{},uuid:()=>crypto.randomUUID()});
  await engine.synchronize([{scope:'cue',field:'cues'}]);
  assert.deepEqual(JSON.parse(projected!).cues,[value]);assert.equal(writes,0);
  assert.deepEqual(await getV5Outbox('cue',databaseScope),[]);assert.deepEqual(await getV5Conflicts(databaseScope),[]);
});

test('confirmed deletion of the last Cue queues an atomic tombstone while empty-cache capture stays protected',async()=>{
  const databaseScope=id(),cue={id:'last-cue',prompt:'delete me'},hash=createHash('sha256').update(canonicalJson(cue)).digest('hex');
  await commitV5ResourcePage('cue',[{scope:'cue',recordId:'cues:last-cue',revision:7,contentHash:hash,deleted:false,updatedAt:'now',value:cue}],
    {scope:'cue',field:'cues',mode:'changes',after:'',cursor:12,head:12},databaseScope);
  const queued=await queueV5ResourceDeletion('cue','cues:last-cue',crypto.randomUUID(),databaseScope);
  assert.equal(queued,true);
  const operation=(await getV5Outbox('cue',databaseScope))[0];
  assert.equal(operation.deleted,true);assert.equal(operation.value,null);assert.equal(operation.baseRevision,7);assert.equal(operation.baseHash,hash);
  assert.equal((await getV5Resources('cue',databaseScope)).find(row=>row.recordId==='cues:last-cue')?.deleted,false,'the confirmed base remains intact until the server receipt');

  const raw=JSON.stringify({schemaVersion:1,cues:[]});await seed(databaseScope,raw);
  const engine=createV5ResourceSync({databaseScope,readSchedule:()=>raw,projectSchedule:async()=>{},setAuthority:()=>{},deviceId:async()=>crypto.randomUUID(),uuid:()=>crypto.randomUUID(),request:async()=>{
    throw Error('stop after local change capture');
  }});
  await assert.rejects(engine.synchronize([{scope:'cue',field:'cues'}]),/stop after local change capture/);
  assert.deepEqual((await getV5Outbox('cue',databaseScope)).map(row=>({recordId:row.recordId,deleted:row.deleted})),[{recordId:'cues:last-cue',deleted:true}],
    'an empty Schedule projection must not erase explicit deletion intent or infer additional deletions');
});

test('confirmed Cue deletion does not discard an unresolved conflict',async()=>{
  const databaseScope=id(),operationId=crypto.randomUUID(),recordId='cues:conflicted';
  const db=await openDatabase(databaseScope);try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['v5Resources','v5Conflicts'],'readwrite');
    tx.objectStore('v5Resources').put({scope:'cue',recordId,revision:2,contentHash:'b'.repeat(64),deleted:false,updatedAt:'now',value:{id:'conflicted'}});
    tx.objectStore('v5Conflicts').put({operationId,scope:'cue',recordId,baseRevision:1,baseHash:'a'.repeat(64),localValue:{id:'conflicted'},localDeleted:false,remoteValue:{id:'conflicted'},remoteDeleted:false,remoteRevision:2,remoteHash:'b'.repeat(64),createdAt:'now'} satisfies V5ResourceConflict);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}
  await assert.rejects(queueV5ResourceDeletion('cue',recordId,crypto.randomUUID(),databaseScope),/请先处理冲突/);
  assert.deepEqual(await getV5Outbox('cue',databaseScope),[]);assert.equal((await getV5Conflicts(databaseScope)).length,1);
});

test('removing one item from a populated Schedule collection still queues only that item deletion',async()=>{
  const databaseScope=id(),hash=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
  const cloud=[{id:'keep',prompt:'keep'},{id:'remove',prompt:'remove'}],records=[
    {recordId:'cues:%24order',value:['keep','remove']},...cloud.map(value=>({recordId:`cues:${value.id}`,value})),
  ];
  await commitV5ResourcePage('cue',records.map(row=>({scope:'cue' as const,recordId:row.recordId,revision:1,contentHash:hash(row.value),deleted:false,updatedAt:'now',value:row.value})),
    {scope:'cue',field:'cues',mode:'changes',after:'',cursor:3,head:3},databaseScope);
  const raw=JSON.stringify({schemaVersion:1,cues:[cloud[0]]});await seed(databaseScope,raw);
  const engine=createV5ResourceSync({databaseScope,request:async url=>{
    const parsed=new URL(url,'https://sync.test');
    if(parsed.pathname==='/api/sync/v5')return Response.json({syncProtocol:5,capabilities:{v5:true},scopes:['cue']});
    throw Error('pause after local changes are captured');
  },deviceId:async()=>'00000000-0000-4000-8000-000000000001',readSchedule:()=>raw,projectSchedule:async()=>{},setAuthority:()=>{},uuid:()=>crypto.randomUUID()});
  await assert.rejects(engine.synchronize([{scope:'cue',field:'cues'}]),/pause after local changes/);
  const queued=await getV5Outbox('cue',databaseScope);
  assert.deepEqual(queued.filter(operation=>operation.deleted).map(operation=>operation.recordId),['cues:remove']);
});

test('v5 resource values, merged Schedule and page cursor commit in one IndexedDB transaction',async()=>{
  const dbName=id();await seed(dbName,JSON.stringify({schemaVersion:1,cues:[{id:'cue-1',prompt:'old'}],manualTasks:[{id:'task-1'}]}));
  const projected=await commitV5ResourcePage('cue',[{scope:'cue',recordId:'cues:$order',revision:1,contentHash:'c'.repeat(64),deleted:false,updatedAt:'2026-10-25T00:00:00Z',value:['cue-1']},{scope:'cue',recordId:'cues:cue-1',revision:2,contentHash:'a'.repeat(64),deleted:false,updatedAt:'2026-10-25T00:00:00Z',value:{id:'cue-1',prompt:'new'}}],
    {scope:'cue',mode:'changes',after:'',cursor:8,head:8},dbName);
  assert.deepEqual(JSON.parse(projected!),{schemaVersion:1,cues:[{id:'cue-1',prompt:'new'}],manualTasks:[{id:'task-1'}]});
  assert.equal((await getV5Cursor('cue',dbName))?.cursor,8);
  assert.equal((await getV5Resources('cue',dbName)).find(row=>row.recordId==='cues:cue-1')?.revision,2);
});

test('batch conflict resolution transaction rejects a changed document without consuming conflict or intent',async()=>{
  const databaseScope=id(),raw=JSON.stringify({cues:[{id:'cue',prompt:'new edit'}]});await seed(databaseScope,raw);
  const conflict:V5ResourceConflict={operationId:crypto.randomUUID(),scope:'cue',recordId:'cues:cue',baseRevision:1,baseHash:'a'.repeat(64),localValue:{id:'cue',prompt:'reviewed'},localDeleted:false,remoteRevision:2,remoteHash:'b'.repeat(64),remoteValue:{id:'cue',prompt:'cloud'},remoteDeleted:false,createdAt:'now'};
  const db=await openDatabase(databaseScope);try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('v5Conflicts','readwrite');tx.objectStore('v5Conflicts').put(conflict);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}
  const guard={conflict,key:'jackyun_schedule_control_v1',value:'reviewed raw'};
  await assert.rejects(resolveV5ConflictLocally(conflict.operationId,crypto.randomUUID(),databaseScope,guard),/已变化/);
  await assert.rejects(resolveV5ConflictRemotely(conflict.operationId,databaseScope,guard),/已变化/);
  assert.equal((await getV5Conflicts(databaseScope)).length,1);assert.deepEqual(await getV5Outbox('cue',databaseScope),[]);assert.equal((await getDocuments(databaseScope))[0].value,raw);
});

test('all cloud refreshes a newer server conflict instead of accepting the reviewed stale snapshot',async()=>{
  const databaseScope=id(),local={id:'cue',prompt:'reviewed local'},latest={id:'cue',prompt:'new cloud'};
  const raw=JSON.stringify({cues:[local]}),hash=createHash('sha256').update(canonicalJson(latest)).digest('hex');await seed(databaseScope,raw);
  const conflict:V5ResourceConflict={operationId:crypto.randomUUID(),scope:'cue',recordId:'cues:cue',baseRevision:1,baseHash:'a'.repeat(64),localValue:local,localDeleted:false,remoteRevision:2,remoteHash:'b'.repeat(64),remoteValue:{id:'cue',prompt:'old cloud'},remoteDeleted:false,createdAt:'now'};
  const db=await openDatabase(databaseScope);try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('v5Conflicts','readwrite');tx.objectStore('v5Conflicts').put(conflict);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}
  const engine=createV5ResourceSync({databaseScope,readSchedule:()=>raw,projectSchedule:async()=>{throw Error('must not project old cloud');},setAuthority:()=>{},deviceId:async()=>crypto.randomUUID(),uuid:()=>crypto.randomUUID(),request:async()=>Response.json({syncProtocol:5,records:[{scope:'cue',recordId:'cues:cue',revision:3,contentHash:hash,deleted:false,updatedAt:'now',value:latest}]})});
  await assert.rejects(engine.resolveConflict(conflict.operationId,'remote',conflict),/云端内容又有变化/);
  const saved=(await getV5Conflicts(databaseScope))[0];assert.equal(saved.remoteRevision,3);assert.deepEqual(saved.remoteValue,latest);assert.deepEqual(saved.localValue,local);
  assert.equal((await getDocuments(databaseScope))[0].value,raw);
});

test('v5 cursor does not advance when the Schedule document cannot be safely merged',async()=>{
  const dbName=id();await seed(dbName,'not-json');
  await assert.rejects(commitV5ResourcePage('cue',[{scope:'cue',recordId:'cues:cue-1',revision:1,contentHash:'b'.repeat(64),deleted:false,updatedAt:'now',value:{id:'cue-1'}}],
    {scope:'cue',mode:'changes',after:'',cursor:1,head:1},dbName));
  assert.equal(await getV5Cursor('cue',dbName),null);
  assert.deepEqual(await getV5Resources('cue',dbName),[]);
});

test('v5 workspace baseline preserves a local document with an unacknowledged legacy outbox operation',async()=>{
  const dbName=id(),key='jackyun_definition_cards_v1',localValue=JSON.stringify({cards:[{id:'local-card'}]}),recordId=legacyWorkspaceRecordId(key)!;
  const field=recordId.slice(0,recordId.indexOf(':')),db=await openDatabase(dbName),operationId=crypto.randomUUID();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['documents','outbox'],'readwrite');
    tx.objectStore('documents').put({key,value:localValue,updatedAt:1});
    tx.objectStore('outbox').put({id:operationId,key,baseRevision:1,baseHash:'a'.repeat(64),baseValue:{cards:[{id:'base-card'}]},baseDeleted:false,
      value:{cards:[{id:'local-card'}]},deleted:false,clientUpdatedAt:'2026-10-26T00:00:00.000Z',sequence:1});
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}

  const projected=await commitV5WorkspacePage([{scope:'workspace',recordId,revision:2,contentHash:'b'.repeat(64),deleted:false,updatedAt:'now',value:{cards:[{id:'remote-card'}]}}],
    {scope:'workspace',field,mode:'changes',after:'',cursor:2,head:2},dbName);
  const check=await openDatabase(dbName);try{const state=await new Promise<{document?:{value:string|null};operations:Array<{id:string}>}>((resolve,reject)=>{
    const tx=check.transaction(['documents','outbox'],'readonly'),document=tx.objectStore('documents').get(key),outbox=tx.objectStore('outbox').getAll();
    let row:{document?:{value:string|null};operations:SyncOperation[]};document.onsuccess=()=>{row={document:document.result,operations:[]};};outbox.onsuccess=()=>{row={...row!,operations:outbox.result};};
    tx.oncomplete=()=>resolve(row!);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
    assert.deepEqual(projected,[]);
    assert.equal(state.document?.value,localValue);
    assert.deepEqual(state.operations.map(operation=>operation.id),[operationId]);
    assert.equal((await getV5Cursor('workspace',dbName,field))?.cursor,2);
  }finally{check.close();}
});

test('late workspace receipts preserve a newer resource, visible edit and replacement pending intent',async()=>{
  const dbName=id(),key='jackyun_ielts_writing_draft_v1',recordId=legacyWorkspaceRecordId(key)!;
  const sent={id:crypto.randomUUID(),scope:'workspace' as const,recordId,baseRevision:1,baseHash:'a'.repeat(64),value:{draft:'uploaded'},deleted:false,clientUpdatedAt:'old'};
  const newerRemote={draft:'newer from another device'},newerLocal={draft:'newer local edit'};
  const pending={...sent,value:newerLocal,clientUpdatedAt:'new'};
  const db=await openDatabase(dbName);try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['documents','v5Resources','v5Outbox'],'readwrite');
    tx.objectStore('documents').put({key,value:JSON.stringify(newerLocal),updatedAt:3});
    tx.objectStore('v5Resources').put({scope:'workspace',recordId,revision:3,contentHash:'c'.repeat(64),deleted:false,value:newerRemote,updatedAt:'new'});
    tx.objectStore('v5Outbox').put(pending);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });}finally{db.close();}
  await acknowledgeV5WorkspaceOperations([{operation:sent,revision:2,contentHash:'b'.repeat(64),updatedAt:'old'}],dbName);
  assert.equal((await getV5Resources('workspace',dbName))[0].revision,3);
  assert.deepEqual((await getV5Resources('workspace',dbName))[0].value,newerRemote);
  assert.deepEqual(await getV5Outbox('workspace',dbName),[pending]);
  assert.equal((await getDocuments(dbName))[0].value,JSON.stringify(newerLocal));
});

test('a failed workspace receipt transaction keeps the prior baseline and queued operation for retry',async()=>{
  const dbName=id(),key='jackyun_ielts_writing_draft_v1',recordId=legacyWorkspaceRecordId(key)!;
  const base={draft:'baseline'},value={draft:'pending edit'};
  const operation={id:crypto.randomUUID(),scope:'workspace' as const,recordId,baseRevision:1,baseHash:'a'.repeat(64),value,deleted:false,clientUpdatedAt:'now'};
  const db=await openDatabase(dbName);try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['documents','v5Resources','v5Outbox'],'readwrite');
    tx.objectStore('documents').put({key,value:JSON.stringify(value),updatedAt:1});
    tx.objectStore('v5Resources').put({scope:'workspace',recordId,revision:1,contentHash:'a'.repeat(64),deleted:false,value:base,updatedAt:'before'});
    tx.objectStore('v5Outbox').put(operation);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });}finally{db.close();}
  const applied=[{operation,revision:2,contentHash:'b'.repeat(64),updatedAt:'after'}];
  const originalDelete=IDBObjectStore.prototype.delete;
  IDBObjectStore.prototype.delete=function(keyValue:IDBValidKey|IDBKeyRange){
    if(this.name==='v5Outbox'&&keyValue===operation.id)throw Error('Injected workspace receipt delete failure');
    return originalDelete.call(this,keyValue);
  };
  try{await assert.rejects(acknowledgeV5WorkspaceOperations(applied,dbName),/Injected workspace receipt delete failure/);}
  finally{IDBObjectStore.prototype.delete=originalDelete;}
  assert.equal((await getV5Resources('workspace',dbName))[0].revision,1);
  assert.deepEqual((await getV5Resources('workspace',dbName))[0].value,base);
  assert.deepEqual(await getV5Outbox('workspace',dbName),[operation]);
  assert.equal((await getDocuments(dbName))[0].value,JSON.stringify(value));
  await acknowledgeV5WorkspaceOperations(applied,dbName);
  assert.equal((await getV5Resources('workspace',dbName))[0].revision,2);
  assert.deepEqual(await getV5Outbox('workspace',dbName),[]);
});

test('a workspace baseline conflict preserves structured local data and atomically retries a failed conflict save',async()=>{
  const dbName=id(),key='jackyun_ielts_writing_draft_v1',recordId=legacyWorkspaceRecordId(key)!,field=recordId.split(':')[0];
  const local={draft:'local essay',paragraphs:[{id:'p1',text:'local paragraph'}]},remote={draft:'remote essay'};
  const db=await openDatabase(dbName);try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({key,value:JSON.stringify(local),updatedAt:1});
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });}finally{db.close();}
  const records=[{scope:'workspace' as const,recordId,revision:2,contentHash:'b'.repeat(64),deleted:false,updatedAt:'now',value:remote}];
  const cursor={scope:'workspace' as const,field,mode:'changes' as const,after:'',cursor:2,head:2};
  const originalPut=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args:Parameters<typeof originalPut>){
    if(this.name==='v5Conflicts')throw Error('Injected workspace conflict save failure');
    return originalPut.apply(this,args);
  };
  try{await assert.rejects(commitV5WorkspacePage(records,cursor,dbName),/Injected workspace conflict save failure/);}
  finally{IDBObjectStore.prototype.put=originalPut;}
  assert.deepEqual(await getV5Resources('workspace',dbName),[]);
  assert.equal(await getV5Cursor('workspace',dbName,field),null);
  assert.deepEqual(await getV5Conflicts(dbName),[]);
  assert.equal((await getDocuments(dbName))[0].value,JSON.stringify(local));
  await commitV5WorkspacePage(records,cursor,dbName);
  const [conflict]=await getV5Conflicts(dbName);
  assert.deepEqual(conflict.localValue,local);
  const resolution=await resolveV5ConflictLocally(conflict.operationId,crypto.randomUUID(),dbName);
  assert.deepEqual(resolution?.value,local);
  assert.equal((await getDocuments(dbName))[0].value,JSON.stringify(local));
});

test('workspace authority atomically migrates only safe v4 intents and blocks frozen or changed operations',async()=>{
  const dbName=id(),safeKey='jackyun_definition_cards_v1',frozenKey='quizwise_history',changedKey='studyguide_progress';
  const safeId=legacyWorkspaceRecordId(safeKey)!,frozenId=legacyWorkspaceRecordId(frozenKey)!,changedId=legacyWorkspaceRecordId(changedKey)!;
  const safeField=safeId.slice(0,safeId.indexOf(':')),frozenField=frozenId.slice(0,frozenId.indexOf(':')),changedField=changedId.slice(0,changedId.indexOf(':'));
  const safeBase={cards:[{id:'base'}]},safeValue={cards:[{id:'edited'}]},frozenBase={attempts:[]},frozenValue={attempts:[{id:'pending'}]},changedBase={units:[]},queuedValue={units:[{id:'queued'}]};
  const safeHash='1'.repeat(64),frozenHash='2'.repeat(64),changedHash='3'.repeat(64),safeOp=crypto.randomUUID(),frozenOp=crypto.randomUUID(),changedOp=crypto.randomUUID();
  for(const [field,cursor] of [[safeField,1],[frozenField,2],[changedField,3]] as const)
    await setV5Cursor('workspace',{scope:'workspace',field,mode:'changes',after:'',cursor,head:cursor},dbName,field);
  const db=await openDatabase(dbName);try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['documents','outbox','settings','v5Resources'],'readwrite');
    for(const [key,value] of [[safeKey,safeValue],[frozenKey,frozenValue],[changedKey,{units:[{id:'newer-local'}]}]] as const)tx.objectStore('documents').put({key,value:JSON.stringify(value),updatedAt:1});
    const add=(id:string,key:string,baseRevision:number,baseHash:string,baseValue:unknown,value:unknown)=>tx.objectStore('outbox').put({id,key,baseRevision,baseHash,baseValue,baseDeleted:false,value,deleted:false,clientUpdatedAt:'2026-10-27T00:00:00.000Z',sequence:1});
    add(safeOp,safeKey,1,safeHash,safeBase,safeValue);add(frozenOp,frozenKey,1,frozenHash,frozenBase,frozenValue);add(changedOp,changedKey,1,changedHash,changedBase,queuedValue);
    tx.objectStore('v5Resources').put({scope:'workspace',recordId:safeId,revision:1,contentHash:safeHash,deleted:false,updatedAt:'now',value:safeBase});
    tx.objectStore('v5Resources').put({scope:'workspace',recordId:frozenId,revision:1,contentHash:frozenHash,deleted:false,updatedAt:'now',value:frozenBase});
    tx.objectStore('v5Resources').put({scope:'workspace',recordId:changedId,revision:1,contentHash:changedHash,deleted:false,updatedAt:'now',value:changedBase});
    tx.objectStore('settings').put({key:'syncSubmission',value:{body:'{}',operations:[{id:frozenOp,key:frozenKey}],compressed:false,protocol:4}});
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}

  const result=await prepareV5WorkspaceAuthority([safeField,frozenField,changedField],dbName);
  assert.deepEqual(result.migratedOperationIds,[safeOp]);
  assert.ok(result.authoritativeKeys.includes(safeKey));
  assert.ok(!result.authoritativeKeys.includes(frozenKey));
  assert.ok(!result.authoritativeKeys.includes(changedKey));
  assert.deepEqual(result.deferredKeys.map(row=>[row.key,row.reason]).sort(),[[changedKey,'local-changed'],[frozenKey,'submission']].sort());
  const verify=await openDatabase(dbName);try{const state=await new Promise<{legacy:SyncOperation[];v5:V5ResourceOperation[];settings?:{value:string[]}}>((resolve,reject)=>{
    const tx=verify.transaction(['outbox','v5Outbox','settings'],'readonly'),legacy=tx.objectStore('outbox').getAll(),v5=tx.objectStore('v5Outbox').getAll(),settings=tx.objectStore('settings').get('v5WorkspaceAuthorityKeys');
    let row:{legacy:SyncOperation[];v5:V5ResourceOperation[];settings?:{value:string[]}};legacy.onsuccess=()=>{row={legacy:legacy.result,v5:[],settings:undefined};};v5.onsuccess=()=>{row={...row!,v5:v5.result};};settings.onsuccess=()=>{row={...row!,settings:settings.result};};
    tx.oncomplete=()=>resolve(row!);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
    assert.deepEqual(state.legacy.map(row=>row.id).sort(),[frozenOp,changedOp].sort());
    assert.deepEqual(state.v5.map(row=>row.id),[safeOp]);
    assert.ok(state.settings?.value.includes(safeKey));
  }finally{verify.close();}
});

test('failed v4-to-v5 authority transaction rolls back both queues and leaves v4 intent retryable',async()=>{
  const dbName=id(),key='jackyun_definition_cards_v1',recordId=legacyWorkspaceRecordId(key)!,field=recordId.slice(0,recordId.indexOf(':'));
  const base={cards:[{id:'base'}]},value={cards:[{id:'edited'}]},baseHash=createHash('sha256').update(canonicalJson(base)).digest('hex'),operationId=crypto.randomUUID();
  await setV5Cursor('workspace',{scope:'workspace',field,mode:'changes',after:'',cursor:1,head:1},dbName,field);
  const db=await openDatabase(dbName);try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['documents','outbox','v5Resources'],'readwrite');
    tx.objectStore('documents').put({key,value:JSON.stringify(value),updatedAt:1});
    tx.objectStore('outbox').put({id:operationId,key,baseRevision:1,baseHash,baseValue:base,baseDeleted:false,value,deleted:false,clientUpdatedAt:'2026-10-27T00:00:00.000Z',sequence:1});
    tx.objectStore('v5Resources').put({scope:'workspace',recordId,revision:1,contentHash:baseHash,deleted:false,updatedAt:'now',value:base});
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}

  const originalDelete=IDBObjectStore.prototype.delete;
  IDBObjectStore.prototype.delete=function(keyValue:IDBValidKey|IDBKeyRange){
    if(this.name==='outbox'&&keyValue===operationId)throw Error('Injected legacy outbox delete failure');
    return originalDelete.call(this,keyValue);
  };
  try{await assert.rejects(prepareV5WorkspaceAuthority([field],dbName),/Injected legacy outbox delete failure/);}
  finally{IDBObjectStore.prototype.delete=originalDelete;}

  assert.deepEqual((await getOutbox(dbName)).map(row=>row.id),[operationId]);
  assert.deepEqual(await getV5Outbox('workspace',dbName),[]);
  const verify=await openDatabase(dbName);try{const settings=await new Promise<{value:string[]}|undefined>((resolve,reject)=>{
    const tx=verify.transaction('settings','readonly'),request=tx.objectStore('settings').get('v5WorkspaceAuthorityKeys');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });assert.equal(settings,undefined);}finally{verify.close();}
});

test('workspace sync migrates one eligible legacy operation and confirms it once through the v5 receipt path',async()=>{
  const dbName=id(),key='jackyun_definition_cards_v1',recordId=legacyWorkspaceRecordId(key)!,field=recordId.slice(0,recordId.indexOf(':'));
  const base={cards:[{id:'base'}]},value={cards:[{id:'edited'}]},baseHash=createHash('sha256').update(canonicalJson(base)).digest('hex'),valueHash=createHash('sha256').update(canonicalJson(value)).digest('hex'),operationId=crypto.randomUUID();
  await setV5Cursor('workspace',{scope:'workspace',field,mode:'changes',after:'',cursor:1,head:1},dbName,field);
  const db=await openDatabase(dbName);try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['documents','outbox','v5Resources'],'readwrite');
    tx.objectStore('documents').put({key,value:JSON.stringify(value),updatedAt:1});
    tx.objectStore('outbox').put({id:operationId,key,baseRevision:1,baseHash,baseValue:base,baseDeleted:false,value,deleted:false,clientUpdatedAt:'2026-10-27T00:00:00.000Z',sequence:1});
    tx.objectStore('v5Resources').put({scope:'workspace',recordId,revision:1,contentHash:baseHash,deleted:false,updatedAt:'now',value:base});
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
  const sent:string[]=[],owned:string[]=[];
  const engine=createV5ResourceSync({databaseScope:dbName,request:async(url,init)=>{
    const parsed=new URL(url,'https://sync.test');
    if(parsed.pathname==='/api/sync/v5')return Response.json({syncProtocol:5,capabilities:{v5:true},scopes:SYNC_V5_SCOPES});
    if(parsed.pathname==='/api/sync/v5/changes')return Response.json({syncProtocol:5,records:[],cursor:2,head:2,hasMore:false});
    if(parsed.pathname==='/api/sync/v5/receipts')return Response.json({syncProtocol:5,receipts:[]});
    if(parsed.pathname==='/api/sync/v5/operations'){
      const body=JSON.parse(String(init?.body)) as {operations:Array<{id:string;value:unknown}>};
      sent.push(...body.operations.map(operation=>operation.id));
      return Response.json({syncProtocol:5,applied:body.operations.map(operation=>({operationId:operation.id,status:'applied',revision:2,contentHash:valueHash,updatedAt:'now'})),conflicts:[]});
    }
    throw Error(`Unexpected request ${parsed.pathname}`);
  },deviceId:async()=>'00000000-0000-4000-8000-000000000001',readSchedule:()=>null,projectSchedule:async()=>{},readWorkspace:()=>getDocuments(dbName),projectWorkspaceRecord:async()=>{},setAuthority:()=>{},setWorkspaceAuthorityKeys:keys=>owned.push(...keys),uuid:()=>crypto.randomUUID()});
  const result=await engine.synchronize([{scope:'workspace',field}]);
  assert.equal(result.enabled,true);assert.deepEqual(sent,[operationId]);assert.ok(owned.includes(key));
  assert.deepEqual(await getOutbox(dbName),[]);assert.deepEqual(await getV5Outbox('workspace',dbName),[]);
  assert.equal((await getV5Resources('workspace',dbName)).find(row=>row.recordId===recordId)?.contentHash,valueHash);
});

test('v5 stale-base conflicts auto-confirm identical content and preserve real differences',async()=>{
  const scenarios=[
    {name:'same content',base:{id:'cue',prompt:'base'},local:{id:'cue',prompt:'same'},remote:{id:'cue',prompt:'same'},deleted:false},
    {name:'same deletion',base:{id:'cue',prompt:'base'},local:null,remote:null,deleted:true},
    {name:'different content',base:{id:'cue',prompt:'base'},local:{id:'cue',prompt:'local'},remote:{id:'cue',prompt:'cloud'},deleted:false},
  ] as const;
  for(const scenario of scenarios){
    const dbName=id(),recordId='cues:cue',baseHash=createHash('sha256').update(canonicalJson(scenario.base)).digest('hex');
    const valueHash=scenario.deleted?null:createHash('sha256').update(canonicalJson(scenario.remote)).digest('hex');
    const visibleCue=scenario.deleted?{id:'keep',prompt:'keep'}:scenario.local;
    const visibleIds=[visibleCue.id];let scheduleRaw=JSON.stringify({schemaVersion:1,cues:[visibleCue]});
    const operation={id:crypto.randomUUID(),scope:'cue' as const,recordId,baseRevision:1,baseHash,
      value:scenario.local,deleted:scenario.deleted,clientUpdatedAt:'now'};
    const db=await openDatabase(dbName);try{await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(['documents','v5Resources'],'readwrite');
      tx.objectStore('documents').put({key:'jackyun_schedule_control_v1',value:scheduleRaw,updatedAt:1});
      tx.objectStore('v5Resources').put({scope:'cue',recordId,revision:1,contentHash:baseHash,deleted:false,updatedAt:'base',value:scenario.base});
      if(scenario.deleted)tx.objectStore('v5Resources').put({scope:'cue',recordId:'cues:keep',revision:1,contentHash:createHash('sha256').update(canonicalJson(visibleCue)).digest('hex'),deleted:false,updatedAt:'base',value:visibleCue});
      tx.objectStore('v5Resources').put({scope:'cue',recordId:'cues:%24order',revision:1,contentHash:createHash('sha256').update(canonicalJson(visibleIds)).digest('hex'),deleted:false,updatedAt:'base',value:visibleIds});
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });}finally{db.close();}
    await setV5Cursor('cue',{scope:'cue',field:'cues',mode:'changes',after:'',cursor:1,head:1},dbName,'cues');
    await queueV5ResourceOperation(operation,dbName);
    const engine=createV5ResourceSync({databaseScope:dbName,request:async(url)=>{
      const parsed=new URL(url,'https://sync.test');
      if(parsed.pathname==='/api/sync/v5')return Response.json({syncProtocol:5,capabilities:{v5:true},scopes:SYNC_V5_SCOPES});
      if(parsed.pathname==='/api/sync/v5/changes')return Response.json({syncProtocol:5,records:[],cursor:1,head:1,hasMore:false});
      if(parsed.pathname==='/api/sync/v5/receipts')return Response.json({syncProtocol:5,receipts:[]});
      if(parsed.pathname==='/api/sync/v5/operations')return Response.json({syncProtocol:5,applied:[],conflicts:[{
        operationId:operation.id,status:'conflict',revision:2,contentHash:valueHash,deleted:scenario.deleted,value:scenario.remote,updatedAt:'remote',
      }]});
      throw Error(`Unexpected request ${parsed.pathname}`);
    },deviceId:async()=>crypto.randomUUID(),uuid:()=>crypto.randomUUID(),readSchedule:()=>scheduleRaw,projectSchedule:async value=>{if(value!==null)scheduleRaw=value;},setAuthority:()=>{}});
    await engine.synchronize([{scope:'cue',field:'cues'}]);
    const pending=await getV5Outbox('cue',dbName),conflicts=await getV5Conflicts(dbName);
    if(scenario.name==='different content'){
      assert.equal(pending.length,0,scenario.name);assert.equal(conflicts.length,1,scenario.name);
      assert.deepEqual(conflicts[0].localValue,scenario.local);assert.deepEqual(conflicts[0].remoteValue,scenario.remote);
      assert.equal(conflicts[0].baseRevision,1);assert.equal(conflicts[0].remoteRevision,2);
    }else{
      assert.equal(pending.length,0,`${scenario.name} pending: ${JSON.stringify(pending)} conflicts: ${JSON.stringify(conflicts)}`);assert.equal(conflicts.length,0,`${scenario.name}: ${JSON.stringify(conflicts)}`);
      const saved=(await getV5Resources('cue',dbName)).find(row=>row.recordId===recordId)!;
      assert.equal(saved.revision,2,scenario.name);assert.equal(saved.deleted,scenario.deleted,scenario.name);
      if(!scenario.deleted)assert.deepEqual(saved.value,scenario.remote,scenario.name);
    }
  }
});

test('resource-field cursors remain independent across page navigation',async()=>{
  const dbName=id();
  await setV5Cursor('cue',{scope:'cue',field:'cues',mode:'changes',after:'',cursor:8,head:10},dbName,'cues');
  await setV5Cursor('cue',{scope:'cue',field:'cueReviews',mode:'changes',after:'',cursor:3,head:10},dbName,'cueReviews');
  assert.equal((await getV5Cursor('cue',dbName,'cues'))?.cursor,8);
  assert.equal((await getV5Cursor('cue',dbName,'cueReviews'))?.cursor,3);
});

test('first resource baseline stages pages and preserves a local value as a conflict',async()=>{
  const dbName=id(),local={id:'cue-1',prompt:'local unsynced'},remote={id:'cue-1',prompt:'new cloud value'},hash=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
  let scheduleRaw=JSON.stringify({schemaVersion:1,cues:[local]});await seed(dbName,scheduleRaw);
  const descriptors=[
    {scope:'cue',recordId:'cues:%24order',revision:1,contentHash:hash(['cue-1']),deleted:false,updatedAt:'now',value:['cue-1']},
    {scope:'cue',recordId:'cues:cue-1',revision:2,contentHash:hash(remote),deleted:false,updatedAt:'now',value:remote},
  ];
  const engine=createV5ResourceSync({databaseScope:dbName,request:async(url)=>{
    const parsed=new URL(url,'https://sync.test');
    if(parsed.pathname==='/api/sync/v5')return Response.json({syncProtocol:5,capabilities:{v5:true},scopes:SYNC_V5_SCOPES});
    if(parsed.pathname==='/api/sync/v5/manifest')return Response.json({syncProtocol:5,records:descriptors.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=='value'))),next:null,head:2});
    if(parsed.pathname==='/api/sync/v5/records')return Response.json({syncProtocol:5,records:parsed.searchParams.getAll('id').map(id=>descriptors.find(row=>row.recordId===id))});
    if(parsed.pathname==='/api/sync/v5/changes')return Response.json({syncProtocol:5,records:[],cursor:2,head:2,hasMore:false});
    throw Error(`Unexpected request ${parsed.pathname}`);
  },deviceId:async()=>'00000000-0000-4000-8000-000000000001',readSchedule:()=>scheduleRaw,projectSchedule:async value=>{if(value!==null)scheduleRaw=value;},setAuthority:()=>{},uuid:()=>crypto.randomUUID()});
  const result=await engine.synchronize([{scope:'cue',field:'cues'}]);
  assert.equal(result.conflicts.length,1);
  assert.deepEqual(JSON.parse(scheduleRaw).cues,[local]);
  assert.deepEqual((await getV5Conflicts(dbName))[0].remoteValue,remote);
  assert.equal((await getV5Cursor('cue',dbName,'cues'))?.cursor,2);
});

test('paged baseline does not expose a partial collection before its final page',async()=>{
  const dbName=id(),cues=Array.from({length:101},(_,index)=>({id:`cue-${String(index).padStart(3,'0')}`,prompt:`item ${index}`})),hash=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
  const values=[{scope:'cue' as const,recordId:'cues:%24order',revision:1,contentHash:hash(cues.map(cue=>cue.id)),deleted:false,updatedAt:'now',value:cues.map(cue=>cue.id)},
    ...cues.map(value=>({scope:'cue' as const,recordId:`cues:${value.id}`,revision:1,contentHash:hash(value),deleted:false,updatedAt:'now',value}))];
  const descriptors=values.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=='value')) as Omit<typeof row,'value'>);let scheduleRaw=JSON.stringify({schemaVersion:1});await seed(dbName,scheduleRaw);let manifestPage=0;
  const readDocument=async()=>{const db=await openDatabase(dbName);try{return await new Promise<Record<string,unknown>>((resolve,reject)=>{const tx=db.transaction('documents','readonly'),request=tx.objectStore('documents').get('jackyun_schedule_control_v1');request.onsuccess=()=>resolve(JSON.parse(request.result.value));request.onerror=()=>reject(request.error);});}finally{db.close();}};
  const engine=createV5ResourceSync({databaseScope:dbName,request:async(url)=>{
    const parsed=new URL(url,'https://sync.test');
    if(parsed.pathname==='/api/sync/v5')return Response.json({syncProtocol:5,capabilities:{v5:true},scopes:SYNC_V5_SCOPES});
    if(parsed.pathname==='/api/sync/v5/manifest'){
      manifestPage++;if(manifestPage===2)assert.deepEqual(await readDocument(),{schemaVersion:1},'intermediate pages stay invisible');
      const after=parsed.searchParams.get('after')??'',all=descriptors.filter(row=>row.recordId>after).sort((a,b)=>a.recordId.localeCompare(b.recordId)),records=all.slice(0,100);
      return Response.json({syncProtocol:5,records,next:all.length>100?records.at(-1)?.recordId:null,head:101});
    }
    if(parsed.pathname==='/api/sync/v5/records')return Response.json({syncProtocol:5,records:parsed.searchParams.getAll('id').map(recordId=>values.find(row=>row.recordId===recordId))});
    if(parsed.pathname==='/api/sync/v5/changes')return Response.json({syncProtocol:5,records:[],cursor:101,head:101,hasMore:false});
    throw Error(`Unexpected request ${parsed.pathname}`);
  },deviceId:async()=>'00000000-0000-4000-8000-000000000001',readSchedule:()=>scheduleRaw,projectSchedule:async value=>{if(value!==null)scheduleRaw=value;},setAuthority:()=>{},uuid:()=>crypto.randomUUID()});
  await engine.synchronize([{scope:'cue',field:'cues'}]);
  assert.equal(manifestPage,2);const projection=await readDocument();assert.equal(Array.isArray(projection.cues),true);assert.equal((projection.cues as unknown[]).length,101);
});

test('a late old receipt cannot downgrade a newer pulled resource or its Schedule projection',async()=>{
  const dbName=id(),newer={id:'cue-1',prompt:'revision 3 from another device'},oldUpload={id:'cue-1',prompt:'revision 2 upload'};
  const hash=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex'),operation={id:crypto.randomUUID(),scope:'cue' as const,recordId:'cues:cue-1',baseRevision:1,baseHash:'b'.repeat(64),value:oldUpload,deleted:false,clientUpdatedAt:'now'};
  const db=await openDatabase(dbName);try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['documents','v5Resources','v5Outbox'],'readwrite');
    tx.objectStore('documents').put({key:'jackyun_schedule_control_v1',value:JSON.stringify({schemaVersion:1,cues:[newer]}),updatedAt:0});
    tx.objectStore('v5Resources').put({scope:'cue',recordId:'cues:$order',revision:3,contentHash:hash(['cue-1']),deleted:false,updatedAt:'new',value:['cue-1']});
    tx.objectStore('v5Resources').put({scope:'cue',recordId:'cues:cue-1',revision:3,contentHash:hash(newer),deleted:false,updatedAt:'new',value:newer});tx.objectStore('v5Outbox').put(operation);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}
  const projected=await acknowledgeV5Operations([{operation,revision:2,contentHash:hash(oldUpload),updatedAt:'old'}],dbName);
  assert.deepEqual(JSON.parse(projected!).cues,[newer]);assert.equal((await getV5Resources('cue',dbName)).find(row=>row.recordId==='cues:cue-1')?.revision,3);
  const read=await openDatabase(dbName);try{const value=await new Promise<string>((resolve,reject)=>{const tx=read.transaction('documents','readonly'),request=tx.objectStore('documents').get('jackyun_schedule_control_v1');request.onsuccess=()=>resolve(request.result.value);request.onerror=()=>reject(request.error);});assert.deepEqual(JSON.parse(value).cues,[newer]);}finally{read.close();}
});

test('resolving one remote conflict preserves other local conflicted resources',async()=>{
  const dbName=id(),selectedId=crypto.randomUUID(),otherId=crypto.randomUUID(),base={schemaVersion:1,cues:[{id:'a',prompt:'local A'},{id:'b',prompt:'local B'}]};
  const db=await openDatabase(dbName);try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['documents','v5Resources','v5Conflicts'],'readwrite');
    tx.objectStore('documents').put({key:'jackyun_schedule_control_v1',value:JSON.stringify(base),updatedAt:0});
    tx.objectStore('v5Resources').put({scope:'cue',recordId:'cues:$order',revision:2,contentHash:'a'.repeat(64),deleted:false,updatedAt:'now',value:['a','b']});
    for(const [recordId,value] of [['cues:a',{id:'a',prompt:'remote A'}],['cues:b',{id:'b',prompt:'remote B'}]] as const)tx.objectStore('v5Resources').put({scope:'cue',recordId,revision:2,contentHash:'a'.repeat(64),deleted:false,updatedAt:'now',value});
    const conflict=(operationId:string,recordId:string,localValue:unknown,remoteValue:unknown):V5ResourceConflict=>({operationId,scope:'cue',recordId,baseRevision:1,baseHash:'b'.repeat(64),localValue,localDeleted:false,remoteValue,remoteDeleted:false,remoteRevision:2,remoteHash:'a'.repeat(64),createdAt:'now'});
    tx.objectStore('v5Conflicts').put(conflict(selectedId,'cues:a',{id:'a',prompt:'local A'},{id:'a',prompt:'remote A'}));
    tx.objectStore('v5Conflicts').put(conflict(otherId,'cues:b',{id:'b',prompt:'local B'},{id:'b',prompt:'remote B'}));
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}
  const projected=await resolveV5ConflictRemotely(selectedId,dbName);
  assert.deepEqual(JSON.parse(projected!).cues,[{id:'a',prompt:'remote A'},{id:'b',prompt:'local B'}]);
});

test('v5 capability withdrawal clears resource authority for the caller',async()=>{
  const dbName=id(),authorities:string[][]=[];
  const engine=createV5ResourceSync({databaseScope:dbName,request:async()=>Response.json({syncProtocol:5,capabilities:{v5:false},scopes:[]}),deviceId:async()=>'00000000-0000-4000-8000-000000000001',readSchedule:()=>null,projectSchedule:async()=>{},setAuthority:scopes=>{authorities.push([...scopes]);},uuid:()=>crypto.randomUUID()});
  assert.equal((await engine.synchronize([{scope:'cue',field:'cues'}])).enabled,false);
  assert.deepEqual(authorities,[[]]);
});

test('a withdrawn or partial rollout cannot silently hand an established Schedule back to v4',()=>{
  assert.equal(retainV5ScheduleAuthority(true,[]),true);
  assert.equal(retainV5ScheduleAuthority(true,['cue']),true);
  assert.equal(retainV5ScheduleAuthority(true,SYNC_V5_SCOPES),false);
  assert.equal(retainV5ScheduleAuthority(false,['cue']),false);
});

test('partial account rollout syncs only granted domains and retains v4 Schedule authority',async()=>{
  const dbName=id(),authorities:string[][]=[],manifestFields:string[]=[];let scheduleRaw=JSON.stringify({schemaVersion:1});await seed(dbName,scheduleRaw);
  const engine=createV5ResourceSync({databaseScope:dbName,request:async url=>{
    const parsed=new URL(url,'https://sync.test');
    if(parsed.pathname==='/api/sync/v5')return Response.json({syncProtocol:5,capabilities:{v5:true},scopes:['cue']});
    if(parsed.pathname==='/api/sync/v5/manifest'){manifestFields.push(parsed.searchParams.get('field')??'');return Response.json({syncProtocol:5,records:[],next:null,head:0});}
    if(parsed.pathname==='/api/sync/v5/changes')return Response.json({syncProtocol:5,records:[],cursor:0,head:0,hasMore:false});
    throw Error(`Unexpected request ${parsed.pathname}`);
  },deviceId:async()=>'00000000-0000-4000-8000-000000000001',readSchedule:()=>scheduleRaw,projectSchedule:async value=>{if(value!==null)scheduleRaw=value;},setAuthority:scopes=>{authorities.push([...scopes]);},uuid:()=>crypto.randomUUID()});
  const result=await engine.synchronize([{scope:'cue',field:'cues'},{scope:'timetable',field:'timetable'}]);
  assert.equal(result.enabled,true);assert.equal(result.authoritativeSchedule,false);
  assert.deepEqual(authorities,[['cue']]);assert.deepEqual(manifestFields,['cues']);
});

test('v5 worker keeps its account database scope and discards responses after account change',async()=>{
  const userId=crypto.randomUUID(),dbScope=accountSyncStore(userId).databaseScope,value:string[]=[];
  let current=true;
  const contentHash=createHash('sha256').update(canonicalJson(value)).digest('hex');
  const engine=createV5ResourceSync({databaseScope:dbScope,isCurrent:()=>current,request:async(url)=>{
    const parsed=new URL(url,'https://sync.test');
    if(parsed.pathname==='/api/sync/v5')return Response.json({syncProtocol:5,capabilities:{v5:true},scopes:SYNC_V5_SCOPES});
    if(parsed.pathname==='/api/sync/v5/manifest')return Response.json({syncProtocol:5,records:[{scope:'cue',recordId:'cues:$order',revision:1,contentHash,deleted:false,updatedAt:'now'}],next:null,head:0});
    if(parsed.pathname==='/api/sync/v5/records'){current=false;return Response.json({syncProtocol:5,records:[{scope:'cue',recordId:'cues:$order',revision:1,contentHash,deleted:false,updatedAt:'now',value}]});}
    throw new Error(`Unexpected request ${parsed.pathname}`);
  },deviceId:async()=>'00000000-0000-4000-8000-000000000001',readSchedule:()=>null,projectSchedule:async()=>{},setAuthority:()=>{},uuid:()=>crypto.randomUUID()});
  await assert.rejects(engine.synchronize([{scope:'cue',field:'cues'}]),{name:'AbortError'});
  assert.equal(await getV5Cursor('cue',dbScope),null);
  assert.deepEqual(await getV5Resources('cue',dbScope),[]);
});

test('v5 client downloads only changed records, queues a stable resource operation, and stays incremental',async()=>{
  const dbName=id(),schedule={schemaVersion:1,cues:[{id:'cue-1',prompt:'from cloud'}],legacyHistory:'x'.repeat(200_000)},hash=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
  const rows=new Map<string,{scope:'cue';recordId:string;revision:number;contentHash:string;deleted:boolean;updatedAt:string;value:unknown}>([
    ['cues:%24order',{scope:'cue',recordId:'cues:%24order',revision:1,contentHash:hash(['cue-1']),deleted:false,updatedAt:'now',value:['cue-1']}],
    ['cues:cue-1',{scope:'cue',recordId:'cues:cue-1',revision:1,contentHash:hash(schedule.cues[0]),deleted:false,updatedAt:'now',value:schedule.cues[0]}],
  ]);
  await seed(dbName,JSON.stringify(schedule));let head=1,recordReads=0,manifestReads=0;const operationIds:string[]=[],measurements:Array<{path:string;method:string;requestBytes:number;responseBytes:number}>=[];
  const handleRequest=async(url:string,init?:RequestInit)=>{
    const parsed=new URL(url,'https://sync.test'),scope=parsed.searchParams.get('scope');
    if(parsed.pathname==='/api/sync/v5')return Response.json({syncProtocol:5,capabilities:{v5:true},scopes:SYNC_V5_SCOPES});
    if(parsed.pathname==='/api/sync/v5/manifest'){manifestReads++;const field=parsed.searchParams.get('field');const records=[...rows.values()].filter(row=>row.recordId.startsWith(`${field}:`)).map(row=>({scope:row.scope,recordId:row.recordId,revision:row.revision,contentHash:row.contentHash,deleted:row.deleted,updatedAt:row.updatedAt}));return Response.json({syncProtocol:5,records,next:null,head});}
    if(parsed.pathname==='/api/sync/v5/records'){recordReads++;const records=parsed.searchParams.getAll('id').map(id=>rows.get(id)).filter(Boolean);return Response.json({syncProtocol:5,records});}
    if(parsed.pathname==='/api/sync/v5/changes')return Response.json({syncProtocol:5,records:[],cursor:head,head,hasMore:false});
    if(parsed.pathname==='/api/sync/v5/receipts')return Response.json({receipts:JSON.parse(String(init?.body)).operations.map((row:{id:string})=>({operationId:row.id,state:'unknown'}))});
    if(parsed.pathname==='/api/sync/v5/operations'){
      const body=JSON.parse(String(init?.body)),applied=body.operations.map((operation:{id:string;recordId:string;value:unknown;deleted:boolean})=>{operationIds.push(operation.recordId);head++;
        const saved={scope:'cue' as const,recordId:operation.recordId,revision:head,contentHash:hash(operation.value),deleted:operation.deleted,updatedAt:'later',value:operation.value};rows.set(operation.recordId,saved);
        return {status:'applied',operationId:operation.id,revision:head,contentHash:saved.contentHash,updatedAt:saved.updatedAt};});
      return Response.json({syncProtocol:5,applied,conflicts:[]});
    }
    throw new Error(`Unexpected v5 request ${parsed.pathname} scope=${scope}`);
  };
  const request=async(url:string,init?:RequestInit)=>{
    const response=await handleRequest(url,init),parsed=new URL(url,'https://sync.test'),requestBody=typeof init?.body==='string'?new TextEncoder().encode(init.body).byteLength:0;
    measurements.push({path:parsed.pathname,method:init?.method??'GET',requestBytes:requestBody,responseBytes:(await response.clone().arrayBuffer()).byteLength});
    return response;
  };
  let scheduleRaw=JSON.stringify(schedule);
  const engine=createV5ResourceSync({databaseScope:dbName,request,deviceId:async()=>'00000000-0000-4000-8000-000000000001',readSchedule:()=>scheduleRaw,projectSchedule:async value=>{if(value!==null)scheduleRaw=value;},setAuthority:()=>{},uuid:()=>crypto.randomUUID()});
  const readDocument=async()=>{const db=await openDatabase(dbName);try{return await new Promise<string>((resolve,reject)=>{const tx=db.transaction('documents','readonly'),r=tx.objectStore('documents').get('jackyun_schedule_control_v1');r.onsuccess=()=>resolve(r.result.value);r.onerror=()=>reject(r.error);});}finally{db.close();}};
  const fullScheduleBytes=new TextEncoder().encode(scheduleRaw).byteLength,startInitial=performance.now(),initialOffset=measurements.length;
  await engine.synchronize([{scope:'cue',field:'cues'}]);
  const initialMetrics=measurements.slice(initialOffset),initialElapsedMs=performance.now()-startInitial;
  assert.deepEqual(JSON.parse(await readDocument()),schedule);
  const changed={...schedule,cues:[{id:'cue-1',prompt:'edited locally'}]};scheduleRaw=JSON.stringify(changed);
  const db=await openDatabase(dbName);try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({key:'jackyun_schedule_control_v1',value:JSON.stringify(changed),updatedAt:Date.now()});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}
  const mutationOffset=measurements.length,startMutation=performance.now();
  await engine.synchronize([{scope:'cue',field:'cues'}]);
  const mutationMetrics=measurements.slice(mutationOffset),mutationElapsedMs=performance.now()-startMutation;
  assert.deepEqual(operationIds,['cues:cue-1']);
  assert.equal((await getV5Resources('cue',dbName)).find(row=>row.recordId==='cues:cue-1')?.revision,2);
  const readsAfterMutation=recordReads,warmOffset=measurements.length,startWarm=performance.now();await engine.synchronize([{scope:'cue',field:'cues'}]);
  const warmMetrics=measurements.slice(warmOffset),warmElapsedMs=performance.now()-startWarm;
  assert.equal(manifestReads,1);assert.equal(recordReads,readsAfterMutation);
  const summarize=(rows:typeof measurements)=>({requests:rows.length,requestBytes:rows.reduce((sum,row)=>sum+row.requestBytes,0),responseBytes:rows.reduce((sum,row)=>sum+row.responseBytes,0),paths:rows.map(row=>row.path)});
  const initial=summarize(initialMetrics),mutation=summarize(mutationMetrics),warm=summarize(warmMetrics);
  assert.ok(initial.paths.some(path=>path==='/api/sync/v5/records'),'baseline must fetch record bodies');
  assert.ok(mutation.paths.includes('/api/sync/v5/operations'),'local CUE edit must use the resource operation endpoint');
  assert.ok(!mutation.paths.includes('/api/sync/v5/records'),'single-record update must not redownload CUE bodies');
  assert.ok(mutation.requestBytes<fullScheduleBytes/10,`single CUE request ${mutation.requestBytes} B should be under one tenth of ${fullScheduleBytes} B Schedule`);
  assert.ok(!warm.paths.includes('/api/sync/v5/records'),'warm unchanged sync must not request resource bodies');
  assert.ok(warm.responseBytes<initial.responseBytes,'warm sync should transfer less response data than baseline');
  assert.equal(warm.requests,2,'unchanged sync checks authority and each subscribed field only once');
  console.log(JSON.stringify({kind:'v5-client-fixture',fullScheduleBytes,initial:{...initial,elapsedMs:Math.round(initialElapsedMs)},singleCueMutation:{...mutation,elapsedMs:Math.round(mutationElapsedMs)},unchangedWarmSync:{...warm,elapsedMs:Math.round(warmElapsedMs)}}));
});

test('page resource selection avoids unrelated CUE history and schedule scopes',()=>{
  const review=resourceFieldsForPath('/review');
  assert.ok(review.some(row=>row.scope==='cue'&&row.field==='cues'));
  assert.ok(review.some(row=>row.scope==='cue'&&row.field==='cueReviews'));
  assert.ok(!review.some(row=>row.field==='cueChangeHistory'||row.field==='cueCollectionUpdates'));
  const timetable=resourceFieldsForPath('/timetable-hub');
  assert.deepEqual(timetable.map(row=>row.field),['timetable','manualTasks','completions','cancellations','learningReminders','legacyTimetable','legacyLearning']);
  assert.ok(resourceFieldsForPath('/dashboard').some(row=>row.scope==='cue'&&row.field==='cueReviews'));
  assert.deepEqual(resourceFieldsForPath('/dashboard').filter(row=>['cueChangeHistory','cueCollectionUpdates','cueSimilarityDecisions','studyReports'].includes(row.field)),[]);
  const scheduleFields=new Set(resourceFieldsForPath('/schedule').map(row=>row.field));
  for(const field of ['cueReviews','cueStudyDrafts','cues','learningRecords','learningCatalog','learningReminders','timedPracticeRecords','examDiagnoses','practiceFrequencies','practiceSessions','practiceTimerConfig','cueMemos','cueAnswerCards','importedAt'])assert.ok(scheduleFields.has(field),`Schedule page must subscribe to ${field}`);
  for(const path of ['/schedule','/cue/study']){
    const fields=new Set(resourceFieldsForPath(path).filter(row=>row.scope==='cue').map(row=>row.field));
    assert.ok(fields.has('cueStudyDrafts'),`${path} must subscribe to unfinished CUE study drafts`);
    assert.ok(fields.has('cues'),`${path} must subscribe to the cards referenced by those drafts`);
  }
  assert.ok(resourceFieldsForPath('/study/tasks').some(row=>row.field==='manualTasks'));
  assert.deepEqual(resourceFieldsForPath('/ielts').filter(row=>row.scope==='workspace').map(row=>row.field),['legacyIELTS']);
  assert.deepEqual(resourceFieldsForPath('/studio').filter(row=>row.scope==='workspace').map(row=>row.field),['legacyPersonalSites','legacyLearning']);
  assert.deepEqual(resourceFieldsForPath('/quiz').filter(row=>row.scope==='workspace').map(row=>row.field),['legacyQuiz','legacyCue','legacyLearning']);
  assert.deepEqual(resourceFieldsForPath('/studyplan').map(row=>row.field),['legacyGoals','legacyStudyPlan','legacyTimetable','legacyLearning']);
  assert.ok(resourceFieldsForPath('/studyplan').some(row=>row.scope==='workspace'&&row.field==='legacyTimetable'));
  assert.deepEqual(resourceFieldsForPath('/definitions').map(row=>row.field),['legacyCue','legacyLearning']);
  assert.deepEqual(resourceFieldsForPath('/properties').map(row=>row.field),['legacyCue','legacyLearning']);
  assert.ok(resourceFieldsForPath('/cue/study').some(row=>row.field==='cueGameAccount'));
  assert.ok(resourceFieldsForPath('/settings/watch').some(row=>row.field==='settings'));
  assert.ok(!resourceFieldsForPath('/settings/watch').some(row=>row.field==='legacyMisc'),'settings pages must not subscribe to a generic catch-all scope');
  assert.deepEqual(resourceFieldsForPath('/reading').filter(row=>row.scope==='workspace').map(row=>row.field),['legacyReader'],'reader shelf and position are subscribed only on the reading page');
});

test('backup restore targets persist per account until their v5 records and conflicts settle',async()=>{
  const databaseScope=id(),targets=resourceTargetsForStorageKeys(['jackyun_ielts_goal_v1','jackyun_schedule_control_v1','eruda-console']);
  assert.ok(targets.some(row=>row.scope==='workspace'&&row.field==='legacyIELTS'));
  assert.ok(targets.some(row=>row.scope==='cue'&&row.field==='cues'));
  assert.ok(!targets.some(row=>row.field==='eruda-console'));
  await queueV5RestoreTargets(targets,databaseScope);
  const queuedTargets=await getV5RestoreTargets(databaseScope);
  assert.deepEqual(queuedTargets.map(({scope,field})=>({scope,field})),targets);
  assert.ok(queuedTargets.every(row=>typeof row.generation==='string'&&row.generation));
  const pendingTarget=targets.find(row=>row.field==='legacyIELTS')!,conflictTarget=targets.find(row=>row.field==='cues')!;
  const pendingId=crypto.randomUUID(),conflictId=crypto.randomUUID(),db=await openDatabase(databaseScope);
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['v5Outbox','v5Conflicts'],'readwrite');
    tx.objectStore('v5Outbox').put({id:pendingId,scope:pendingTarget.scope,recordId:`${pendingTarget.field}:pending`,baseRevision:0,baseHash:null,value:{id:'pending'},deleted:false,clientUpdatedAt:new Date().toISOString()});
    tx.objectStore('v5Conflicts').put({operationId:conflictId,scope:conflictTarget.scope,recordId:`${conflictTarget.field}:conflict`,baseRevision:0,baseHash:null,localValue:{id:'local'},localDeleted:false,remoteValue:{id:'remote'},remoteDeleted:false,remoteRevision:1,remoteHash:'a'.repeat(64),createdAt:new Date().toISOString()});
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });}finally{db.close();}
  const queuedPending=queuedTargets.find(row=>row.field===pendingTarget.field)!,queuedConflict=queuedTargets.find(row=>row.field===conflictTarget.field)!;
  assert.deepEqual(await acknowledgeV5RestoreTargets(queuedTargets,databaseScope),[queuedConflict,queuedPending].sort((a,b)=>`${a.scope}\0${a.field}`.localeCompare(`${b.scope}\0${b.field}`)),'pending writes and actionable conflicts keep their resource fields queued');
  const cleanup=await openDatabase(databaseScope);
  try{await new Promise<void>((resolve,reject)=>{const tx=cleanup.transaction(['v5Outbox','v5Conflicts'],'readwrite');tx.objectStore('v5Outbox').delete(pendingId);tx.objectStore('v5Conflicts').delete(conflictId);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{cleanup.close();}
  assert.deepEqual(await acknowledgeV5RestoreTargets(queuedTargets,databaseScope),[]);
  assert.deepEqual(await getV5RestoreTargets(databaseScope),[]);
});

test('requeued restore target generation survives acknowledgment of an older in-flight generation',async()=>{
  const databaseScope=id(),target=resourceTargetsForStorageKeys(['jackyun_ielts_goal_v1']).find(row=>row.field==='legacyIELTS')!;
  await queueV5RestoreTargets([target],databaseScope);
  const inFlight=(await getV5RestoreTargets(databaseScope))[0];
  await queueV5RestoreTargets([target],databaseScope);
  const latest=(await getV5RestoreTargets(databaseScope))[0];
  assert.notEqual(latest.generation,inFlight.generation);
  assert.deepEqual(await acknowledgeV5RestoreTargets([inFlight],databaseScope),[latest]);
  assert.deepEqual(await getV5RestoreTargets(databaseScope),[latest]);
});

test('new writing subscriptions wait for the backend capability instead of sending unknown fields to an older server',async()=>{
  const requests:string[]=[],databaseScope=id(),pendingId=crypto.randomUUID();
  const db=await openDatabase(databaseScope);try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('v5Outbox','readwrite');tx.objectStore('v5Outbox').put({id:pendingId,scope:'workspace',recordId:legacyWorkspaceRecordId(writingItemKey(WRITING_COLLECTIONS[0],'essay-a')),
      baseRevision:0,baseHash:null,value:{id:'essay-a'},deleted:false,clientUpdatedAt:new Date().toISOString()});
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });}finally{db.close();}
  const engine=createV5ResourceSync({databaseScope,request:async url=>{
    requests.push(url);assert.equal(url,'/api/sync/v5');
    return Response.json({syncProtocol:5,capabilities:{v5:true},scopes:['workspace']});
  },deviceId:async()=>crypto.randomUUID(),uuid:()=>crypto.randomUUID(),readSchedule:()=>null,projectSchedule:async()=>{},setAuthority:()=>{}});
  const result=await engine.synchronize(resourceFieldsForPath('/ielts-writing'));
  assert.equal(result.writingCollectionsEnabled,false);
  assert.deepEqual(result.processedTargets,[],'unsupported resource targets must remain queued for a later backend capability');
  assert.deepEqual(requests,['/api/sync/v5']);
  assert.deepEqual((await getV5Outbox('workspace',databaseScope)).map(row=>row.id),[pendingId],'capability withdrawal must preserve pending writing operations without an unsafe fallback');
});

test('every writable v5 field has a valid page target without loading all fields on each page',()=>{
  const paths=['/schedule','/dashboard','/study','/review','/cue','/timetable-hub','/activity','/practice-timer','/ielts','/ielts-writing','/reading','/study-guide','/quiz','/pomodoro','/answer-sheet','/mock-portal','/answer-sheet-sync','/settings','/music','/ai','/studio','/relax'];
  const targets=new Set(paths.flatMap(path=>resourceFieldsForPath(path).map(target=>`${target.scope}\0${target.field}`)));
  for(const scope of SYNC_V5_SCOPES)for(const field of resourceFieldsForScope(scope))assert.ok(targets.has(`${scope}\0${field}`),`${scope}/${field} must be writable through a page subscription`);
  const schedule=new Set(resourceFieldsForPath('/schedule').map(target=>target.field));
  assert.ok(schedule.has('cueCollectionUpdates'));
  assert.ok(schedule.has('cueChangeHistory'));
  assert.ok(schedule.has('cueSimilarityDecisions'));
  assert.ok(schedule.has('studyReports'));
  assert.ok(schedule.has('examDiagnoses'));
  assert.ok(schedule.has('practiceSessions'));
  assert.ok(schedule.has('learningRecords'));
  assert.ok(resourceFieldsForPath('/study').some(target=>target.scope==='timer'&&target.field==='practiceSessions'));
  assert.ok(resourceFieldsForPath('/answer-sheet').some(target=>target.scope==='timer'&&target.field==='practiceSessions'),'answer sheet must pull Schedule sessions containing question-level results');
  assert.ok(resourceFieldsForPath('/activity').some(target=>target.scope==='practice'&&target.field==='practiceFrequencies'));
  assert.ok(!resourceFieldsForPath('/review').some(target=>target.field==='examDiagnoses'),'review should not fetch unrelated practice history');
});
