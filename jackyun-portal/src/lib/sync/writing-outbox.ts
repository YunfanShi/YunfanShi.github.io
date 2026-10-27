import type {SyncOperation,SyncConflict,SyncRecord,SyncSubmission} from '../../types/sync.ts';
import type {V5ResourceRecord,V5ResourceOperation,V5ResourceConflict,V5ResourceCursor} from './outbox.ts';
import {canonicalJson} from './hash.ts';
import {threeWayMerge} from './merge.ts';
import {legacyWorkspaceRecordId,legacyWorkspaceKeyFromRecordId} from './resource-model.ts';
import {WRITING_COLLECTIONS,splitWritingCollection,writingItemKey,writingItemId,writingMarkerKey,writingProjectionKeys,type WritingCollection} from './writing-resource-model.ts';

type DocumentRow={key:string;value:string|null;projectedValue?:string|null;writingProjection?:boolean};
type Update={key:string;value:string|null};
type Setting={key:string;value:unknown};
type Snapshot={resources:V5ResourceRecord[];cursors:V5ResourceCursor[];pending:V5ResourceOperation[];blocked:V5ResourceConflict[];
  documents:DocumentRow[];legacy:SyncOperation[];legacyConflicts:SyncConflict[];settings:Setting[];metadata:SyncRecord[]};
