import assert from 'node:assert/strict';
import test from 'node:test';
import {IDBFactory} from 'fake-indexeddb';
import {accountSyncStore,acknowledgeV5Operations,commitV5ResourcePage,getV5Conflicts,getV5Cursor,getV5Resources,openDatabase,resolveV5ConflictRemotely,setV5Cursor,type V5ResourceConflict} from '../src/lib/sync/outbox.ts';
import {createV5ResourceSync,resourceFieldsForPath} from '../src/lib/sync/resource-engine.ts';
import {resourceFieldsForScope} from '../src/lib/sync/resource-model.ts';
import {canonicalJson} from '../src/lib/sync/hash.ts';
import {SYNC_V5_SCOPES} from '../src/lib/sync/resource-model.ts';
import {createHash} from 'node:crypto';

Object.assign(globalThis,{indexedDB:new IDBFactory()});
const id=()=>`v5-client-${crypto.randomUUID()}`;

async function seed(dbName:string,value:string){
  const db=await openDatabase(dbName);try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({key:'jackyun_schedule_control_v1',value,updatedAt:0});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}
}

test('v5 resource values, merged Schedule and page cursor commit in one IndexedDB transaction',async()=>{
  const dbName=id();await seed(dbName,JSON.stringify({schemaVersion:1,cues:[{id:'cue-1',prompt:'old'}],manualTasks:[{id:'task-1'}]}));
  const projected=await commitV5ResourcePage('cue',[{scope:'cue',recordId:'cues:$order',revision:1,contentHash:'c'.repeat(64),deleted:false,updatedAt:'2026-10-25T00:00:00Z',value:['cue-1']},{scope:'cue',recordId:'cues:cue-1',revision:2,contentHash:'a'.repeat(64),deleted:false,updatedAt:'2026-10-25T00:00:00Z',value:{id:'cue-1',prompt:'new'}}],
    {scope:'cue',mode:'changes',after:'',cursor:8,head:8},dbName);
  assert.deepEqual(JSON.parse(projected!),{schemaVersion:1,cues:[{id:'cue-1',prompt:'new'}],manualTasks:[{id:'task-1'}]});
  assert.equal((await getV5Cursor('cue',dbName))?.cursor,8);
  assert.equal((await getV5Resources('cue',dbName)).find(row=>row.recordId==='cues:cue-1')?.revision,2);
});

test('v5 cursor does not advance when the Schedule document cannot be safely merged',async()=>{
  const dbName=id();await seed(dbName,'not-json');
  await assert.rejects(commitV5ResourcePage('cue',[{scope:'cue',recordId:'cues:cue-1',revision:1,contentHash:'b'.repeat(64),deleted:false,updatedAt:'now',value:{id:'cue-1'}}],
    {scope:'cue',mode:'changes',after:'',cursor:1,head:1},dbName));
  assert.equal(await getV5Cursor('cue',dbName),null);
  assert.deepEqual(await getV5Resources('cue',dbName),[]);
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
  const dbName=id(),schedule={schemaVersion:1,cues:[{id:'cue-1',prompt:'from cloud'}]},hash=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
  const rows=new Map<string,{scope:'cue';recordId:string;revision:number;contentHash:string;deleted:boolean;updatedAt:string;value:unknown}>([
    ['cues:%24order',{scope:'cue',recordId:'cues:%24order',revision:1,contentHash:hash(['cue-1']),deleted:false,updatedAt:'now',value:['cue-1']}],
    ['cues:cue-1',{scope:'cue',recordId:'cues:cue-1',revision:1,contentHash:hash(schedule.cues[0]),deleted:false,updatedAt:'now',value:schedule.cues[0]}],
  ]);
  await seed(dbName,JSON.stringify(schedule));let head=1,recordReads=0,manifestReads=0;const operationIds:string[]=[];
  const request=async(url:string,init?:RequestInit)=>{
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
  let scheduleRaw=JSON.stringify(schedule);
  const engine=createV5ResourceSync({databaseScope:dbName,request,deviceId:async()=>'00000000-0000-4000-8000-000000000001',readSchedule:()=>scheduleRaw,projectSchedule:async value=>{if(value!==null)scheduleRaw=value;},setAuthority:()=>{},uuid:()=>crypto.randomUUID()});
  const readDocument=async()=>{const db=await openDatabase(dbName);try{return await new Promise<string>((resolve,reject)=>{const tx=db.transaction('documents','readonly'),r=tx.objectStore('documents').get('jackyun_schedule_control_v1');r.onsuccess=()=>resolve(r.result.value);r.onerror=()=>reject(r.error);});}finally{db.close();}};
  await engine.synchronize([{scope:'cue',field:'cues'}]);
  assert.deepEqual(JSON.parse(await readDocument()),schedule);
  const changed={...schedule,cues:[{id:'cue-1',prompt:'edited locally'}]};scheduleRaw=JSON.stringify(changed);
  const db=await openDatabase(dbName);try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({key:'jackyun_schedule_control_v1',value:JSON.stringify(changed),updatedAt:Date.now()});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}
  await engine.synchronize([{scope:'cue',field:'cues'}]);
  assert.deepEqual(operationIds,['cues:cue-1']);
  assert.equal((await getV5Resources('cue',dbName)).find(row=>row.recordId==='cues:cue-1')?.revision,2);
  const readsAfterMutation=recordReads;await engine.synchronize([{scope:'cue',field:'cues'}]);
  assert.equal(manifestReads,1);assert.equal(recordReads,readsAfterMutation);
});

