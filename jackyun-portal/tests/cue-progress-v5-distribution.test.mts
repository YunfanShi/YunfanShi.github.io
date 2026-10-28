import assert from 'node:assert/strict';
import test from 'node:test';
import {IDBFactory} from 'fake-indexeddb';
import {createHash} from 'node:crypto';
import {createV5ResourceSync} from '../src/lib/sync/resource-engine.ts';
import {canonicalJson} from '../src/lib/sync/hash.ts';
import {openDatabase} from '../src/lib/sync/outbox.ts';
import {readScheduleState} from '../src/lib/learning/workspace-reader.ts';
import {allCueStudyDrafts} from '../src/lib/learning/schedule-control.ts';

Object.assign(globalThis,{indexedDB:new IDBFactory()});
type Row={scope:string;recordId:string;field:string;revision:number;contentHash:string;deleted:boolean;updatedAt:string;value:unknown;sequence:number};
const digest=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');

test('interrupted CUE study draft and its cards restore on a clean desktop',async()=>{
  const cueIds=Array.from({length:380},(_,index)=>`cue-${String(index).padStart(4,'0')}`);
  const draftKey='联合 CUE · Physics、Statistics、Mechanics';
  const draft={id:'study-interrupted-001',task:{key:'study-interrupted-001',title:'学习 · 联合 CUE',subjectName:'Physics'},
    cueIds,index:76,revealed:true,selectedChoice:2,
    assessments:Object.fromEntries(cueIds.slice(0,75).map((id,index)=>[id,index%2?'partial':'stable'])),
    priorStatuses:Object.fromEntries(cueIds.map((id,index)=>[id,index%2?'unclear':'partial'])),
    practice:{completed:0,pending:cueIds.slice(76,90),mode:false,lastCueId:cueIds[76],results:Object.fromEntries(cueIds.slice(70,76).map((id,index)=>[id,{correct:index%2===0}]))},
    updatedAt:'2026-10-25T11:25:46.372Z'};
  const phone={schemaVersion:1,cues:cueIds.map((id,index)=>({id,subjectId:'physics',subjectName:'Physics',unit:'Mechanics',subsection:'',type:'definition',
    prompt:`Synthetic CUE prompt ${index}`,answer:`Synthetic answer ${index}`,markingPoints:[],intervalDays:0,easeFactor:2.5,streak:0,
    createdAt:'2026-10-25T00:00:00.000Z',updatedAt:'2026-10-25T00:00:00.000Z',status:'unclear'})),
  cueStudyDrafts:{[draftKey]:draft},cueReviews:Array.from({length:1170},(_,index)=>({
    id:`cue-${String(index).padStart(4,'0')}:2026-10-${String(index%28+1).padStart(2,'0')}T08:00:00.000Z`,
    cueId:`cue-${String(index).padStart(4,'0')}`,status:index%3===0?'stable':index%3===1?'partial':'unclear',
    reviewedAt:`2026-10-${String(index%28+1).padStart(2,'0')}T08:00:00.000Z`,nextReviewDate:`2026-11-${String(index%28+1).padStart(2,'0')}`,
  })),reviewProgress:Object.fromEntries(Array.from({length:5},(_,index)=>[`subject-${index}`,{
    subjectId:`subject-${index}`,intervalDays:index+1,easeFactor:2.5,nextReviewDate:'2026-11-01',lastStatus:'partial',updatedAt:'2026-10-28T00:00:00.000Z',
  }]))};
  const expected={cues:phone.cues,cueStudyDrafts:phone.cueStudyDrafts,cueReviews:phone.cueReviews,reviewProgress:phone.reviewProgress};
  const remote=new Map<string,Row>();let sequence=0,writeBatches=0;
  const request=async(url:string,init?:RequestInit)=>{
    const parsed=new URL(url,'https://v5.test'),scope=parsed.searchParams.get('scope')??'';
    if(parsed.pathname==='/api/sync/v5')return Response.json({syncProtocol:5,capabilities:{v5:true},scopes:['cue','learning','settings']});
    if(parsed.pathname==='/api/sync/v5/receipts')return Response.json({syncProtocol:5,receipts:[]});
    if(parsed.pathname==='/api/sync/v5/operations'){
      writeBatches++;
      const body=JSON.parse(String(init?.body)) as {operations:Array<{id:string;recordId:string;baseRevision:number;value:unknown;deleted:boolean}>};
      const batchIds=new Set<string>();
      const applied=body.operations.map(operation=>{
        const key=`${scope}\0${operation.recordId}`,prior=remote.get(key);
        assert.equal(operation.baseRevision,prior?.revision??0,'each resource record must be submitted once against its current base');
        assert.equal(batchIds.has(operation.recordId),false,'a write batch must not duplicate a resource record');batchIds.add(operation.recordId);
        const row:Row={scope,recordId:operation.recordId,field:operation.recordId.slice(0,operation.recordId.indexOf(':')),
          revision:(prior?.revision??0)+1,contentHash:operation.deleted?'':digest(operation.value),deleted:operation.deleted,
          updatedAt:'2026-10-28T00:00:00.000Z',value:operation.deleted?null:operation.value,sequence:++sequence};
        remote.set(key,row);
        return {status:'applied',operationId:operation.id,revision:row.revision,contentHash:row.contentHash,updatedAt:row.updatedAt};
      });
      return Response.json({syncProtocol:5,applied,conflicts:[]});
    }
    const field=parsed.searchParams.get('field')??'';
    if(parsed.pathname==='/api/sync/v5/manifest'){
      const after=parsed.searchParams.get('after')??'';
      const rows=[...remote.values()].filter(row=>row.scope===scope&&row.field===field&&row.recordId>after).sort((a,b)=>a.recordId.localeCompare(b.recordId));
      const page=rows.slice(0,100),next=rows.length>100?page.at(-1)!.recordId:null;
      return Response.json({syncProtocol:5,records:page.map(row=>{const descriptor={...row};delete descriptor.value;delete descriptor.sequence;return descriptor;}),next,head:sequence});
    }
    if(parsed.pathname==='/api/sync/v5/records'){
      const ids=parsed.searchParams.getAll('id');
      return Response.json({syncProtocol:5,records:ids.map(id=>remote.get(`${scope}\0${id}`)).filter(Boolean)});
    }
    if(parsed.pathname==='/api/sync/v5/changes'){
      const cursor=Number(parsed.searchParams.get('cursor')??0),rows=[...remote.values()].filter(row=>row.scope===scope&&row.field===field&&row.sequence>cursor).sort((a,b)=>a.sequence-b.sequence);
      const page=rows.slice(0,100),next=page.at(-1)?.sequence??sequence;
      return Response.json({syncProtocol:5,records:page.map(row=>{const descriptor={...row};delete descriptor.value;return descriptor;}),cursor:next,head:sequence,hasMore:rows.length>100});
    }
    throw Error(`Unexpected v5 request ${parsed.pathname}`);
  };
  const targets=[{scope:'cue' as const,field:'cues'},{scope:'cue' as const,field:'cueStudyDrafts'},
    {scope:'cue' as const,field:'cueReviews'},{scope:'learning' as const,field:'reviewProgress'},
    {scope:'settings' as const,field:'schemaVersion'}];
  const phoneDb=`phone-${crypto.randomUUID()}`,desktopDb=`desktop-${crypto.randomUUID()}`;
  let phoneProjection=JSON.stringify(phone),desktopProjection=JSON.stringify({schemaVersion:1,cues:[]});
  const db=await openDatabase(phoneDb);
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({key:'jackyun_schedule_control_v1',value:phoneProjection,updatedAt:1});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}
  const makeEngine=(databaseScope:string,read:()=>string|null,write:(value:string|null)=>Promise<void>)=>createV5ResourceSync({databaseScope,request,
    readSchedule:read,projectSchedule:write,setAuthority:()=>{},deviceId:async()=>crypto.randomUUID(),uuid:()=>crypto.randomUUID()});
  await makeEngine(phoneDb,()=>phoneProjection,async value=>{phoneProjection=value??'{}';}).synchronize(targets);
  assert.ok(writeBatches>1,'large history must be split into bounded operation requests');
  assert.equal([...remote.values()].filter(row=>row.scope==='cue'&&row.field==='cueReviews'&&!row.deleted).length,1171);
  assert.equal([...remote.values()].filter(row=>row.scope==='cue'&&row.field==='cueStudyDrafts'&&!row.deleted).length,2);
  await makeEngine(desktopDb,()=>desktopProjection,async value=>{desktopProjection=value??'{}';}).synchronize(targets);
  const received=JSON.parse(desktopProjection) as Record<string,unknown>;
  assert.equal(canonicalJson(received.cues),canonicalJson(expected.cues),'referenced CUE cards must arrive with the interrupted draft');
  assert.equal(canonicalJson(received.cueStudyDrafts),canonicalJson(expected.cueStudyDrafts));
  const restoredDraft=(received.cueStudyDrafts as Record<string,typeof draft>)[draftKey];
  assert.equal(restoredDraft.index,76,'desktop must resume at the interrupted position');
  assert.equal(restoredDraft.cueIds.length,380);
  assert.equal(Object.keys(restoredDraft.assessments).length,75,'completed answers must remain completed');
  assert.equal(restoredDraft.revealed,true,'the current card reveal state must survive device transfer');
  assert.equal(restoredDraft.practice.pending.length,14,'the unfinished practice queue must survive device transfer');
  assert.equal(Object.keys(restoredDraft.practice.results).length,6,'practice results must survive device transfer');
  const restoredState=readScheduleState({getItem:key=>key==='jackyun_schedule_control_v1'?desktopProjection:null});
  const resumable=Object.values(allCueStudyDrafts(restoredState))[0];
  assert.equal(resumable.index,76,'Schedule hydration must expose the cloud draft to the resume UI');
  assert.equal(resumable.cueIds.filter(id=>received.cues&&Array.isArray(received.cues)&&received.cues.some((cue)=>cue.id===id)).length,380,
    'every ID in the interrupted draft must resolve to a downloaded CUE card');
  assert.equal(canonicalJson(received.cueReviews),canonicalJson(expected.cueReviews));
  assert.equal(canonicalJson(received.reviewProgress),canonicalJson(expected.reviewProgress));
});
