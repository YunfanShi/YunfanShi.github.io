import assert from 'node:assert/strict';
import test from 'node:test';
import {IDBFactory} from 'fake-indexeddb';
import {commitV5ResourcePage,getV5Cursor,getV5Resources,openDatabase} from '../src/lib/sync/outbox.ts';
import {createV5ResourceSync} from '../src/lib/sync/resource-engine.ts';
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

test('v5 client downloads only changed records, queues a stable resource operation, and stays incremental',async()=>{
  const dbName=id(),schedule={schemaVersion:1,cues:[{id:'cue-1',prompt:'from cloud'}]},hash=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
  const rows=new Map<string,{scope:'cue';recordId:string;revision:number;contentHash:string;deleted:boolean;updatedAt:string;value:unknown}>([
    ['cues:%24order',{scope:'cue',recordId:'cues:%24order',revision:1,contentHash:hash(['cue-1']),deleted:false,updatedAt:'now',value:['cue-1']}],
    ['cues:cue-1',{scope:'cue',recordId:'cues:cue-1',revision:1,contentHash:hash(schedule.cues[0]),deleted:false,updatedAt:'now',value:schedule.cues[0]}],
  ]);
  await seed(dbName,JSON.stringify({schemaVersion:1,cues:[]}));let head=1,recordReads=0,manifestReads=0;const operationIds:string[]=[];
  const request=async(url:string,init?:RequestInit)=>{
    const parsed=new URL(url,'https://sync.test'),scope=parsed.searchParams.get('scope');
    if(parsed.pathname==='/api/sync/v5')return Response.json({syncProtocol:5,capabilities:{v5:true},scopes:SYNC_V5_SCOPES});
    if(parsed.pathname==='/api/sync/v5/manifest'){manifestReads++;const records=[...rows.values()].map(row=>({scope:row.scope,recordId:row.recordId,revision:row.revision,contentHash:row.contentHash,deleted:row.deleted,updatedAt:row.updatedAt}));return Response.json({syncProtocol:5,records,next:null,head});}
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
  let scheduleRaw=JSON.stringify({schemaVersion:1,cues:[]});
  const engine=createV5ResourceSync({databaseScope:dbName,request,deviceId:async()=>'00000000-0000-4000-8000-000000000001',readSchedule:()=>scheduleRaw,projectSchedule:async value=>{if(value!==null)scheduleRaw=value;},setAuthority:()=>{},uuid:()=>crypto.randomUUID()});
  const readDocument=async()=>{const db=await openDatabase(dbName);try{return await new Promise<string>((resolve,reject)=>{const tx=db.transaction('documents','readonly'),r=tx.objectStore('documents').get('jackyun_schedule_control_v1');r.onsuccess=()=>resolve(r.result.value);r.onerror=()=>reject(r.error);});}finally{db.close();}};
  await engine.synchronize(['cue']);
  assert.deepEqual(JSON.parse(await readDocument()),schedule);
  const changed={...schedule,cues:[{id:'cue-1',prompt:'edited locally'}]};scheduleRaw=JSON.stringify(changed);
  const db=await openDatabase(dbName);try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({key:'jackyun_schedule_control_v1',value:JSON.stringify(changed),updatedAt:Date.now()});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}
  await engine.synchronize(['cue']);
  assert.deepEqual(operationIds,['cues:cue-1']);
  assert.equal((await getV5Resources('cue',dbName)).find(row=>row.recordId==='cues:cue-1')?.revision,2);
  const readsAfterMutation=recordReads;await engine.synchronize(['cue']);
  assert.equal(manifestReads,1);assert.equal(recordReads,readsAfterMutation);
});
