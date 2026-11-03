'use client';
import { isSyncableStorageKey, CLOUD_STATE_APPLIED_EVENT } from '../local-workspace.ts';
import { bindSyncUser, getDocuments, persistDocument, activateGuestRepository,evictDownloadCache,projectionOwner,clearDocumentProjections } from './outbox.ts';
import {readLocalData,writeLocalData} from './local-data.ts';
import { SYNC_V5_SCHEDULE_SCOPES } from './resource-model.ts';

const memory=new Map<string,string|null>();
const localMemory=new Map<string,string|null>();
let tail:Promise<void>=Promise.resolve(),ready:Promise<void>|null=null,failed:unknown=null,pending=0;
let currentOwner:string|null|undefined;
let v5ScheduleAuthority=false;
let v5WorkspaceAuthorityKeys=new Set<string>();
let saveState:'saving'|'saved'|'storage_error'|'projection_degraded'='saving';
export const getLocalSaveState=()=>saveState;
export function setV5ScheduleAuthority(scopes:readonly string[]):void{v5ScheduleAuthority=SYNC_V5_SCHEDULE_SCOPES.every(scope=>scopes.includes(scope));}
export function setV5WorkspaceAuthorityKeys(keys:readonly string[]):void{v5WorkspaceAuthorityKeys=new Set(keys);}
/** Long-running imports must retain their creating account, including after network waits. */
export async function captureRepositoryContext(){
  const initialization=ready??initializeRepository(currentOwner??null);
  await initialization;
  const owner=currentOwner??null;
  if(initialization!==ready||await projectionOwner()!==(owner??'guest'))throw Error('账号已变化，请重新打开当前页面。');
  return {owner,databaseScope:`jackyun-sync-v2:${owner??'guest'}`,
    assertCurrent(){if(currentOwner!==owner||ready!==initialization)throw Error('账号已变化，导入已停止。');}};
}
const failures=new Map<string,{value:string|null;error:unknown;expected?:string|null}>();
let compatibilityInstalled=false;
let crossTabChannel:BroadcastChannel|undefined;
let nativeLocalRemove:Storage['removeItem']|undefined;
let nativeLocalGet:Storage['getItem']|undefined;
const isManagedLocalKey=(key:string)=>!/^sb-.+-auth-token(?:-code-verifier)?$/.test(key);
export const LEGACY_MIGRATION_CONFLICT_PREFIX='jackyun_migration_conflict_v1:';
const migrationConflicts:string[]=[];
export function getLegacyMigrationConflicts():string[]{return [...migrationConflicts];}
export const LOCAL_DURABILITY_EVENT='jackyun-local-durability';
function status(state:'saving'|'saved'|'storage_error'|'projection_degraded') {
  saveState=state;
  window.dispatchEvent(new CustomEvent(LOCAL_DURABILITY_EVENT,{detail:{state,pending}}));
}
function notifyChanged(key:string,value:string|null,source='repository'):void {
  crossTabChannel?.postMessage({key,value,owner:currentOwner??'guest'});
  window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT,{detail:{source,keys:[key]}}));
}
export function initializeRepository(userId:string|null):Promise<void> {
  if(ready&&currentOwner===userId)return ready;
  const previous=ready,previousWrites=tail;currentOwner=userId;
  ready=(async()=>{
    if(previous)await previous;
    // Drain writes against their captured repository before changing the active DB.
    // A write cannot await this initialization while initialization waits for it.
    await previousWrites;
    if(failures.size)throw failures.values().next().value!.error;
    const projectedOwner=await projectionOwner();
    if(projectedOwner&&projectedOwner!==(userId??'guest')){
      await bindSyncUser(projectedOwner);
      const legacy=window.localStorage,keys=Array.from({length:legacy.length},(_,index)=>legacy.key(index)).filter((key):key is string=>key!==null&&isManagedLocalKey(key));
      const oldDocuments=await getDocuments();
      for(const key of keys){if(!isSyncableStorageKey(key))continue;const value=legacy.getItem(key);if(value===null)continue;
        const row=oldDocuments.find(candidate=>candidate.key===key);
        if(row&&row.value!==value&&row.projectedValue!==value){if(row.projectedValue===undefined)throw Error(`旧账号的本机副本与 IndexedDB 不一致，原数据已保留：${key}`);await persistDocument(key,value,true,row.projectedValue);}
        else if(!row)await persistDocument(key,value,true);
        if(!(await getDocuments()).some(candidate=>candidate.key===key))throw Error(`旧账号数据迁移未验证：${key}`);
        legacy.removeItem(key);
      }
      await clearDocumentProjections(`jackyun-sync-v2:${projectedOwner}`);
      for(const key of memory.keys())if(isSyncableStorageKey(key))memory.delete(key);
    }
    if(userId)await bindSyncUser(userId);else activateGuestRepository();
    await projectionOwner(userId??'guest');
    const legacy=window.localStorage,documents=await getDocuments(),known=new Map(documents.map(row=>[row.key,row.value]));
    const localRows=await readLocalData();localMemory.clear();
    for(const row of localRows)localMemory.set(row.key,row.value);
    const legacyKeys=Array.from({length:legacy.length},(_,index)=>legacy.key(index)).filter((key):key is string=>key!==null);
    for(const key of legacyKeys){if(!isManagedLocalKey(key))continue;const value=legacy.getItem(key);if(value===null)continue;
      if(isSyncableStorageKey(key)){
        const row=documents.find(candidate=>candidate.key===key);
        if(row&&row.value!==value&&row.projectedValue!==value){
          if(row.projectedValue===undefined)throw Error(`本机旧副本与 IndexedDB 不一致，已保留原数据供恢复：${key}`);
          await persistDocument(key,value,Boolean(userId),row.projectedValue);
        }else if(!known.has(key))await persistDocument(key,value,Boolean(userId));
        const stored=(await getDocuments()).find(row=>row.key===key)?.value;
        if(stored===undefined)throw Error(`旧数据迁移未验证：${key}`);
        memory.set(key,stored);
      }else{
        if(localMemory.has(key)&&localMemory.get(key)!==value){
          const suffix=typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const preservedKey=`${LEGACY_MIGRATION_CONFLICT_PREFIX}${encodeURIComponent(key)}:${suffix}`;
          const preservedValue=JSON.stringify({sourceKey:key,value,capturedAt:new Date().toISOString()});
          await writeLocalData(preservedKey,preservedValue);
          const preserved=(await readLocalData()).find(row=>row.key===preservedKey)?.value;
          if(preserved!==preservedValue)throw Error(`本机旧副本与 IndexedDB 不一致，原数据已保留供恢复：${key}`);
          localMemory.set(preservedKey,preservedValue);
          migrationConflicts.push(key);
          window.dispatchEvent(new CustomEvent('jackyun-local-migration-conflict',{detail:{key,preservedKey}}));
        }
        if(!localMemory.has(key))await writeLocalData(key,value);
        const verified=(await readLocalData()).find(row=>row.key===key)?.value;
        if(verified!==value&&!localRows.some(row=>row.key===key&&row.value===verified))throw Error(`旧数据迁移未验证：${key}`);
        if(!localMemory.has(key))localMemory.set(key,verified??value);
      }
    }
    // Delete legacy copies only after every value has been confirmed in IndexedDB.
    for(const key of legacyKeys){if(isManagedLocalKey(key)&&((isSyncableStorageKey(key)&&memory.has(key)&&memory.get(key)!==null)||(!isSyncableStorageKey(key)&&localMemory.has(key)&&localMemory.get(key)!==null)))legacy.removeItem(key);}
    await clearDocumentProjections();
    for(const row of await getDocuments())memory.set(row.key,row.value);
    await projectionOwner(userId??'guest');
    installStorageCompatibility();
    failed=failures.values().next().value?.error??null;
    if(!pending&&!failed)status('saved');
    window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT,{detail:{source:'repository',keys:[...memory.keys()]}}));
  })().catch(error=>{ready=null;failed=error;status('storage_error');throw error;});
  return ready;
}
function enqueue(key:string,value:string|null,expected?:string|null) {
  const repositoryReady=ready??initializeRepository(currentOwner??null),owner=currentOwner;
  pending++;status('saving');
  tail=tail.catch(()=>{}).then(async()=>{
    if(repositoryReady)await repositoryReady;
    if(await projectionOwner()!==(owner??'guest'))throw Error('当前账号已在另一标签页切换，本机草稿保留。');
    const queueLegacy=!(key==='jackyun_schedule_control_v1'&&v5ScheduleAuthority)&&!v5WorkspaceAuthorityKeys.has(key);
    try{if(isSyncableStorageKey(key))await persistDocument(key,value,queueLegacy,expected);else await writeLocalData(key,value);}catch(error){
      if((error as {name?:string}).name!=='QuotaExceededError')throw error;
      await evictDownloadCache();if(isSyncableStorageKey(key))await persistDocument(key,value,queueLegacy,expected);else await writeLocalData(key,value);
    }
    if(isSyncableStorageKey(key)){const row=(await getDocuments()).find(row=>row.key===key);if(row&&memory.get(key)===value)memory.set(key,row.value);}
    notifyChanged(key,value);
    window.dispatchEvent(new Event('jackyun-sync-edit'));
    failures.delete(key);failed=failures.values().next().value?.error??null;
  }).catch(error=>{failures.set(key,{value,error,expected});failed=error;status('storage_error');}).finally(()=>{pending--;if(!pending&&!failed)status('saved');});
}
function installStorageCompatibility():void {
  if(compatibilityInstalled||typeof Storage==='undefined')return;
  compatibilityInstalled=true;
  const prototype=Storage.prototype,nativeGet=prototype.getItem,nativeSet=prototype.setItem,nativeRemove=prototype.removeItem,nativeClear=prototype.clear,nativeKey=prototype.key;
  const local=window.localStorage;
  nativeLocalRemove=nativeRemove;nativeLocalGet=nativeGet;
  prototype.getItem=function(key:string){return this===local&&ready&&isManagedLocalKey(String(key))?workspaceStorage.getItem(String(key)):nativeGet.call(this,key);};
  prototype.setItem=function(key:string,value:string){if(this===local&&ready&&isManagedLocalKey(String(key))){workspaceStorage.setItem(String(key),String(value));return;}nativeSet.call(this,key,value);};
  prototype.removeItem=function(key:string){if(this===local&&ready&&isManagedLocalKey(String(key))){workspaceStorage.removeItem(String(key));return;}nativeRemove.call(this,key);};
  const nativeLength=Object.getOwnPropertyDescriptor(prototype,'length')?.get;
  prototype.clear=function(){if(this===local&&ready){for(const key of Object.keys(workspaceStorage.snapshot()))workspaceStorage.removeItem(key);const total=nativeLength?.call(local)??0;for(let n=total-1;n>=0;n--){const key=nativeKey.call(local,n);if(key&&isManagedLocalKey(key))nativeRemove.call(local,key);}return;}nativeClear.call(this);};
  prototype.key=function(index:number){if(this===local&&ready){const managed=[...Object.keys(workspaceStorage.snapshot())],native:string[]=[],total=nativeLength?.call(local)??0;for(let i=0;i<total;i++){const key=nativeKey.call(local,i);if(key&&!isManagedLocalKey(key))native.push(key);}return [...managed,...native][index]??null;}return nativeKey.call(this,index);};
  const descriptor=Object.getOwnPropertyDescriptor(prototype,'length');
  if(descriptor?.get)Object.defineProperty(prototype,'length',{...descriptor,get:function(){if(this!==local||!ready)return descriptor.get!.call(this);let count=workspaceStorage.length;const total=nativeLength?.call(local)??0;for(let i=0;i<total;i++){const key=nativeKey.call(local,i);if(key&&!isManagedLocalKey(key))count++;}return count;}});
  if(typeof BroadcastChannel!=='undefined'){
    crossTabChannel=new BroadcastChannel('jackyun-indexeddb-storage');
    crossTabChannel.onmessage=event=>{const row=event.data as {key?:unknown;value?:unknown;owner?:unknown};if(typeof row.key!=='string'||(row.value!==null&&typeof row.value!=='string')||row.owner!==(currentOwner??'guest'))return;
      const target=isSyncableStorageKey(row.key)?memory:localMemory;
      if(row.value===null)target.delete(row.key);else target.set(row.key,row.value);
      window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT,{detail:{source:'repository',keys:[row.key]}}));
      window.dispatchEvent(new StorageEvent('storage',{key:row.key,newValue:row.value as string|null,storageArea:local}));
    };
  }
}
export async function flushLocalWrites():Promise<void>{
  await tail;
  if(failures.size&&ready){for(const [key,draft]of [...failures])enqueue(key,draft.value,draft.expected);await tail;}
  if(failed)throw failed;
}
/** Source imports never replace an existing row, including a concurrently committed tombstone. */
export async function importRepositoryRecordIfMissing(key:string,value:string):Promise<boolean>{
  const context=await captureRepositoryContext();
  await flushLocalWrites();context.assertCurrent();
  if(workspaceStorage.getItem(key)!==null)return false;
  const applied=await persistDocument(key,value,!v5WorkspaceAuthorityKeys.has(key),undefined,{onlyIfMissing:true,databaseScope:context.databaseScope});
  context.assertCurrent();
  if(await projectionOwner()!==(context.owner??'guest'))throw Error('另一标签页已切换账号，导入保留在原账号仓库。');
  context.assertCurrent();
  if(applied){memory.set(key,value);context.assertCurrent();window.dispatchEvent(new CustomEvent('jackyun-sync-edit'));}
  return applied;
}
/** Legacy readers see pending drafts immediately; saved is announced only after IDB commit. */
export const workspaceStorage={
  flush:flushLocalWrites,
  snapshot():Record<string,string>{
    const result:Record<string,string>={};
    for(const [key,value]of localMemory){if(value===null)delete result[key];else result[key]=value;}
    for(const [key,value]of memory){if(value===null)delete result[key];else result[key]=value;}
    return result;
  },
  getItem(key:string):string|null {const target=isSyncableStorageKey(key)?memory:localMemory;if(target.has(key))return target.get(key)??null;try{return nativeLocalGet?.call(window.localStorage,key)??null;}catch{return null;}},
  setItem(key:string,value:string):void {value=String(value);if(!ready){window.localStorage.setItem(key,value);return;}const previous=workspaceStorage.getItem(key);(isSyncableStorageKey(key)?memory:localMemory).set(key,value);enqueue(key,value,previous);},
  removeItem(key:string):void {if(!ready){window.localStorage.removeItem(key);return;}const previous=workspaceStorage.getItem(key);(isSyncableStorageKey(key)?memory:localMemory).set(key,null);enqueue(key,null,previous);},
  key(index:number):string|null {return [...new Set([...localMemory.keys(),...memory.keys()])].filter(key=>workspaceStorage.getItem(key)!==null)[index]??null;},
  get length():number {return [...new Set([...localMemory.keys(),...memory.keys()])].filter(key=>workspaceStorage.getItem(key)!==null).length;},
};
/** Same-origin iframe Storage events are not consistently delivered to parents. */
export function captureLegacyStorageEdit(key:string,value?:string|null):void {
  if(value===undefined)value=window.localStorage.getItem(key);
  if(value===null)workspaceStorage.removeItem(key);else workspaceStorage.setItem(key,value);
  try{nativeLocalRemove?.call(window.localStorage,key);}catch{/* IndexedDB copy remains authoritative. */}
}
/** Remote application persists first, then updates the compatibility projection. */
export async function applyRepositoryRecord(key:string,value:string|null,expected?:string|null):Promise<void>{
  await flushLocalWrites();if(!await persistDocument(key,value,false,expected))throw Error('本机内容已变化，云端应用推迟到下一轮。');memory.set(key,value);notifyChanged(key,value);
}
/** Reflects a value already committed together with its v5 records and cursor. */
export async function projectCommittedRepositoryRecord(key:string,value:string|null):Promise<void>{
  memory.set(key,value);notifyChanged(key,value,'v5');
}
export async function projectLegacyCloudBaseline(key:string,value:string|null,expected:string|null):Promise<void>{
  const owner=currentOwner;
  if(await projectionOwner()!==(owner??'guest')||currentOwner!==owner)return;
  if(workspaceStorage.getItem(key)!==expected&&workspaceStorage.getItem(key)!==value)return;
  const failure=failures.get(key);if(failure&&failure.value===expected)failures.delete(key);
  failed=failures.values().next().value?.error??null;
  await projectCommittedRepositoryRecord(key,value);
  if(!pending&&!failed)status('saved');
}
export function exportLocalRecovery():string {
  return JSON.stringify({version:2,exportedAt:new Date().toISOString(),values:Object.fromEntries([...localMemory,...memory]),failedDrafts:Object.fromEntries([...failures].map(([key,draft])=>[key,{value:draft.value,expected:draft.expected}])),compatibilityProjection:{}},null,2);
}