const stores=['v5Resources','v5FieldCursors','v5Outbox','v5Conflicts','documents','outbox','conflicts','settings','metadata'] as const;
function transaction<T>(db:IDBDatabase,work:(tx:IDBTransaction,state:Snapshot)=>T):Promise<T>{
  return new Promise((resolve,reject)=>{
    const tx=db.transaction([...stores],'readwrite'),requests=stores.map(name=>tx.objectStore(name).getAll());
    let completed=0,result:T;
    for(const request of requests){
      request.onsuccess=()=>{if(++completed!==requests.length)return;try{
        result=work(tx,{resources:requests[0].result,cursors:requests[1].result,pending:requests[2].result,blocked:requests[3].result,
          documents:requests[4].result,legacy:requests[5].result,legacyConflicts:requests[6].result,settings:requests[7].result,metadata:requests[8].result});
      }catch(error){tx.abort();reject(error);}};
    }
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('Writing transaction aborted'));
  });
}
const setting=<T>(state:Snapshot,key:string)=>state.settings.find(row=>row.key===key)?.value as T|undefined;
const parse=(value:string|null|undefined)=>value==null?[]:JSON.parse(value);
function entries(collection:WritingCollection,value:unknown):Map<string,Record<string,unknown>>{
  // Validate through the shared parser; a failed conversion leaves every original row untouched.
  return new Map(splitWritingCollection(collection,value).map(row=>[row.id,row.value]));
}
function remoteItems(state:Snapshot,collection:WritingCollection):Map<string,V5ResourceRecord>{
  return new Map(state.resources.filter(row=>row.scope==='workspace').flatMap(row=>{
    const key=legacyWorkspaceKeyFromRecordId(row.recordId),id=key&&writingItemId(collection,key);return id?[[id,row] as const]:[];
  }));
}
function writeProjection(tx:IDBTransaction,state:Snapshot,collection:WritingCollection,visible:Map<string,unknown>):Update[]{
  const values=[...visible.values()].filter(value=>value!==undefined) as Record<string,unknown>[];
  values.sort((a,b)=>String(b.savedAt??'').localeCompare(String(a.savedAt??''))||String(a[collection.idField]).localeCompare(String(b[collection.idField])));
  const value=JSON.stringify(values),keys=writingProjectionKeys(collection),updates:Update[]=[];
  for(const key of keys){
    const old=state.documents.find(row=>row.key===key),isArray=key===collection.legacyKey||key==='jackyun_ielts_writing_workspaces_mirror_v1';
    if(!isArray&&!old)continue;
    const next=isArray?value:old!.value;
    tx.objectStore('documents').put({...old,key,value:next,writingProjection:true,updatedAt:Date.now()});
    if(isArray)updates.push({key,value:next});
  }
  return updates;
}
function saveConflict(tx:IDBTransaction,collection:WritingCollection,id:string,local:unknown,remote:V5ResourceRecord|undefined,base:V5ResourceRecord|undefined):string{
  const operationId=crypto.randomUUID();
  tx.objectStore('v5Conflicts').put({operationId,scope:'workspace',recordId:legacyWorkspaceRecordId(writingItemKey(collection,id))!,
    baseRevision:base?.revision??0,baseHash:base?.contentHash??null,localValue:local??null,localDeleted:local===undefined,
    remoteValue:remote?.deleted?null:remote?.value??null,remoteDeleted:!remote||remote.deleted,remoteRevision:remote?.revision??0,
    remoteHash:remote?.contentHash??null,createdAt:new Date().toISOString()} satisfies V5ResourceConflict);
  return operationId;
}
export type WritingPreparation={updates:Update[];active:boolean;deferred?:string};
export function prepareWritingCollection(db:IDBDatabase,field:string):Promise<WritingPreparation>{
  const collection=WRITING_COLLECTIONS.find(row=>row.field===field);if(!collection)return Promise.resolve({updates:[],active:false});
  return transaction(db,(tx,state)=>{
    const active=setting<string[]>(state,'v5WritingCollections')??[];
    if(active.includes(field))return {updates:[],active:true};
    const cursor=state.cursors.find(row=>row.scope==='workspace'&&row.field===field);
    const marker=state.resources.find(row=>row.recordId===legacyWorkspaceRecordId(writingMarkerKey(collection))&&row.scope==='workspace');
    if(cursor?.mode!=='changes'||!marker||marker.deleted)return {updates:[],active:false,deferred:'baseline'};
    const keys=new Set(writingProjectionKeys(collection)),submission=setting<SyncSubmission>(state,'syncSubmission');
    if(submission?.operations.some(row=>keys.has(row.key)))return {updates:[],active:false,deferred:'submission'};
    if(state.legacyConflicts.some(row=>keys.has(row.key)))return {updates:[],active:false,deferred:'legacy-conflict'};
    if(state.pending.some(row=>row.scope==='workspace'&&row.recordId.startsWith(`${field}:`))||state.blocked.some(row=>row.scope==='workspace'&&row.recordId.startsWith(`${field}:`)))return {updates:[],active:false,deferred:'v5-intent'};
    const doc=state.documents.find(row=>row.key===collection.legacyKey),pending=state.legacy.find(row=>row.key===collection.legacyKey);
    if(doc&&pending&&canonicalJson(parse(doc.value))!==canonicalJson(pending.deleted?[]:pending.value))return {updates:[],active:false,deferred:'local-changed'};
    const local=entries(collection,doc?parse(doc.value):pending&&!pending.deleted?pending.value:[]);
    if(field==='writingEssays'){
      const draft=state.documents.find(row=>row.key==='jackyun_ielts_writing_draft_v1');
      if(draft?.value){const value=JSON.parse(draft.value) as Record<string,unknown>;
        if([value.essay,value.question,value.originalEssay].some(text=>typeof text==='string'&&text.trim())){
          const materialized=local.get(String(value.essayId))?.draft as Record<string,unknown>|undefined;
          if(!materialized||['essayId','essay','question','originalEssay','task'].some(key=>canonicalJson(value[key])!==canonicalJson(materialized[key])))return {updates:[],active:false,deferred:'draft-not-materialized'};
        }
      }
    }
    const metadata=state.metadata.find(row=>row.key===collection.legacyKey);
    const base=entries(collection,pending?(pending.baseDeleted?[]:pending.baseValue??[]):metadata&&!metadata.deleted?metadata.value:[]);
    const hasIntent=Boolean(pending)||Boolean(doc&&(!metadata||canonicalJson(parse(doc.value))!==canonicalJson(metadata.deleted?[]:metadata.value)));
    const remote=remoteItems(state,collection),visible=new Map<string,unknown>(),children:string[]=[];
    for(const id of new Set([...base.keys(),...local.keys(),...remote.keys()])){
      const cloud=remote.get(id),remoteValue=cloud?.deleted?undefined:cloud?.value;
      const result=hasIntent?threeWayMerge(base.get(id),local.get(id),remoteValue):{merged:remoteValue,conflicts:[]};
      const value=result.conflicts.length?local.get(id):result.merged;
      visible.set(id,value);
      if(result.conflicts.length){children.push(saveConflict(tx,collection,id,local.get(id),cloud,undefined));continue;}
      if(canonicalJson(value)!==canonicalJson(remoteValue)){
        const operation:V5ResourceOperation={id:crypto.randomUUID(),scope:'workspace',recordId:legacyWorkspaceRecordId(writingItemKey(collection,id))!,
          baseRevision:cloud?.revision??0,baseHash:cloud?.contentHash??null,value:value??null,deleted:value===undefined,clientUpdatedAt:new Date().toISOString()};
        tx.objectStore('v5Outbox').put(operation);children.push(operation.id);
      }
    }
    for(const row of state.legacy)if(keys.has(row.key)){
      tx.objectStore('settings').put({key:`v5WritingHandoff:${row.id}`,value:{sourceKey:row.key,children,convertedAt:new Date().toISOString()}});
      tx.objectStore('outbox').delete(row.id);
    }
    tx.objectStore('settings').put({key:'v5WritingCollections',value:[...new Set([...active,field])]});
    tx.objectStore('settings').put({key:'v5WorkspaceAuthorityKeys',value:[...new Set([...(setting<string[]>(state,'v5WorkspaceAuthorityKeys')??[]),...keys])].sort()});
    return {updates:writeProjection(tx,state,collection,visible),active:true};
  });
}

