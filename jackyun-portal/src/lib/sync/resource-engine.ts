import {canonicalJson} from './hash.ts';
import {resourceFieldsForScope,scheduleToResources,SYNC_V5_SCOPES,type SyncV5ResourceTarget,type SyncV5Scope} from './resource-model.ts';
import {acknowledgeV5Operations,commitV5ResourcePage,getV5Conflicts,getV5Cursor,getV5Outbox,getV5Resources,queueV5ResourceOperation,resolveV5ConflictLocally,resolveV5ConflictRemotely,saveV5Conflicts,setV5Cursor,type V5ResourceConflict,type V5ResourceCursor,type V5ResourceOperation,type V5ResourceRecord} from './outbox.ts';

type Descriptor={scope:SyncV5Scope;recordId:string;revision:number;contentHash:string;deleted:boolean;updatedAt:string;sequence?:number};
type Result=Record<string,unknown>;
type ResourceSyncEnvironment={request:(url:string,init?:RequestInit)=>Promise<Response>;deviceId:()=>Promise<string>;readSchedule:()=>string|null;projectSchedule:(value:string|null)=>Promise<void>;setAuthority:(scopes:readonly string[])=>void|Promise<void>;uuid:()=>string;databaseScope?:string;isCurrent?:()=>boolean};
const parse=(raw:string|null)=>{if(!raw)return {};const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Schedule 数据格式无效。');return value as Record<string,unknown>;};
const equal=(a:unknown,b:unknown)=>canonicalJson(a)===canonicalJson(b);
const digest=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(value)))),n=>n.toString(16).padStart(2,'0')).join('');

const targets=(scope:SyncV5Scope,...fields:string[]):SyncV5ResourceTarget[]=>fields.map(field=>({scope,field}));
export function resourceFieldsForPath(pathname:string):SyncV5ResourceTarget[]{
  const path=pathname.length>1?pathname.replace(/\/+$/,''):pathname;
  if(path==='/schedule')return [
    ...targets('timetable','timetable'),...targets('learning','manualTasks','completions','cancellations','reviewProgress'),
    ...targets('cue','cues','cueGameAccount','cueCollectionUpdates','cueChangeHistory','cueSimilarityDecisions','cueStudyDraft','cueStudyDrafts'),
    ...targets('settings','settings','cueScheduleRevision','dailyLearningAdvice','studyReports','schemaVersion'),
  ];
  if(path==='/dashboard')return targets('cue','cues','cueReviews','cueStudyDraft','cueStudyDrafts');
  if(path==='/study'||path.startsWith('/study/'))return [
    ...targets('learning','manualTasks','completions','cancellations','reviewProgress','learningCatalog','learningReminders'),
    ...targets('cue','cues','cueReviews','cueAnswerCards','cueMemos'),...targets('timer','practiceSessions'),
  ];
  if(path==='/review'||path.startsWith('/review/')||path==='/cue'||path.startsWith('/cue/'))return [
    ...targets('cue','cues','cueReviews','cueGameAccount','cueMemos','cueAnswerCards','cueStudyDraft','cueStudyDrafts'),...targets('learning','reviewProgress'),
  ];
  if(path==='/timetable-hub'||path.startsWith('/timetable-hub/'))return [...targets('timetable','timetable'),...targets('learning','manualTasks','completions','cancellations','learningReminders')];
  if(path==='/activity'||path.startsWith('/activity/'))return [...targets('learning','learningRecords'),...targets('practice','timedPracticeRecords','examDiagnoses','practiceFrequencies')];
  if(path==='/practice-timer'||path.startsWith('/practice-timer/'))return [...targets('timer','practiceSessions','practiceTimerConfig'),...targets('practice','timedPracticeRecords','practiceFrequencies')];
  if(path==='/ielts'||path.startsWith('/ielts/'))return targets('practice','timedPracticeRecords','examDiagnoses','practiceFrequencies');
  if(path==='/study-guide')return [...targets('learning','learningCatalog','manualTasks','learningRecords'),...targets('cue','cues','cueMemos')];
  if(path==='/quiz')return [...targets('cue','cues','cueReviews','cueAnswerCards'),...targets('learning','reviewProgress')];
  if(path==='/pomodoro')return [...targets('timer','practiceSessions','practiceTimerConfig'),...targets('learning','manualTasks','completions')];
  if(path==='/answer-sheet')return [...targets('practice','timedPracticeRecords','examDiagnoses'),...targets('learning','learningRecords','manualTasks')];
  if(path==='/settings'||path.startsWith('/settings/'))return targets('settings','settings','schemaVersion','importedAt','dailyLearningAdvice','__root');
  return [];
}