test('page resource selection avoids unrelated CUE history and schedule scopes',()=>{
  const review=resourceFieldsForPath('/review');
  assert.ok(review.some(row=>row.scope==='cue'&&row.field==='cues'));
  assert.ok(review.some(row=>row.scope==='cue'&&row.field==='cueReviews'));
  assert.ok(!review.some(row=>row.field==='cueChangeHistory'||row.field==='cueCollectionUpdates'));
  const timetable=resourceFieldsForPath('/timetable-hub');
  assert.deepEqual(timetable.map(row=>row.field),['timetable','manualTasks','completions','cancellations','learningReminders']);
  assert.ok(resourceFieldsForPath('/dashboard').some(row=>row.scope==='cue'&&row.field==='cueReviews'));
  assert.deepEqual(resourceFieldsForPath('/dashboard').filter(row=>['cueChangeHistory','cueCollectionUpdates','cueSimilarityDecisions','studyReports'].includes(row.field)),[]);
  assert.ok(resourceFieldsForPath('/study/tasks').some(row=>row.field==='manualTasks'));
  assert.ok(resourceFieldsForPath('/cue/study').some(row=>row.field==='cueGameAccount'));
  assert.ok(resourceFieldsForPath('/settings/watch').some(row=>row.field==='settings'));
  assert.deepEqual(resourceFieldsForPath('/reading'),[],'independent reader state is not misrepresented as Schedule data');
});

test('every writable v5 field has a valid page target without loading all fields on each page',()=>{
  const paths=['/schedule','/dashboard','/study','/review','/cue','/timetable-hub','/activity','/practice-timer','/ielts','/study-guide','/quiz','/pomodoro','/answer-sheet','/settings'];
  const targets=new Set(paths.flatMap(path=>resourceFieldsForPath(path).map(target=>`${target.scope}\0${target.field}`)));
  for(const scope of SYNC_V5_SCOPES)for(const field of resourceFieldsForScope(scope))assert.ok(targets.has(`${scope}\0${field}`),`${scope}/${field} must be writable through a page subscription`);
  const schedule=new Set(resourceFieldsForPath('/schedule').map(target=>target.field));
  assert.ok(schedule.has('cueCollectionUpdates'));
  assert.ok(schedule.has('cueChangeHistory'));
  assert.ok(schedule.has('cueSimilarityDecisions'));
  assert.ok(schedule.has('studyReports'));
  assert.ok(resourceFieldsForPath('/study').some(target=>target.scope==='timer'&&target.field==='practiceSessions'));
  assert.ok(resourceFieldsForPath('/activity').some(target=>target.scope==='practice'&&target.field==='practiceFrequencies'));
  assert.ok(!schedule.has('examDiagnoses'),'schedule should not fetch unrelated practice history');
});