export async function commitWritingPage(open:(scope?:string)=>Promise<IDBDatabase>,records:V5ResourceRecord[],cursor:V5ResourceCursor,dbScope?:string):Promise<Update[]>{
  const collection=WRITING_COLLECTIONS.find(row=>row.field===cursor.field);
  if(!collection||cursor.scope!=='workspace')return Promise.reject(Error('Writing page field invalid'));
  const db=await open(dbScope);
  try{return await transaction(db,(tx,state)=>{
    const prior=remoteItems(state,collection),resourceStore=tx.objectStore('v5Resources');
    for(const row of records){
      if(row.scope!=='workspace'||!row.recordId.startsWith(`${collection.field}:`))throw Error('Writing page field mismatch');
      const key=legacyWorkspaceKeyFromRecordId(row.recordId);
      if(!key||key!==writingMarkerKey(collection)&&writingItemId(collection,key)===null)throw Error('Writing record identity invalid');
      resourceStore.put(row);
      const index=state.resources.findIndex(old=>old.scope==='workspace'&&old.recordId===row.recordId);
      if(index<0)state.resources.push(row);else state.resources[index]=row;
    }
    tx.objectStore('v5FieldCursors').put(cursor);
    if(cursor.mode==='baseline')return [];
    const active=(setting<string[]>(state,'v5WritingCollections')??[]).includes(collection.field);
    const updates:Update[]=[];
    if(!active){
      const candidates=!state.cursors.some(row=>row.scope==='workspace'&&row.field===collection.field&&row.mode==='changes')
        ?state.resources.filter(row=>row.scope==='workspace'&&row.recordId.startsWith(`${collection.field}:`)):records;
      for(const row of candidates){
        const key=legacyWorkspaceKeyFromRecordId(row.recordId)!;
        if(key!==collection.legacyKey&&key!=='jackyun_ielts_writing_workspaces_mirror_v1')continue;
        if(state.legacy.some(operation=>operation.key===key)||state.legacyConflicts.some(conflict=>conflict.key===key)
          ||setting<SyncSubmission>(state,'syncSubmission')?.operations.some(operation=>operation.key===key))continue;
        if(state.pending.some(op=>op.recordId===row.recordId)||state.blocked.some(op=>op.recordId===row.recordId))continue;
        const value=row.deleted?null:JSON.stringify(row.value);
        tx.objectStore('documents').put({key,value,updatedAt:Date.now()});updates.push({key,value});
      }
      return updates;
    }
    const local=entries(collection,parse(state.documents.find(row=>row.key===collection.legacyKey)?.value));
    const remote=remoteItems(state,collection),visible=new Map<string,unknown>();
    for(const id of new Set([...prior.keys(),...local.keys(),...remote.keys()])){
      const base=prior.get(id),cloud=remote.get(id),recordId=legacyWorkspaceRecordId(writingItemKey(collection,id))!;
      if(state.pending.some(row=>row.recordId===recordId)||state.blocked.some(row=>row.recordId===recordId)){
        visible.set(id,local.get(id));continue;
      }
      const result=threeWayMerge(base?.deleted?undefined:base?.value,local.get(id),cloud?.deleted?undefined:cloud?.value);
      if(result.conflicts.length){saveConflict(tx,collection,id,local.get(id),cloud,base);visible.set(id,local.get(id));}
      else visible.set(id,result.merged);
    }
    return writeProjection(tx,state,collection,visible);
  });}finally{db.close();}
}