async function readJson(request:ResourceSyncEnvironment['request'],url:string,init?:RequestInit):Promise<Result>{
  const response=await request(url,init);let body:Result;
  try{body=await response.json() as Result;}catch{throw Object.assign(new Error('v5 同步响应格式无效。'),{status:response.status});}
  if(!response.ok)throw Object.assign(new Error(typeof body.error==='string'?body.error:'v5 同步暂不可用。'),{status:response.status,code:body.code});
  return body;
}
function validDescriptor(row:Result,scope:SyncV5Scope):Descriptor{
  if(row.scope!==scope||typeof row.recordId!=='string'||row.recordId.length>240||!Number.isSafeInteger(row.revision)||Number(row.revision)<1
    ||typeof row.contentHash!=='string'||!/^[a-f\d]{64}$/i.test(row.contentHash)||typeof row.deleted!=='boolean'||typeof row.updatedAt!=='string')throw Error('v5 清单记录无效。');
  return row as unknown as Descriptor;
}

export function createV5ResourceSync(environment:ResourceSyncEnvironment){
  const e=environment;
  const assertCurrent=()=>{if(e.isCurrent&&!e.isCurrent())throw new DOMException('Sync cancelled','AbortError');};
  async function fetchPageRecords(target:SyncV5ResourceTarget,descriptors:Descriptor[]):Promise<V5ResourceRecord[]>{
    const active=descriptors.filter(row=>!row.deleted),values:Result[]=[];
    for(let offset=0;offset<active.length;offset+=100){
      const query=new URLSearchParams({scope:target.scope});for(const row of active.slice(offset,offset+100))query.append('id',row.recordId);
      const response=await readJson(e.request,`/api/sync/v5/records?${query}`);
      if(response.syncProtocol!==5||!Array.isArray(response.records))throw Error('v5 资源正文无效。');
      values.push(...response.records as Result[]);
    }
    const byId=new Map(values.map(row=>[row.recordId,row]));
    const records:V5ResourceRecord[]=[];
    for(const descriptor of descriptors){
      if(descriptor.recordId.slice(0,descriptor.recordId.indexOf(':'))!==target.field)throw Error('v5 资源字段与页面订阅不匹配。');
      if(descriptor.deleted){records.push({...descriptor,value:null});continue;}
      const row=byId.get(descriptor.recordId);if(!row||row.revision!==descriptor.revision||row.contentHash!==descriptor.contentHash||row.deleted!==false)throw Error('v5 资源版本在读取期间变化。');
      if(await digest(row.value)!==descriptor.contentHash)throw Error('v5 资源 SHA-256 校验失败。');
      records.push({...descriptor,value:row.value});
    }
    return records;
  }
  async function commit(target:SyncV5ResourceTarget,descriptors:Descriptor[],cursor:V5ResourceCursor){
    const records=await fetchPageRecords(target,descriptors);assertCurrent();
    // A local edit may land while the page request is in flight. Queue it before
    // the page transaction so commitV5ResourcePage overlays it instead of clobbering it.
    await captureLocalChanges(target.scope,target.field);assertCurrent();
    const projected=await commitV5ResourcePage(target.scope,records,{...cursor,field:target.field},e.databaseScope);
    assertCurrent();if(projected!==null)await e.projectSchedule(projected);
  }
  async function baseline(target:SyncV5ResourceTarget){
    let after='',head:number|undefined;
    for(let pages=0;pages<1000;pages++){
      const response=await readJson(e.request,`/api/sync/v5/manifest?scope=${encodeURIComponent(target.scope)}&field=${encodeURIComponent(target.field)}&after=${encodeURIComponent(after)}`);
      if(response.syncProtocol!==5||!Array.isArray(response.records)||response.records.length>100||!Number.isSafeInteger(response.head))throw Error('v5 基线无效。');
      head??=Number(response.head);
      if(Number(response.head)!==head)throw Error('v5 基线头发生变化，请重试。');
      const descriptors=response.records.map(row=>validDescriptor(row as Result,target.scope));
      const next=response.next;
      if(next!==null&&(typeof next!=='string'||!descriptors.length||next!==descriptors.at(-1)?.recordId||next<=after))throw Error('v5 基线游标没有前进。');
      const cursor:V5ResourceCursor=next===null?{scope:target.scope,field:target.field,mode:'changes',after:'',cursor:head,head}:{scope:target.scope,field:target.field,mode:'baseline',after:next,cursor:0,head};
      await commit(target,descriptors,cursor);
      if(next===null)return;
      after=next;
    }
    throw Error('v5 基线超过分页上限。');
  }
  async function pull(target:SyncV5ResourceTarget,retry=true){
    let checkpoint=await getV5Cursor(target.scope,e.databaseScope,target.field);
    if(!checkpoint){await baseline(target);checkpoint=await getV5Cursor(target.scope,e.databaseScope,target.field);}
    if(!checkpoint)throw Error('v5 基线没有提交本地游标。');
    if(checkpoint.mode==='baseline'){await baseline(target);checkpoint=await getV5Cursor(target.scope,e.databaseScope,target.field);if(!checkpoint)throw Error('v5 基线恢复失败。');}
    for(let pages=0;pages<300;pages++){
      let response:Result|null;
      try{response=await readJson(e.request,`/api/sync/v5/changes?scope=${encodeURIComponent(target.scope)}&field=${encodeURIComponent(target.field)}&cursor=${checkpoint.cursor}`);}
      catch(error){if(retry&&(error as {status?:number;code?:string}).status===409){await setV5Cursor(target.scope,null,e.databaseScope,target.field);await baseline(target);response=null;}else throw error;}
      if(!response){checkpoint=await getV5Cursor(target.scope,e.databaseScope,target.field);if(!checkpoint)throw Error('v5 游标已重置。');continue;}
      if(response.syncProtocol!==5||!Array.isArray(response.records)||response.records.length>100||!Number.isSafeInteger(response.cursor))throw Error('v5 增量页面无效。');
      const descriptors=(response.records as Result[]).map((row:Result)=>validDescriptor(row,target.scope));
      if(descriptors.some(row=>row.recordId.slice(0,row.recordId.indexOf(':'))!==target.field))throw Error('v5 增量包含页面未订阅的资源。');
      const next:number=Number(response.cursor);if(next<checkpoint.cursor||next>Number(response.head))throw Error('v5 增量游标无效。');
      await commit(target,descriptors,{scope:target.scope,field:target.field,mode:'changes',after:'',cursor:next,head:Number(response.head)});
      checkpoint={scope:target.scope,field:target.field,mode:'changes',after:'',cursor:next,head:Number(response.head)};
      if(!response.hasMore)return;
    }
    throw Error('v5 增量积压超过单轮上限。');
  }
  async function captureLocalChanges(scope:SyncV5Scope,field:string){
    const cursor=await getV5Cursor(scope,e.databaseScope,field);if(!cursor||cursor.mode!=='changes')return;
    const schedule=parse(e.readSchedule()),wanted=scheduleToResources(schedule).filter(row=>row.scope===scope&&row.field===field),remote=(await getV5Resources(scope,e.databaseScope)).filter(row=>row.recordId.slice(0,row.recordId.indexOf(':'))===field),byId=new Map(remote.map(row=>[row.recordId,row])),pending=await getV5Outbox(scope,e.databaseScope),conflicts=await getV5Conflicts(e.databaseScope);
    const blocked=new Set(conflicts.filter(row=>row.scope===scope&&row.recordId.slice(0,row.recordId.indexOf(':'))===field).map(row=>row.recordId)),pendingIds=new Set(pending.filter(row=>row.scope===scope&&row.recordId.slice(0,row.recordId.indexOf(':'))===field).map(row=>row.recordId));
    const wantedById=new Map(wanted.map(row=>[row.recordId,row]));
    const changes:Array<{recordId:string;value:unknown;deleted:boolean}>=[...wanted.map(row=>({recordId:row.recordId,value:row.value,deleted:false})),
      ...remote.filter(row=>!row.deleted&&!wantedById.has(row.recordId)).map(row=>({recordId:row.recordId,value:null,deleted:true}))];
    for(const change of changes){
      if(blocked.has(change.recordId)||pendingIds.has(change.recordId))continue;
      const base=byId.get(change.recordId),same=base?base.deleted===change.deleted&&(change.deleted||equal(base.value,change.value)):false;
      if(same||(!base&&change.deleted))continue;
      assertCurrent();await queueV5ResourceOperation({id:e.uuid(),scope,recordId:change.recordId,baseRevision:base?.revision??0,baseHash:base?.contentHash??null,value:change.value,deleted:change.deleted,clientUpdatedAt:new Date().toISOString()},e.databaseScope);
    }
  }
  async function resolveReceipt(scope:SyncV5Scope,operation:V5ResourceOperation,result:Result){
    if(result.status==='applied'){
      const projected=await acknowledgeV5Operations([{operation,revision:Number(result.revision),contentHash:String(result.contentHash),updatedAt:String(result.updatedAt??new Date().toISOString())}],e.databaseScope);
      assertCurrent();if(projected!==null)await e.projectSchedule(projected);return true;
    }
    if(result.status==='conflict'){
      const conflict:V5ResourceConflict={operationId:operation.id,scope,recordId:operation.recordId,baseRevision:operation.baseRevision,baseHash:operation.baseHash,
        localValue:operation.value,localDeleted:operation.deleted,remoteValue:result.value??null,remoteDeleted:Boolean(result.deleted),remoteRevision:Number(result.revision),remoteHash:typeof result.contentHash==='string'?result.contentHash:null,createdAt:new Date().toISOString()};
      await saveV5Conflicts([conflict],e.databaseScope);return true;
    }
    return false;
  }
  async function push(scope:SyncV5Scope){
    for(let batches=0;batches<20;batches++){
      const queued=await getV5Outbox(scope,e.databaseScope),operations:V5ResourceOperation[]=[];
      for(const operation of queued.slice(0,100)){const candidate=[...operations,operation],bytes=new TextEncoder().encode(JSON.stringify({scope,deviceId:'00000000-0000-4000-8000-000000000000',operations:candidate})).length;if(bytes>850_000&&operations.length)break;operations.push(operation);}
      if(!operations.length)return;
      const deviceId=await e.deviceId(),hashes=await Promise.all(operations.map(async operation=>({id:operation.id,requestHash:await digest(operation)})));
      const receipts=await readJson(e.request,`/api/sync/v5/receipts?scope=${encodeURIComponent(scope)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope,operations:hashes})});
      const confirmed=new Set<string>();
      if(Array.isArray(receipts.receipts))for(const receipt of receipts.receipts as Result[]){
        const operation=operations.find(row=>row.id===receipt.operationId);if(operation&&receipt.state==='confirmed'&&await resolveReceipt(scope,operation,receipt.result as Result))confirmed.add(operation.id);
      }
      const unknown=operations.filter(operation=>!confirmed.has(operation.id));if(!unknown.length)continue;
      const response=await readJson(e.request,`/api/sync/v5/operations?scope=${encodeURIComponent(scope)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope,deviceId,operations:unknown})});
      if(response.syncProtocol!==5||!Array.isArray(response.applied)||!Array.isArray(response.conflicts))throw Error('v5 写入回执无效。');
      for(const result of response.applied as Result[]){const operation=unknown.find(row=>row.id===result.operationId);if(operation)await resolveReceipt(scope,operation,result);}
      for(const result of response.conflicts as Result[]){const operation=unknown.find(row=>row.id===result.operationId);if(operation)await resolveReceipt(scope,operation,result);}
      if(!response.applied.length&&!response.conflicts.length)throw Error('v5 写入未确认，原操作保持队列。');
    }
    throw Error('v5 上传队列超过单轮上限。');
  }
  async function refreshAuthority(){
    const capabilities=await readJson(e.request,'/api/sync/v5');
    assertCurrent();
    const flags=capabilities.capabilities as Record<string,unknown>|undefined;
    const scopes=flags?.v5===true&&Array.isArray(capabilities.scopes)?capabilities.scopes.filter((scope):scope is SyncV5Scope=>SYNC_V5_SCOPES.includes(scope as SyncV5Scope)):[];
    await e.setAuthority(scopes);
    const enabled=flags?.v5===true&&scopes.length>0;
    return {enabled,authoritativeSchedule:enabled&&SYNC_V5_SCOPES.every(scope=>scopes.includes(scope)),scopes};
  }
  async function synchronize(requestedScopes:readonly (SyncV5Scope|SyncV5ResourceTarget)[]){
    const authority=await refreshAuthority();if(!authority.enabled)return {enabled:false,authoritativeSchedule:false,conflicts:await getV5Conflicts(e.databaseScope)};
    const {scopes}=authority;
    // Snapshot current local edits before remote pages can replace their resource rows.
    const requestedTargets= requestedScopes.flatMap((item):SyncV5ResourceTarget[]=>typeof item==='string'?resourceFieldsForScope(item as SyncV5Scope).map(field=>({scope:item as SyncV5Scope,field})):[item]);
    const uniqueTargets=[...new Map(requestedTargets.filter(item=>scopes.includes(item.scope)&&resourceFieldsForScope(item.scope).includes(item.field)).map(item=>[`${item.scope}\0${item.field}`,item])).values()];
    for(const target of uniqueTargets)await captureLocalChanges(target.scope,target.field);
    for(const target of uniqueTargets)await pull(target);
    for(const target of uniqueTargets)await captureLocalChanges(target.scope,target.field);
    for(const scope of scopes)await push(scope);
    for(const target of uniqueTargets)await pull(target);
    return {enabled:true,authoritativeSchedule:authority.authoritativeSchedule,conflicts:await getV5Conflicts(e.databaseScope)};
  }
  async function resolveConflict(operationId:string,choice:'local'|'remote'){
    if(choice==='local')await resolveV5ConflictLocally(operationId,e.uuid(),e.databaseScope);
    else {const projected=await resolveV5ConflictRemotely(operationId,e.databaseScope);if(projected!==null)await e.projectSchedule(projected);}
  }
  return {synchronize,resolveConflict,refreshAuthority};
}