export async function resolveWritingConflictRemotely(open:(scope?:string)=>Promise<IDBDatabase>,operationId:string,dbScope?:string):Promise<Update[]>{
  const db=await open(dbScope);
  try{return await transaction(db,(tx,state)=>{
    const conflict=state.blocked.find(row=>row.operationId===operationId);
    if(!conflict||conflict.scope!=='workspace')return [];
    const key=legacyWorkspaceKeyFromRecordId(conflict.recordId),collection=key&&WRITING_COLLECTIONS.find(row=>writingItemId(row,key)!==null);
    if(!key||!collection)return [];
    const id=writingItemId(collection,key)!;
    const document=state.documents.find(row=>row.key===collection.legacyKey);
    const visible=entries(collection,parse(document?.value)),current=visible.get(id);
    const reviewed=conflict.localDeleted?undefined:conflict.localValue;
    const changedAfterConflict=canonicalJson(current)!==canonicalJson(reviewed);
    const remote=conflict.remoteDeleted?undefined:conflict.remoteValue;
    if(remote!==undefined&&(!remote||typeof remote!=='object'||Array.isArray(remote)))throw Error('Writing conflict remote value is invalid');
    const saved:V5ResourceRecord={scope:'workspace',recordId:conflict.recordId,revision:conflict.remoteRevision,contentHash:conflict.remoteHash,
      deleted:conflict.remoteDeleted,updatedAt:new Date().toISOString(),value:conflict.remoteValue};
    tx.objectStore('v5Resources').put(saved);
    tx.objectStore('v5Conflicts').delete(operationId);tx.objectStore('v5Outbox').delete(operationId);
    if(changedAfterConflict){
      if(current===undefined&&remote===undefined)return writeProjection(tx,state,collection,visible);
      if(canonicalJson(current)!==canonicalJson(remote))tx.objectStore('v5Outbox').put({id:crypto.randomUUID(),scope:'workspace',recordId:conflict.recordId,
        baseRevision:conflict.remoteRevision,baseHash:conflict.remoteHash,value:current??null,deleted:current===undefined,clientUpdatedAt:new Date().toISOString()} satisfies V5ResourceOperation);
    }else if(remote===undefined)visible.delete(id);else visible.set(id,remote as Record<string,unknown>);
    return writeProjection(tx,state,collection,visible);
  });}finally{db.close();}
}
